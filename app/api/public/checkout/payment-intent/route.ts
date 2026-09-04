import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { blockedLinesMessage, resolveCartLines, resolveOrderTotals, round2 } from '@/modules/shop/lib/checkout'
import { findShippingZoneForPostcode, getShippingRateById } from '@/modules/shop/lib/db/tax-shipping'
import { createPendingOrder, type CreateOrderInput } from '@/modules/shop/lib/db/orders'
import { createCheckoutDraft } from '@/modules/shop/lib/checkout-draft'
import { generateOrderNumber } from '@/modules/shop/lib/order-number'
import { getShopConfigCached, getAvailablePaymentMethods, orderValueRefusal, resolveCheckoutAgreements } from '@/modules/shop/lib/config'
import { resolveShopCommerceMode } from '@/modules/shop/lib/commerce-mode'
import { formatMoney } from '@/modules/shop/lib/money'
import { getPaymentProvider } from '@/modules/shop/lib/payments/registry'
import { applyOrderPaymentState, previewOrderPaymentNotes } from '@/modules/shop/lib/order-payment-state'
import { signOrderReceiptToken } from '@/modules/shop/lib/order-receipt-token'
import { getMemberFromCookie } from '@/lib/members/session'
import { fillBlankMemberContactDetails } from '@/lib/members/contact'
import { checkInMemoryRateLimit, getClientIpFromRequest } from '@/modules/shop/lib/rate-limit'
import { isValidUkPhone, UK_PHONE_MESSAGE } from '@/modules/shop/lib/phone'
import type { ShpAddress } from '@/modules/shop/lib/types'

// No company field: the organisation is a contact detail on the order now, not
// part of an address. Older clients that still send one are simply ignored - zod
// strips unknown keys - which is what keeps a shopper mid-checkout on a cached
// page from being turned away by the deploy that moved the box.
const AddressSchema = z.object({
  firstName: z.string().min(1), lastName: z.string().min(1),
  line1: z.string().min(1), line2: z.string().optional(), city: z.string().min(1), county: z.string().optional(),
  postcode: z.string().min(1), country: z.string().min(2).default('GB'), phone: z.string().optional(),
})

const Body = z.object({
  lines: z.array(z.object({
    productId: z.string(),
    quantity: z.number().int().min(1),
    lineId: z.string().optional(),
    meta: z.record(z.unknown()).optional(),
  })),
  customerEmail: z.string().email(),
  customerName: z.string().min(1),
  customerOrganisation: z.string().optional(),
  customerReference: z.string().optional(),
  customerPhone: z.string().optional(),
  shippingAddress: AddressSchema,
  billingAddress: AddressSchema.nullable().optional(),
  shippingRateId: z.string().nullable().optional(),
  couponCode: z.string().nullable().optional(),
  paymentMethod: z.string().min(1),
  // Which checkout tickboxes the shopper ticked, keyed by agreement id. Ids
  // only - the wording that goes on the order is taken from the shop's own
  // settings below, never from the browser.
  agreements: z.record(z.boolean()).optional(),
})

