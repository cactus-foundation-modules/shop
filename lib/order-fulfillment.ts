import { getSiteUrl } from '@/lib/config/env'
import { getOrderById, getOrderItems } from '@/modules/shop/lib/db/orders'
import { decrementStockOnShip, incrementPreOrderCount, getProductById } from '@/modules/shop/lib/db/products'
import { incrementCouponUsage } from '@/modules/shop/lib/db/discounts'
import { createDigitalDownload } from '@/modules/shop/lib/db/digital'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import { applyOrderPaymentState } from '@/modules/shop/lib/order-payment-state'
import { rememberOrderAddress } from '@/modules/shop/lib/order-address-book'
import { customerReferenceVars, sendShopEmail } from '@/modules/shop/lib/email'
import { notifyOrderCustomer } from '@/modules/shop/lib/order-notify'
import { getPaymentProvider, resolveProviderLabel } from '@/modules/shop/lib/payments/registry'
import { issueInvoiceForOrder, shouldIssueOn } from '@/modules/shop/lib/invoices'
import { notifyOrderPaid } from '@/modules/shop/lib/order-paid-hooks'
import { formatMoney } from '@/modules/shop/lib/money'

function formatAddress(address: { line1: string; line2?: string; city: string; postcode: string; country: string }): string {
  return [address.line1, address.line2, address.city, address.postcode, address.country].filter(Boolean).join(', ')
}

/** Which email the customer gets out of this. Everything else fulfilment does -
 *  stock, coupons, downloads, the invoice, the owner's own alert - happens
 *  either way; this only decides what lands in the buyer's inbox.
 *
 *  'ORDER_CONFIRMED' is what an automated payment sends and is the default.
 *  'PAYMENT_RECEIVED' is for a payment cleared by hand (bank transfer, cash),
 *  where the buyer was told their order was placed days ago and the news now is
 *  that the money arrived. 'NONE' is the owner untucking the box on the mark-as-
 *  paid dialog, usually because they have already spoken to the customer. */
export type CustomerPaymentNotice = 'ORDER_CONFIRMED' | 'PAYMENT_RECEIVED' | 'NONE'

