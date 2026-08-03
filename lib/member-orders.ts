import { claimGuestOrdersForMember, listOrdersByMemberId, getOrderById, getOrderItems } from '@/modules/shop/lib/db/orders'
import { getProductsByIds, getProductMediaForProducts } from '@/modules/shop/lib/db/products'
import { getShipmentsForOrder, getOrderDispatchSummary } from '@/modules/shop/lib/db/shipments'
import { listRefundsForOrder, listRefundItemsForOrder } from '@/modules/shop/lib/db/refunds'
import { listDownloadsForOrder } from '@/modules/shop/lib/db/digital'
import { listRequestsForOrder } from '@/modules/shop/lib/db/order-requests'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import { canRequestCancel, canRequestReturn, returnDeadline, type RequestEligibility } from '@/modules/shop/lib/order-requests'
import type {
  ShpDigitalDownload,
  ShpOrder,
  ShpOrderDispatchSummary,
  ShpOrderItem,
  ShpOrderRequestWithItems,
  ShpProduct,
  ShpProductMedia,
  ShpRefund,
  ShpRefundItem,
  ShpShipmentWithItems,
} from '@/modules/shop/lib/types'

// Every order this member can see, guest orders at their own address included.
//
// The claim happens here rather than at registration because registration is
// core's business and a shop must not reach into it - and because doing it on
// read means an order placed as a guest AFTER signing up (a different browser,
// a signed-out tab) is picked up too, which a one-off sweep at sign-up would
// miss forever.
//
// The verification test is the whole safety of it: a member who has not proved
// they own the address gets nothing, because anyone can type someone else's
// email into a sign-up form and an unverified match would hand over that
// person's order history, delivery addresses and all. Shops with email
// verification switched off therefore claim nothing, which is the right way
// round - a missing order history is a nuisance, the alternative is a leak.
export async function listOrdersForMember(
  member: { id: string; email: string; emailVerified: boolean },
): Promise<ShpOrder[]> {
  if (member.emailVerified) await claimGuestOrdersForMember(member.id, member.email)
  return listOrdersByMemberId(member.id)
}

/** One line of an order as a shopper sees it: what they bought, a picture of
 * it, somewhere to click through to, and where it has got to. */
export type MemberOrderLine = {
  item: ShpOrderItem
  productSlug: string | null
  imageUrl: string | null
  dispatchedQty: number
  outstandingQty: number
  /** Units still eligible to go back, once refunds and live requests are off. */
  returnableQty: number
}

export type MemberOrderFulfilment = 'UNDISPATCHED' | 'PARTIAL' | 'DISPATCHED'

export type MemberOrderSummary = {
  order: ShpOrder
  lines: MemberOrderLine[]
  itemCount: number
  /** Nothing out, some out, or all out - the state a shopper actually asks about. */
  fulfilment: MemberOrderFulfilment
  hasOpenRequest: boolean
}

/** The list page: every order with enough on it to be recognised at a glance,
 * gathered in a handful of queries rather than a handful per order. */
export async function listOrderSummariesForMember(
  member: { id: string; email: string; emailVerified: boolean },
): Promise<MemberOrderSummary[]> {
  const orders = await listOrdersForMember(member)
  if (orders.length === 0) return []

  const [itemsByOrder, dispatchByOrder, requestsByOrder] = await Promise.all([
    Promise.all(orders.map((o) => getOrderItems(o.id))),
    Promise.all(orders.map((o) => getOrderDispatchSummary(o.id))),
    Promise.all(orders.map((o) => listRequestsForOrder(o.id))),
  ])

  const productIds = itemsByOrder.flat().map((i) => i.productId).filter((id): id is string => !!id)
  const [products, mediaByProduct] = await Promise.all([
    getProductsByIds(productIds),
    getProductMediaForProducts(productIds),
  ])

  return orders.map((order, index) => {
    const items = itemsByOrder[index] ?? []
    const dispatch = dispatchByOrder[index]
    const requests = requestsByOrder[index] ?? []
    return {
      order,
      lines: buildLines(items, dispatch, requests, products, mediaByProduct),
      itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
      fulfilment: dispatch?.fullyDispatched
        ? 'DISPATCHED'
        : dispatch?.partiallyDispatched
          ? 'PARTIAL'
          : 'UNDISPATCHED',
      hasOpenRequest: requests.some((r) => r.status === 'PENDING'),
    }
  })
}