// PROTECTED - creates the provider intent, and either the PENDING order (Q8) or
// the checkout draft that will become one, depending on the method. Stock is not
// decremented here (only on ship/paid, see product PUT and confirm route).
//
// Which of the two it is comes off the provider's own `orderCreation`. A method
// that takes the money here and now gets its order straight away, because there
// is a payment about to happen against it. A method that sends the shopper off
// to their bank or to a hosted card page gets a draft instead - see
// lib/checkout-draft.ts for why an order that nobody has paid for is worse than
// no order at all.
export async function POST(request: NextRequest) {
  // This endpoint creates a real DB order row AND a live provider intent (Stripe
  // PaymentIntent / PayPal order) on every call, so it is the most expensive
  // public mutating route - rate-limit it per IP like apply-coupon/back-in-stock.
  const ip = getClientIpFromRequest(request)
  if (!checkInMemoryRateLimit(`payment-intent:${ip}`, 10, 15 * 60 * 1000)) {
    return NextResponse.json({ error: 'Too many attempts, please try again in a little while.' }, { status: 429 })
  }

  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 })
  const data = parsed.data

  const config = await getShopConfigCached()
  if (config.shopStatus !== 'OPEN') return NextResponse.json({ error: 'The shop is not currently accepting orders.' }, { status: 503 })
  // This is where an order first exists, so this is the gate that matters on a
  // quote-only shop: refuse here and no order, and no payment, can be started.
  // /checkout/confirm is deliberately left alone - it only finishes an order that
  // already exists, and blocking it would strand anything paid for a moment
  // before the owner threw the switch.
  const commerce = await resolveShopCommerceMode()
  if (commerce.mode === 'quote') return NextResponse.json({ error: commerce.blockedMessage }, { status: 503 })

  const available = await getAvailablePaymentMethods()
  if (!available.includes(data.paymentMethod)) return NextResponse.json({ error: 'Selected payment method is not available.' }, { status: 400 })

  // An organisation the owner has made compulsory has to be enforced where the
  // order is actually made, not only in the form: the contact step's `required`
  // attribute is a courtesy to the shopper, and this route is reachable without
  // it. Checked against the trimmed value, so a space is not an organisation.
  if (config.organisationFieldEnabled && config.organisationRequired && !data.customerOrganisation?.trim()) {
    const label = config.organisationLabel.trim() || 'Organisation name'
    return NextResponse.json({ error: `${label} is required.` }, { status: 400 })
  }

  // And the customer's own reference, where the owner has made it compulsory.
  // Same reasoning: the box on the contact step is a courtesy, this route is
  // where an order actually becomes one.
  if (config.customerReferenceFieldEnabled && config.customerReferenceRequired && !data.customerReference?.trim()) {
    const label = config.customerReferenceLabel.trim() || 'Purchase order number'
    return NextResponse.json({ error: `${label} is required.` }, { status: 400 })
  }

  // And the phone number, for the same reason: the contact step marks the box
  // compulsory when the owner has asked for one, but the rule only actually
  // holds where the order is made. Trimmed, so a space is not a phone number.
  const typedPhone = data.customerPhone?.trim() ?? ''
  if (config.requirePhone && typedPhone.length === 0) {
    return NextResponse.json({ error: 'A phone number is required.' }, { status: 400 })
  }
  // A number that was given has to be one somebody can actually ring, whether or
  // not the shop insists on having one. Checked here as well as in the box so an
  // order placed by any other route stores the same thing the checkout would.
  if (typedPhone.length > 0 && !isValidUkPhone(typedPhone)) {
    return NextResponse.json({ error: UK_PHONE_MESSAGE }, { status: 400 })
  }

  // Same reasoning for the tickboxes, and rather more at stake: an order placed
  // without the terms box ticked is an order with no record that they were ever
  // agreed to, which is the entire point of asking. The statements are read
  // from settings here rather than taken from the request, so what gets written
  // onto the order is the shop's own wording and cannot be forged by a client
  // posting whatever text it fancies.
  const requiredAgreements = await resolveCheckoutAgreements(config)
  const ticked = data.agreements ?? {}
  const unticked = requiredAgreements.find((a) => a.required && ticked[a.id] !== true)
  if (unticked) {
    return NextResponse.json({ error: 'Please tick the boxes marked required before placing your order.' }, { status: 400 })
  }
  const now = new Date().toISOString()
  const agreementRecord = requiredAgreements.length > 0
    ? requiredAgreements.map((a) => ({
        id: a.id,
        statement: a.statement,
        linkUrl: a.linkUrl,
        required: a.required,
        accepted: ticked[a.id] === true,
        // Only a tick has a time. Recording "declined at 14:32" on an optional
        // box nobody touched would invent a decision that was never made.
        acceptedAt: ticked[a.id] === true ? now : null,
      }))
    : null

  const resolvedLines = await resolveCartLines(data.lines)
  const blocked = resolvedLines.filter((l) => !l.available)
  if (blocked.length > 0 || resolvedLines.length === 0) {
    // Names both the reason and the product where the lines agree - see
    // blockedLinesMessage. This string is the whole of what the shopper is told,
    // so it has to stand on its own.
    return NextResponse.json({ error: blockedLinesMessage(blocked) }, { status: 409 })
  }

  const zone = await findShippingZoneForPostcode(data.shippingAddress.postcode)
  const totals = await resolveOrderTotals({
    lines: resolvedLines,
    zoneId: zone?.id ?? null,
    shippingRateId: data.shippingRateId ?? null,
    couponCode: data.couponCode ?? null,
    customerEmail: data.customerEmail,
  })

  // Enforce the same min/max order-value gate the checkout-session route applies.
  // The session route only advises the browser; this route actually creates a
  // payable order, so a direct POST that skips the session step must be caught
  // here or a below-minimum (or over-maximum) cart yields a chargeable order.
  if (config.minimumOrderValue != null && totals.subtotal < config.minimumOrderValue) {
    return NextResponse.json({ error: `Minimum order value is ${formatMoney(config.minimumOrderValue, config.currencySymbol)}` }, { status: 400 })
  }
  if (config.maximumOrderValue != null && totals.subtotal > config.maximumOrderValue) {
    return NextResponse.json({ error: `Maximum order value is ${formatMoney(config.maximumOrderValue, config.currencySymbol)}` }, { status: 400 })
  }

  // And the per-method size limits, against what this order actually comes to -
  // VAT and delivery included, discount taken off, which is the figure the
  // provider is about to be handed. The checkout only offers the methods that
  // fit; this is where the rule is actually kept, because the list the browser
  // was given is a list the browser can ignore, and a page left open while the
  // basket changed in another tab was given a list that was true at the time.
  const refusal = await orderValueRefusal(data.paymentMethod, totals.total)
  if (refusal) return NextResponse.json({ error: refusal }, { status: 400 })

  // No mixed-cart gate here, and that is deliberate rather than an oversight.
  // `preOrderMixedCartBehaviour` has exactly two values and neither one forbids
  // a cart that mixes pre-order and in-stock items:
  //   HOLD_ALL     - accept the order, hold the whole dispatch until every item
  //                  is in stock. A fulfilment policy, not a checkout rule.
  //   PROMPT_SPLIT - accept the order and offer to ship the in-stock items
  //                  separately. A shipping choice, not a checkout rule.
  // The storefront agrees: nothing on the client reads the setting, and the
  // checkout review step uses `hasPreOrderItems` only to print a notice - it
  // never blocks the Place order button. Rejecting a mixed cart here would
  // invent a restriction the shop owner never asked for and would stop real
  // customers paying, so the setting stays advisory until it gains a value
  // that actually means "refuse". The genuine pre-order limit - the per-product
  // `preOrderMaxQuantity` cap - is already enforced above, via resolveCartLines
  // marking the line unavailable and the 409 that follows.

  // Resolved before anything is written: a method with no provider behind it
  // cannot be paid for, so there is no sense in an order (or a draft) for it.
  const provider = getPaymentProvider(data.paymentMethod)
  if (!provider) return NextResponse.json({ error: 'Selected payment method is not available.' }, { status: 400 })

  const shippingRate = data.shippingRateId ? await getShippingRateById(data.shippingRateId) : null
  const member = await getMemberFromCookie().catch(() => null)

  // A signed-in shopper who has just typed their name and their company into
  // the checkout should not be asked for them again next time. Core fills in
  // blanks only, so anything already on their account stands (see
  // lib/members/contact.ts). Before the order rather than after, so the two
  // payment paths below - the drafted one and the created one - both get it
  // without saying it twice.
  if (member) {
    await fillBlankMemberContactDetails(member.id, {
      fullName: data.customerName,
      organisation: config.organisationFieldEnabled ? data.customerOrganisation : null,
    })
  }

  const orderNumber = await generateOrderNumber()

  const orderInput: CreateOrderInput = {
    orderNumber,
    memberId: member?.id ?? null,
    customerEmail: data.customerEmail,
    customerName: data.customerName,
    // Only kept when the shop actually asks for one, so switching the box off
    // stops orders carrying whatever a stale page still had in it.
    customerOrganisation: config.organisationFieldEnabled ? (data.customerOrganisation?.trim() || null) : null,
    // Same rule as the organisation above: only kept while the shop is actually
    // asking for one, so switching the box off stops orders carrying whatever a
    // stale page still had in it.
    customerReference: config.customerReferenceFieldEnabled ? (data.customerReference?.trim() || null) : null,
    customerPhone: data.customerPhone ?? null,
    shippingAddress: data.shippingAddress as ShpAddress,
    // Same rule as the two fields above: only kept while the shop is actually
    // asking for one, so switching the setting off stops orders carrying
    // whatever a stale page still had in it. An order without one bills to the
    // delivery address, which is what every screen that prints a billing
    // address already falls back to.
    billingAddress: config.billingAddressEnabled ? ((data.billingAddress as ShpAddress | null) ?? null) : null,
    subtotal: totals.subtotal,
    discountAmount: totals.discountAmount,
    shippingAmount: totals.shippingAmount,
    taxAmount: totals.taxAmount,
    total: totals.total,
    taxMode: totals.taxMode,
    currency: config.currency,
    couponId: totals.couponId, // the coupon actually resolved server-side, if any
    // Only record the code when a coupon genuinely resolved. Storing the raw
    // client code for a rejected coupon (expired/maxed) let fulfilment later
    // burn that coupon's usage against an order it never discounted.
    couponCode: totals.couponId ? (data.couponCode ?? null) : null,
    paymentMethod: data.paymentMethod,
    shippingRateId: shippingRate?.id ?? null,
    shippingRateName: shippingRate?.name ?? null,
    agreements: agreementRecord,
    items: totals.lineItems.map((l) => ({
      productId: l.product.id,
      productName: l.product.name,
      productSku: l.product.sku,
      productType: l.product.type,
      quantity: l.quantity,
      // Rounded here rather than left to the column. These are floats until they
      // hit NUMERIC(10,2), and letting Postgres round each one independently let
      // the item rows add up to a penny either side of the order's own subtotal -
      // which is the sort of thing that turns up on a customer's receipt.
      unitPrice: round2(l.unitPrice),
      taxRate: l.taxRate,
      taxAmount: round2(l.taxAmount),
      total: round2(l.lineTotal),
      isPreOrder: l.isPreOrder,
      preOrderDispatchDate: l.product.preOrderDispatchDate,
      lineMeta: l.lineMeta,
    })),
  }

  // A method that settles on somebody else's site: draft the order, do not
  // create it. The draft mints the id the order will be given, so the intent
  // below - and the module row and return URL it goes on to write - name the
  // same id the order will have when the money arrives.
  if (provider.orderCreation === 'on-payment') {
    const draft = await createCheckoutDraft(orderInput)

    // The look-ahead form of the notes below. There is no order to restate the
    // lines of yet, so this only asks the modules what they would say about this
    // method and prints it - see previewOrderPaymentNotes. The real call happens
    // when the order is created, on settlement.
    const notes = await previewOrderPaymentNotes(data.paymentMethod, resolvedLines)

    const draftIntent = await provider.createIntent({
      orderId: draft.id, orderNumber, amount: totals.total, currency: config.currency,
      customerEmail: data.customerEmail, customerName: data.customerName,
    })

    return NextResponse.json({
      orderId: draft.id, orderNumber, receiptToken: signOrderReceiptToken(orderNumber), ...draftIntent, notes,
    })
  }

  const { id: orderId } = await createPendingOrder(orderInput)

  // The order now exists AND knows how it is being paid for, which is the first
  // moment anything can say what that means for these lines. A method that takes
  // the money here and now changes nothing; one that leaves the order unpaid
  // (bank transfer) lets a module restate what it promised - and hand back a
  // sentence for the checkout explaining why. See lib/order-payment-state.ts.
  const notes = await applyOrderPaymentState(orderId)

  const intent = await provider.createIntent({
    orderId, orderNumber, amount: totals.total, currency: config.currency,
    customerEmail: data.customerEmail, customerName: data.customerName,
  })

  // The confirmation link's proof, issued here so the browser never has to put
  // the customer's email in a URL to get back to their own receipt. See
  // lib/order-receipt-token.
  return NextResponse.json({ orderId, orderNumber, receiptToken: signOrderReceiptToken(orderNumber), ...intent, notes })
}
