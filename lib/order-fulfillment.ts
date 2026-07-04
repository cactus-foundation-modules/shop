import { getSiteUrl } from '@/lib/config/env'
import { getOrderById, getOrderItems } from '@/modules/shop/lib/db/orders'
import { decrementStockOnShip, incrementPreOrderCount, getProductById } from '@/modules/shop/lib/db/products'
import { getCouponByCode, incrementCouponUsage } from '@/modules/shop/lib/db/discounts'
import { createDigitalDownload } from '@/modules/shop/lib/db/digital'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import { sendShopEmail } from '@/modules/shop/lib/email'

function formatMoney(amount: string, symbol: string): string {
  return `${symbol}${Number(amount).toFixed(2)}`
}

function formatAddress(address: { line1: string; line2?: string; city: string; postcode: string; country: string }): string {
  return [address.line1, address.line2, address.city, address.postcode, address.country].filter(Boolean).join(', ')
}

// Runs once per order, gated by the caller checking markOrderPaid()'s boolean
// return value first - never call this twice for the same order (stock/coupon
// usage/pre-order counters/digital downloads must all be exactly-once side effects).
export async function fulfillPaidOrder(orderId: string): Promise<void> {
  const order = await getOrderById(orderId)
  if (!order) return
  const items = await getOrderItems(orderId)
  const config = await getShopConfigCached()
  const siteUrl = getSiteUrl()

  const nonPreOrderItemIds = items.filter((i) => !i.isPreOrder).map((i) => i.id)
  await decrementStockOnShip(nonPreOrderItemIds)

  for (const item of items.filter((i) => i.isPreOrder)) {
    if (item.productId) await incrementPreOrderCount(item.productId, item.quantity)
  }

  if (order.couponCode) {
    const coupon = await getCouponByCode(order.couponCode)
    if (coupon) await incrementCouponUsage(coupon.id)
  }

  for (const item of items.filter((i) => i.productType === 'DIGITAL')) {
    if (!item.productId) continue
    const product = await getProductById(item.productId)
    if (!product?.digitalFileId) continue
    const expiresAt = product.downloadExpiry ? new Date(Date.now() + product.downloadExpiry * 24 * 60 * 60 * 1000) : null
    await createDigitalDownload({ orderId: order.id, orderItemId: item.id, fileId: product.digitalFileId, expiresAt })
  }

  const preOrderItem = items.find((i) => i.isPreOrder)
  const itemsList = items.map((i) => `${i.productName} x${i.quantity} - ${formatMoney(i.total, config.currencySymbol)}`).join('\n')

  await sendShopEmail('ORDER_CONFIRMED', order.customerEmail, {
    orderNumber: order.orderNumber,
    customerName: order.customerName,
    customerEmail: order.customerEmail,
    orderTotal: formatMoney(order.total, config.currencySymbol),
    orderItems: itemsList,
    orderStatus: order.status,
    shippingAddress: formatAddress(order.shippingAddress),
    trackingUrl: '',
    hasPreOrderItems: preOrderItem ? 'true' : 'false',
    preOrderItemName: preOrderItem?.productName ?? '',
    preOrderDispatchDate: preOrderItem?.preOrderDispatchDate?.toLocaleDateString('en-GB') ?? '',
    shopName: config.shopTitle || 'Shop',
    shopUrl: `${siteUrl}/shop`,
  }, { orderId: order.id })

  const adminAlertEmail = config.adminOrderAlertEmail || config.storeEmail
  if (adminAlertEmail) {
    await sendShopEmail('ADMIN_NEW_ORDER', adminAlertEmail, {
      orderNumber: order.orderNumber,
      customerName: order.customerName,
      customerEmail: order.customerEmail,
      orderTotal: formatMoney(order.total, config.currencySymbol),
      orderItems: itemsList,
      shopName: config.shopTitle || 'Shop',
      shopUrl: `${siteUrl}/shop`,
    })
  }
}