// Runs once per order, gated by the caller checking markOrderPaid()'s boolean
// return value first - never call this twice for the same order (stock/coupon
// usage/pre-order counters/digital downloads must all be exactly-once side effects).
export async function fulfillPaidOrder(
  orderId: string,
  opts: { customerNotice?: CustomerPaymentNotice } = {},
): Promise<void> {
  // Before anything is read: the money has just landed, so let any module that
  // wrote a line snapshot conditional on payment say the true thing now (a
  // delivery date counted from today rather than a lead time). Done first so the
  // confirmation email below carries the restated wording rather than yesterday's.
  await applyOrderPaymentState(orderId)

  const order = await getOrderById(orderId)
  if (!order) return
  const items = await getOrderItems(orderId)
  const config = await getShopConfigCached()
  const siteUrl = getSiteUrl()

  // A signed-in shopper's delivery address goes into their address book, ready
  // to be offered back at the next checkout.
  await rememberOrderAddress(order)

  const nonPreOrderItemIds = items.filter((i) => !i.isPreOrder).map((i) => i.id)
  await decrementStockOnShip(nonPreOrderItemIds)

  for (const item of items.filter((i) => i.isPreOrder)) {
    if (item.productId) await incrementPreOrderCount(item.productId, item.quantity)
  }

  // Only burn a coupon redemption when a coupon was genuinely resolved at
  // checkout (coupon_id is non-null). The raw coupon_code the shopper typed is
  // never the basis for this: an expired or maxed-out code is dropped by
  // resolveDiscounts and left off the order, so it must never bump usage_count
  // or a later "you have already used this coupon" would fire against a code
  // that never actually applied.
  if (order.couponId) {
    await incrementCouponUsage(order.couponId)
  }

  for (const item of items.filter((i) => i.productType === 'DIGITAL')) {
    if (!item.productId) continue
    const product = await getProductById(item.productId)
    if (!product?.digitalFileId) continue
    const expiresAt = product.downloadExpiry ? new Date(Date.now() + product.downloadExpiry * 24 * 60 * 60 * 1000) : null
    await createDigitalDownload({ orderId: order.id, orderItemId: item.id, fileId: product.digitalFileId, expiresAt })
  }

  const preOrderItem = items.find((i) => i.isPreOrder)
  const itemsList = items.map((i) => {
    const base = `${i.productName} x${i.quantity} - ${formatMoney(i.total, config.currencySymbol)}`
    // Personalisation (engraving, options, upload names) listed under the item.
    const extras = i.lineMeta?.fields?.length
      ? '\n' + i.lineMeta.fields.map((f) => `    ${f.label}: ${f.value}`).join('\n')
      : ''
    return base + extras
  }).join('\n')

  // Email, text, or both - whichever the customer asked for. Everything below
  // this line that is addressed to the OWNER stays on plain email: an admin
  // alert is not something anybody asked to be texted about.
  const provider = getPaymentProvider(order.paymentMethod)

  // Which email the buyer gets, where the caller has not said.
  //
  // 'ORDER_CONFIRMED' for the ordinary case: the money and the order arrived in
  // the same breath, so one email covers both. An order carrying an
  // `originalPaymentMethod` is not that case - it was placed on one method days
  // or weeks ago, confirmed by email at the time, and has only now been settled
  // from the customer's own order page. Telling that person their order has been
  // placed, a second time, reads as a duplicate order rather than a receipt. The
  // news today is that the money arrived, which is exactly what PAYMENT_RECEIVED
  // says - and is what the owner's own mark-as-paid button has always sent for
  // the same situation.
  const customerNotice = opts.customerNotice
    ?? (order.originalPaymentMethod ? 'PAYMENT_RECEIVED' : 'ORDER_CONFIRMED')

  if (customerNotice !== 'NONE') {
    await notifyOrderCustomer(customerNotice, order, {
      orderNumber: order.orderNumber,
      customerName: order.customerName,
      customerEmail: order.customerEmail,
      orderTotal: formatMoney(order.total, config.currencySymbol),
      orderItems: itemsList,
      orderStatus: order.status,
      shippingAddress: formatAddress(order.shippingAddress),
      trackingUrl: '',
      paymentMethod: provider ? await resolveProviderLabel(provider) : order.paymentMethod,
      paymentReference: order.paymentReference ?? '',
      hasPaymentReference: order.paymentReference ? 'true' : 'false',
      hasPreOrderItems: preOrderItem ? 'true' : 'false',
      preOrderItemName: preOrderItem?.productName ?? '',
      preOrderDispatchDate: preOrderItem?.preOrderDispatchDate?.toLocaleDateString('en-GB') ?? '',
      ...customerReferenceVars(order, config),
      shopName: config.shopTitle || 'Shop',
      shopUrl: `${siteUrl}/shop`,
    })
  }

  // The invoice, for a shop that invoices on payment rather than on despatch or
  // completion. Same swallow-and-log rule as the other trigger in
  // lib/order-status.ts: the money has landed and the customer has been told, so
  // paperwork that will not raise is a job for the button on the order screen,
  // not a reason to fail a payment webhook.
  if (shouldIssueOn(config, 'PAID')) {
    const invoiced = await issueInvoiceForOrder(order.id, { trigger: 'PAID', issuedBy: 'AUTO' })
    if (!invoiced.ok) console.error('[shop] could not invoice order', order.id, invoiced.error)
  }

  // The owner's new-order alert - but not on a method they clear by hand. Those
  // orders raised their own alert the day they were placed
  // (lib/order-placed-email.ts), and this send would land seconds after the
  // owner pressed the button that caused it, telling them what they had just
  // done. Read off the provider's confirmMode rather than a list of method
  // codes, so a module's manual method behaves the same way.
  const adminAlertEmail = provider?.confirmMode === 'manual' ? '' : (config.adminOrderAlertEmail || config.storeEmail)
  if (adminAlertEmail) {
    await sendShopEmail('ADMIN_NEW_ORDER', adminAlertEmail, {
      orderNumber: order.orderNumber,
      customerName: order.customerName,
      customerEmail: order.customerEmail,
      orderTotal: formatMoney(order.total, config.currencySymbol),
      orderItems: itemsList,
      ...customerReferenceVars(order, config),
      shopName: config.shopTitle || 'Shop',
      shopUrl: `${siteUrl}/shop`,
    })
  }

  // Last, and after everything the shopper and the owner were owed. Whatever a
  // module wants to do about the money having landed - buy the goods in, tell a
  // warehouse - is its own business, and by this point nothing it does can cost
  // anybody their order. notifyOrderPaid swallows its own observers' failures;
  // this catch is for the gather itself, so a broken manifest cannot fail a
  // payment webhook either.
  try {
    await notifyOrderPaid({
      orderId: order.id,
      orderNumber: order.orderNumber,
      paymentMethod: order.paymentMethod,
      clearedManually: provider?.confirmMode === 'manual',
    })
  } catch (err) {
    console.error('[shop] order-paid observers could not be gathered', order.id, err)
  }
}
