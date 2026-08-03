import { NextRequest, NextResponse } from 'next/server'
import { getOrderByNumberAndEmail, getOrderItems } from '@/modules/shop/lib/db/orders'
import { getProductMediaForProducts } from '@/modules/shop/lib/db/products'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import { getPaymentProvider, getPaymentMethodLabels } from '@/modules/shop/lib/payments/registry'
import { shopClosedResponse } from '@/modules/shop/lib/access'
import { getMembersConfig } from '@/lib/members/config'
import { getMemberAreaPath } from '@/lib/members/paths'

// Preferred display names for the built-in methods; anything else falls back to
// the provider's own registered label, then the raw code.
const BUILT_IN_METHOD_LABELS: Record<string, string> = {
  STRIPE: 'Card', PAYPAL: 'PayPal', BANK_TRANSFER: 'Bank transfer', CASH: 'Cash',
}

// Guest order lookup: order number + email must both match - no enumeration (spec 8.1).
export async function GET(request: NextRequest) {
  const closed = await shopClosedResponse()
  if (closed) return closed

  const orderNumber = request.nextUrl.searchParams.get('orderNumber')
  const email = request.nextUrl.searchParams.get('email')
  if (!orderNumber || !email) return NextResponse.json({ error: 'orderNumber and email are required' }, { status: 400 })

  const order = await getOrderByNumberAndEmail(orderNumber, email)
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
  let instructions: string | null = null
  if (order.paymentMethod === 'BANK_TRANSFER' || order.paymentMethod === 'CASH') {
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
  const membersConfig = await getMembersConfig()
  const accountPrompt =
    config.postPurchaseAccountPrompt &&
    membersConfig.enabled &&
    membersConfig.registrationMode !== 'INVITE_ONLY' &&
    !order.memberId
      ? { registerUrl: `/${getMemberAreaPath()}/register?email=${encodeURIComponent(order.customerEmail)}` }
      : null

  // Module-contributed methods can be renamed by the shop owner, so their label
  // is resolved rather than read off a fixed map.
  const moduleMethodLabels = await getPaymentMethodLabels()

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
    currencySymbol: config.currencySymbol,
  })
}
