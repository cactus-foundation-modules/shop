import { NextRequest, NextResponse } from 'next/server'
import { getOrderByNumber, getOrderByNumberAndEmail, getOrderItems } from '@/modules/shop/lib/db/orders'
import { getProductMediaForProducts } from '@/modules/shop/lib/db/products'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import { getPaymentProvider, getPaymentMethodLabels } from '@/modules/shop/lib/payments/registry'
import { shopClosedResponse } from '@/modules/shop/lib/access'
import { checkInMemoryRateLimit, getClientIpFromRequest } from '@/modules/shop/lib/rate-limit'
import { verifyOrderReceiptToken } from '@/modules/shop/lib/order-receipt-token'
import { getOrderNotifyChannels } from '@/modules/shop/lib/order-notify'
import { isSmsAvailable } from '@/lib/sms/send'
import { getMembersConfig, type MembersConfig } from '@/lib/members/config'
import { getMemberAreaPath } from '@/lib/members/paths'
import { prisma } from '@/lib/db/prisma'

// Preferred display names for the built-in methods; anything else falls back to
// the provider's own registered label, then the raw code.
const BUILT_IN_METHOD_LABELS: Record<string, string> = {
  STRIPE: 'Card', PAYPAL: 'PayPal', BANK_TRANSFER: 'Bank transfer', CASH: 'Cash',
}

