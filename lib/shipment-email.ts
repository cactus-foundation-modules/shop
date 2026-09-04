import { getSiteUrl } from '@/lib/config/env'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import { getOrderById } from '@/modules/shop/lib/db/orders'
import { getOrderDispatchSummary, getShipmentsForOrder } from '@/modules/shop/lib/db/shipments'
import { notifyOrderCustomer } from '@/modules/shop/lib/order-notify'
import { getOrderItems } from '@/modules/shop/lib/db/orders'
import { absoluteImageUrl, productEmailUrl, renderOrderItemsTable, type OrderEmailLine } from '@/modules/shop/lib/order-items-email'
import { getProductMediaForProducts, getProductSlugsByIds } from '@/modules/shop/lib/db/products'
import type { ShpProductMedia } from '@/modules/shop/lib/types'

// The two lists go into the template as pre-built markup, declared as rawTags
// on shop.partial-shipped. They were plain strings, prefixed and newline-joined
// - which gave a proper list in the text part and one run-on line in the HTML
// part, where every newline collapses to a space. The table is the same one the
// confirmation uses, minus the prices: what a thing cost is not the question
// somebody has when they are looking at what is in the box.
function formatItemList(
  entries: Array<{ productName: string; quantity: number; imageUrl?: string | null; url?: string | null }>,
): string {
  const lines: OrderEmailLine[] = entries.map((e) => ({
    name: e.productName,
    quantity: e.quantity,
    imageUrl: e.imageUrl ?? null,
    url: e.url ?? null,
  }))
  return renderOrderItemsTable(lines)
}

// Tells the customer that ONE shipment has gone out, listing what was in it and
// what is still owed. Deliberately not STATUS_SHIPPED: that template says the
// whole order is on its way, which is untrue of a part-dispatch.
//
// It covers the final shipment too. When this parcel clears the last
// outstanding unit the PARTIAL_SHIPPED copy switches to "the last part of your
// order", so the dispatch route can call this for EVERY shipment it records and
// never has to decide between two templates. STATUS_SHIPPED stays where it is,
// for an admin flipping the whole order to SHIPPED without recording lines.
//
// Silent no-op when the order or shipment cannot be found, or when the shipment
// has no lines: an email is not worth failing a dispatch that already committed.
export async function sendShipmentDispatchedEmail(params: { orderId: string; shipmentId: string }): Promise<void> {
  const order = await getOrderById(params.orderId)
  if (!order) return

  const shipments = await getShipmentsForOrder(params.orderId)
  const shipment = shipments.find((s) => s.id === params.shipmentId)
  if (!shipment || shipment.items.length === 0) return

  // The summary is the same read the order screen uses, so the figures in the
  // email cannot disagree with the ones the shop owner is looking at. Its lines
  // already carry outstandingQty = quantity - refundedQty - dispatchedQty
  // (dispatched across ALL shipments, floored at zero) and the product names.
  const summary = await getOrderDispatchSummary(params.orderId)
  const lineByOrderItemId = new Map(summary.lines.map((l) => [l.orderItemId, l]))

  // Thumbnails, by the line's own product exactly as the confirmation resolves
  // them. The dispatch summary carries names and quantities but no product id,
  // so the order's items come along to supply it; a picture that will not read
  // costs the thumbnails and never the dispatch note.
  const config = await getShopConfigCached()
  const siteUrl = getSiteUrl()

  const orderItems = await getOrderItems(params.orderId).catch(() => [])
  const productByOrderItemId = new Map(orderItems.map((i) => [i.id, i.productId]))
  const productIds = orderItems.map((i) => i.productId).filter((id): id is string => !!id)
  const [mediaByProduct, slugByProduct] = await Promise.all([
    productIds.length > 0
      ? getProductMediaForProducts(productIds).catch(() => new Map<string, ShpProductMedia[]>())
      : Promise.resolve(new Map<string, ShpProductMedia[]>()),
    productIds.length > 0
      ? getProductSlugsByIds(productIds).catch(() => new Map<string, string>())
      : Promise.resolve(new Map<string, string>()),
  ])
  const imageForOrderItem = (orderItemId: string): string | null => {
    const productId = productByOrderItemId.get(orderItemId) ?? null
    const media = productId ? mediaByProduct.get(productId) ?? [] : []
    const image = media.find((m) => m.type === 'IMAGE' && m.isPrimary) ?? media.find((m) => m.type === 'IMAGE')
    return absoluteImageUrl(image?.url, siteUrl)
  }
  // The same link the confirmation gives - the line's own product, which for a
  // variation is the child slug the parent's page opens on.
  const linkForOrderItem = (orderItemId: string): string | null => {
    const productId = productByOrderItemId.get(orderItemId) ?? null
    return productEmailUrl(productId ? slugByProduct.get(productId) : null, siteUrl, config.productUrlStyle)
  }

  type DispatchedEntry = { productName: string; quantity: number; imageUrl: string | null; url: string | null }
  const dispatched = shipment.items
    .map((item): DispatchedEntry | null => {
      const line = lineByOrderItemId.get(item.orderItemId)
      return line
        ? {
            productName: line.productName,
            quantity: item.quantity,
            imageUrl: imageForOrderItem(item.orderItemId),
            url: linkForOrderItem(item.orderItemId),
          }
        : null
    })
    .filter((entry): entry is DispatchedEntry => entry !== null)
    .sort((a, b) => a.productName.localeCompare(b.productName))
  if (dispatched.length === 0) return

  const outstanding = summary.lines.filter((l) => l.outstandingQty > 0)

  // Read off the list the customer is about to be shown rather than off
  // summary.fullyDispatched, so the wording can never contradict the "still to
  // come" section printed underneath it.
  const isFinalPart = outstanding.length === 0

  const trackingNumber = shipment.trackingNumber?.trim() ?? ''
  const trackingUrl = shipment.trackingUrl?.trim() ?? ''
  const carrier = shipment.carrier?.trim() ?? ''

  await notifyOrderCustomer('PARTIAL_SHIPPED', order, {
    orderNumber: order.orderNumber,
    customerName: order.customerName,
    customerEmail: order.customerEmail,
    dispatchedItems: formatItemList(dispatched),
    outstandingItems: formatItemList(
      outstanding.map((l) => ({
        productName: l.productName,
        quantity: l.outstandingQty,
        imageUrl: imageForOrderItem(l.orderItemId),
        url: linkForOrderItem(l.orderItemId),
      }))
    ),
    hasOutstanding: isFinalPart ? 'false' : 'true',
    isFinalPart: isFinalPart ? 'true' : 'false',
    hasTracking: trackingNumber ? 'true' : 'false',
    hasTrackingUrl: trackingUrl ? 'true' : 'false',
    hasCarrier: carrier ? 'true' : 'false',
    trackingNumber,
    trackingUrl,
    carrier,
    shopName: config.shopTitle || 'Shop',
    shopUrl: `${siteUrl}/shop`,
  })
}