function buildLines(
  items: ShpOrderItem[],
  dispatch: ShpOrderDispatchSummary | undefined,
  requests: ShpOrderRequestWithItems[],
  products: Map<string, ShpProduct>,
  mediaByProduct: Map<string, ShpProductMedia[]>,
): MemberOrderLine[] {
  const dispatchByItem = new Map((dispatch?.lines ?? []).map((line) => [line.orderItemId, line]))

  // Units a live request has already spoken for. PENDING and APPROVED both
  // count: an approved return whose goods have not come back yet is not a unit
  // that can be asked for a second time.
  const spokenFor = new Map<string, number>()
  for (const request of requests) {
    if (request.status !== 'PENDING' && request.status !== 'APPROVED') continue
    for (const line of request.items) {
      spokenFor.set(line.orderItemId, (spokenFor.get(line.orderItemId) ?? 0) + line.quantity)
    }
  }

  return items.map((item) => {
    const position = dispatchByItem.get(item.id)
    const media = item.productId ? mediaByProduct.get(item.productId) ?? [] : []
    const image = media.find((m) => m.isPrimary && m.type === 'IMAGE') ?? media.find((m) => m.type === 'IMAGE')
    const dispatchedQty = position?.dispatchedQty ?? 0
    return {
      item,
      productSlug: item.productId ? products.get(item.productId)?.slug ?? null : null,
      imageUrl: image?.url ?? null,
      dispatchedQty,
      outstandingQty: position?.outstandingQty ?? Math.max(item.quantity - item.refundedQty, 0),
      returnableQty: Math.max(dispatchedQty - item.refundedQty - (spokenFor.get(item.id) ?? 0), 0),
    }
  })
}

export type MemberOrderDetail = {
  order: ShpOrder
  lines: MemberOrderLine[]
  shipments: ShpShipmentWithItems[]
  refunds: ShpRefund[]
  refundItems: ShpRefundItem[]
  downloads: ShpDigitalDownload[]
  requests: ShpOrderRequestWithItems[]
  openRequest: ShpOrderRequestWithItems | null
  cancel: RequestEligibility
  return: RequestEligibility
  /** When the return window shuts, if one is running. */
  returnBy: Date | null
}

/** Everything the order detail page shows, and the rules for what may still be
 * asked for. Null when the order is not this member's - the caller turns that
 * into a 404 rather than a "not yours", which would confirm the id exists. */
export async function getMemberOrderDetail(
  orderId: string,
  member: { id: string },
): Promise<MemberOrderDetail | null> {
  const order = await getOrderById(orderId)
  if (!order || order.memberId !== member.id) return null

  const [items, dispatch, shipments, refunds, refundItems, downloads, requests, config] = await Promise.all([
    getOrderItems(order.id),
    getOrderDispatchSummary(order.id),
    getShipmentsForOrder(order.id),
    listRefundsForOrder(order.id),
    listRefundItemsForOrder(order.id),
    listDownloadsForOrder(order.id),
    listRequestsForOrder(order.id),
    getShopConfigCached(),
  ])

  const productIds = items.map((i) => i.productId).filter((id): id is string => !!id)
  const [products, mediaByProduct] = await Promise.all([
    getProductsByIds(productIds),
    getProductMediaForProducts(productIds),
  ])

  const openRequest = requests.find((r) => r.status === 'PENDING') ?? null
  // Latest parcel out, which is what a return window is counted from.
  const lastShippedAt = shipments.reduce<Date | null>(
    (latest, shipment) => (!latest || shipment.shippedAt > latest ? shipment.shippedAt : latest),
    null,
  )

  const eligibilityInput = { order, dispatch: dispatch.lines, lastShippedAt, config, openRequest }

  return {
    order,
    lines: buildLines(items, dispatch, requests, products, mediaByProduct),
    shipments,
    refunds,
    refundItems,
    downloads,
    requests,
    openRequest,
    cancel: canRequestCancel(eligibilityInput),
    return: canRequestReturn(eligibilityInput),
    returnBy:
      lastShippedAt && config.returnRequestsEnabled && config.returnWindowDays > 0
        ? returnDeadline(lastShippedAt, config.returnWindowDays)
        : null,
  }
}