// Guest order lookup: order number + email must both match - no enumeration (spec 8.1).
export async function GET(request: NextRequest) {
  const closed = await shopClosedResponse()
  if (closed) return closed

  // Order numbers are a prefix and a sequence (DW000123 - see lib/order-number),
  // so half the pair is not a secret at all and the email is the whole lock.
  // Unthrottled, that lock can be picked at whatever rate the network allows,
  // and what falls out is the customer's name, full delivery address and order
  // total. Every other public route here is limited; this one was the gap.
  const ip = getClientIpFromRequest(request)
  if (!checkInMemoryRateLimit(`order-status:${ip}`, 20, 15 * 60 * 1000)) {
    return NextResponse.json({ error: 'Too many attempts, please try again in a little while.' }, { status: 429 })
  }

  const orderNumber = request.nextUrl.searchParams.get('orderNumber')
  const email = request.nextUrl.searchParams.get('email')
  // Two ways to prove which order may be shown, and they are for two different
  // callers. `email` is the guest order-LOOKUP form, where the shopper types
  // both halves - untouched. `t` is the signed token on the confirmation link
  // the shop hands out itself, which used to carry the customer's email in the
  // query string instead. See lib/order-receipt-token.
  const token = request.nextUrl.searchParams.get('t')
  if (!orderNumber || (!email && !token)) {
    return NextResponse.json({ error: 'orderNumber and email are required' }, { status: 400 })
  }

  const order = verifyOrderReceiptToken(orderNumber, token)
    ? await getOrderByNumber(orderNumber)
    : email
      ? await getOrderByNumberAndEmail(orderNumber, email)
      : null
  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })

  const items = await getOrderItems(order.id)
  const config = await getShopConfigCached()

  // Thumbnails for the confirmation's line list. The product id survives on the
  // line, so a product deleted since the order simply has no picture rather
  // than taking the list down with it.
  const mediaByProduct = await getProductMediaForProducts(
    items.map((i) => i.productId).filter((id): id is string => !!id)
  )
  function imageFor(productId: string | null): string | null {
    if (!productId) return null
    const media = mediaByProduct.get(productId) ?? []
    const image = media.find((m) => m.type === 'IMAGE' && m.isPrimary) ?? media.find((m) => m.type === 'IMAGE')
    return image?.url ?? null
  }

  // Manual payment methods have no provider confirmation step, so the
  // instructions the shopper needs (where to send the transfer / bring the
  // cash) only live in shop settings - surface them here for the confirmation page.
  //
  // Only while there is still something to pay. Once the shop has marked the
  // money as arrived the instructions have no job left, and the owner's bank
  // details should stop travelling to anyone holding an order number and an
  // email address for the rest of time.
  const paymentOutstanding =
    (order.paymentStatus === 'PENDING' || order.paymentStatus === 'AWAITING_CONFIRMATION') &&
    order.status !== 'CANCELLED' &&
    order.status !== 'REFUNDED'
  let instructions: string | null = null
  if (paymentOutstanding && (order.paymentMethod === 'BANK_TRANSFER' || order.paymentMethod === 'CASH')) {
    instructions = order.paymentMethod === 'BANK_TRANSFER' ? config.bankTransferInstructions : config.cashInstructions
  }

  // Whether this method has no automated confirmation at all. It decides what
  // "awaiting confirmation" is telling the shopper, and the two readings are
  // opposites: on a manual method nothing has been paid yet and the ball is in
  // their court, whereas on an automated one the money is authorised and simply
  // settling. Taken from the provider's own confirmMode rather than a list of
  // method codes here, so a module that contributes a manual method is read
  // correctly and shop never has to name anyone else's.
  const manualPayment = getPaymentProvider(order.paymentMethod)?.confirmMode === 'manual'

  // Whether this buyer is worth offering an account to. Decided here because
  // every part of it is server-side: the shop owner's setting, whether the site
  // takes member registrations at all, and whether this particular order was
  // placed as a guest. An invite-only site is excluded - sending someone to a
  // page that will only turn them away is worse than not asking.
  //
  // This is the switch that used to do nothing: `postPurchaseAccountPrompt` was
  // saved by the settings screen and read by absolutely nobody, so the prompt
  // it promised had never once appeared.
  //
  // The prompt carries the registration form itself rather than a link to it,
  // so it has to hand over everything that form needs: the registration mode,
  // which fields the site asks for, and the privacy policy people are agreeing
  // to. Read from the same places the register page reads them, so an owner who
  // drops the username picker doesn't find it back again on the confirmation.
  const membersConfig = await getMembersConfig()
  type AccountPrompt = {
    registerUrl: string
    verifyEmailUrl: string
    registrationMode: MembersConfig['registrationMode']
    collectUsername: boolean
    collectDisplayName: boolean
    privacyPolicyUrl: string | null
  }
  let accountPrompt: AccountPrompt | null = null
  if (
    config.postPurchaseAccountPrompt &&
    membersConfig.enabled &&
    membersConfig.registrationMode !== 'INVITE_ONLY' &&
    !order.memberId
  ) {
    const siteConfig = await prisma.siteConfig.findUnique({
      where: { id: 'singleton' },
      select: { privacyPolicyPageId: true },
    })
    const privacyPage = siteConfig?.privacyPolicyPageId
      ? await prisma.infoPage.findUnique({
          where: { id: siteConfig.privacyPolicyPageId },
          select: { slug: true },
        })
      : null
    const memberArea = getMemberAreaPath()
    accountPrompt = {
      registerUrl: `/${memberArea}/register?email=${encodeURIComponent(order.customerEmail)}`,
      // Spelt out rather than derived from the current path: the form is on the
      // confirmation page now, not on /register, so there is nothing to derive.
      verifyEmailUrl: `/${memberArea}/verify-email`,
      registrationMode: membersConfig.registrationMode,
      collectUsername: membersConfig.registrationCollectUsername,
      collectDisplayName: membersConfig.registrationCollectDisplayName,
      privacyPolicyUrl: privacyPage?.slug ? `/${privacyPage.slug}` : null,
    }
  }

  // Module-contributed methods can be renamed by the shop owner, so their label
  // is resolved rather than read off a fixed map.
  const moduleMethodLabels = await getPaymentMethodLabels()

  // How this order's updates are being sent, so the confirmation page can offer
  // the choice with the current answer already in it. `smsAvailable` is false on
  // any site with no SMS provider set up, which is what hides the whole thing.
  const [notifyChannels, smsAvailable] = await Promise.all([
    getOrderNotifyChannels(order),
    isSmsAvailable(),
  ])

  // Deliberately NOT the whole order row. This used to spread `SELECT *` out to
  // anyone holding an order number and an email address, which handed over the
  // internal row id and the payment provider's own reference - neither of which
  // any page has ever rendered.
  return NextResponse.json({
    order: {
      orderNumber: order.orderNumber,
      status: order.status,
      customerName: order.customerName,
      customerEmail: order.customerEmail,
      shippingAddress: order.shippingAddress,
      subtotal: order.subtotal,
      discountAmount: order.discountAmount,
      shippingAmount: order.shippingAmount,
      taxAmount: order.taxAmount,
      total: order.total,
      taxMode: order.taxMode,
      couponCode: order.couponCode,
      shippingRateName: order.shippingRateName,
      paymentMethod: order.paymentMethod,
      paymentMethodLabel:
        BUILT_IN_METHOD_LABELS[order.paymentMethod] ?? moduleMethodLabels[order.paymentMethod] ?? order.paymentMethod,
      paymentStatus: order.paymentStatus,
      createdAt: order.createdAt,
    },
    items: items.map((item) => ({
      productName: item.productName,
      productSku: item.productSku,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      total: item.total,
      lineMeta: item.lineMeta,
      imageUrl: imageFor(item.productId),
    })),
    instructions,
    manualPayment,
    accountPrompt,
    notifications: {
      smsAvailable,
      email: notifyChannels.email,
      sms: notifyChannels.sms,
      // The number as typed, not the resolved one: a landline typed for the
      // delivery driver should show in the box so it can be corrected, rather
      // than vanishing because it cannot receive a text.
      phone: order.notifyPhone ?? order.customerPhone ?? '',
    },
    currencySymbol: config.currencySymbol,
  })
}
