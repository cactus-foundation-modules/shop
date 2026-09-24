import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireShopUser } from '@/modules/shop/lib/access'
import { listOrders, createPendingOrder } from '@/modules/shop/lib/db'
import { getOrderRowMetrics, getOrdersOverview } from '@/modules/shop/lib/db/orders'
import { parseOrderListFilter } from '@/modules/shop/lib/order-filters'
import { resolveCartLines, resolveOrderTotals } from '@/modules/shop/lib/checkout'
import { findShippingZoneForPostcode } from '@/modules/shop/lib/db/tax-shipping'
import { generateOrderNumber } from '@/modules/shop/lib/order-number'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import { applyOrderPaymentState } from '@/modules/shop/lib/order-payment-state'
import { listStrandedPayments } from '@/modules/shop/lib/stranded-payments'
import { BoundedAddressSchema, customerNameField, phoneField } from '@/modules/shop/lib/address-limits'
import { MEMBER_CART_MAX_LINES } from '@/modules/shop/lib/db/member-cart'
import { BILLING_COMPANY_MAX_LENGTH } from '@/modules/shop/lib/customer-billing'
import { CUSTOMER_REFERENCE_MAX_LENGTH } from '@/modules/shop/lib/customer-reference'

export async function GET(request: NextRequest) {
  const gate = await requireShopUser('shop.orders', { allowAccess: true })
  if (gate.error) return gate.error

  const params = request.nextUrl.searchParams
  const { orders, total } = await listOrders(parseOrderListFilter(params))

  // Row metrics are one query for the whole page, not one per row. The overview
  // counters are asked for separately (`stats=1`) so paging through a list does
  // not re-run four aggregates over every order in the shop each time.
  // Stranded payments ride along with the overview rather than on their own
  // route: they belong to the same once-per-load request the counters already
  // make, and a shop that has none - which is every shop, almost always - pays
  // one cheap COUNT for the reassurance. See lib/stranded-payments.
  const [metrics, overview, stranded] = await Promise.all([
    getOrderRowMetrics(orders.map((o) => o.id)),
    params.get('stats') === '1' ? getOrdersOverview() : Promise.resolve(null),
    params.get('stats') === '1' ? listStrandedPayments() : Promise.resolve(null),
  ])

  return NextResponse.json({ orders, total, metrics, overview, stranded })
}

// The delivery address is the shared bounded shape (lib/address-limits.ts) the
// checkout writes, so an order keyed in by hand cannot carry a line the order
// hub or a courier label would then refuse. No company field: the organisation
// is a contact detail on the order now (customerOrganisation below), not part
// of an address.
//
// The lines take the member basket's ceiling. A phone order is a basket an
// admin types in for somebody, and each line is resolved and priced in full
// below, so a pasted or scripted list of thousands is turned away here rather
// than priced.
const Body = z.object({
  lines: z.array(z.object({ productId: z.string(), quantity: z.number().int().min(1) }))
    .max(MEMBER_CART_MAX_LINES, `An order can have at most ${MEMBER_CART_MAX_LINES} lines.`),
  // 254 is the longest address the email standards allow.
  customerEmail: z.string().email().max(254),
  customerName: customerNameField,
  customerOrganisation: z.string()
    .max(BILLING_COMPANY_MAX_LENGTH, `Organisation name is too long - ${BILLING_COMPANY_MAX_LENGTH} characters at most.`)
    .optional(),
  customerReference: z.string()
    .max(CUSTOMER_REFERENCE_MAX_LENGTH, `Purchase order number is too long - ${CUSTOMER_REFERENCE_MAX_LENGTH} characters at most.`)
    .optional(),
  customerPhone: phoneField.optional(),
  shippingAddress: BoundedAddressSchema,
  paymentMethod: z.enum(['STRIPE', 'PAYPAL', 'BANK_TRANSFER', 'CASH']),
})

// Manual order creation (spec 8.3 POST /admin/orders) - phone/mail-order style
// sales an admin enters directly. Created PENDING; use confirm-payment to mark paid.
export async function POST(request: NextRequest) {
  const gate = await requireShopUser('shop.orders')
  if (gate.error) return gate.error

  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid order' }, { status: 400 })
  const data = parsed.data

  const config = await getShopConfigCached()
  // Staff may sell a spare part by hand; the shop's own baskets may not.
  const resolvedLines = await resolveCartLines(data.lines, { includeParts: true })
  if (resolvedLines.length === 0) return NextResponse.json({ error: 'No valid items' }, { status: 400 })

  const zone = await findShippingZoneForPostcode(data.shippingAddress.postcode)
  const totals = await resolveOrderTotals({ lines: resolvedLines, zoneId: zone?.id ?? null, shippingRateId: null, couponCode: null, customerEmail: data.customerEmail })
  const orderNumber = await generateOrderNumber()

  const { id } = await createPendingOrder({
    orderNumber,
    customerEmail: data.customerEmail,
    customerName: data.customerName,
    customerOrganisation: data.customerOrganisation?.trim() || null,
    // Taken whether or not the box is switched on at checkout: an order typed in
    // by hand is very often the trade one that came with a purchase order number
    // over the telephone.
    customerReference: data.customerReference?.trim() || null,
    customerPhone: data.customerPhone ?? null,
    shippingAddress: data.shippingAddress,
    subtotal: totals.subtotal,
    discountAmount: totals.discountAmount,
    shippingAmount: totals.shippingAmount,
    taxAmount: totals.taxAmount,
    total: totals.total,
    taxMode: totals.taxMode,
    currency: config.currency,
    paymentMethod: data.paymentMethod,
    items: totals.lineItems.map((l) => ({
      productId: l.product.id, productName: l.product.name, productSku: l.product.sku, saleSku: l.saleSku, productType: l.product.type,
      quantity: l.quantity, unitPrice: l.unitPrice, taxRate: l.taxRate, taxAmount: l.taxAmount, total: l.lineTotal,
      isPreOrder: l.isPreOrder, preOrderDispatchDate: l.product.preOrderDispatchDate, lineMeta: l.lineMeta,
      orderSizeDeduction: l.orderSizeDeduction ?? null,
      returnable: l.returnable, nonReturnableNote: l.nonReturnableNote,
      returnsDiscretionary: l.returnsDiscretionary,
    })),
  })

  // An order taken over the phone is unpaid on a method of the owner's choosing,
  // exactly like one placed at the checkout, so its lines get the same chance to
  // say what that means (see lib/order-payment-state.ts). No notes to show here -
  // this is the admin, and the customer is the one who reads them.
  await applyOrderPaymentState(id)

  return NextResponse.json({ id, orderNumber }, { status: 201 })
}
