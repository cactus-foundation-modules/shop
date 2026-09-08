import { claimGuestOrdersForMember, listOrdersByMemberId, getOrderById, getOrderItems } from '@/modules/shop/lib/db/orders'
import { getProductsByIds, getProductMediaForProducts } from '@/modules/shop/lib/db/products'
import { getShipmentsForOrder, getOrderDispatchSummary } from '@/modules/shop/lib/db/shipments'
import { listRefundsForOrder, listRefundItemsForOrder } from '@/modules/shop/lib/db/refunds'
import { listDownloadsForOrder } from '@/modules/shop/lib/db/digital'
import { listRequestsForOrder } from '@/modules/shop/lib/db/order-requests'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import { fillBlankMemberContactDetails } from '@/lib/members/contact'
import { orderCompanyName } from '@/modules/shop/lib/order-display'
import {
  canReportDamage,
  canRequestCancel,
  canRequestReturn,
  cancellableQty,
  returnDeadline,
  type RequestEligibility,
} from '@/modules/shop/lib/order-requests'
import { returnsPolicy, returnsPolicyNote, type ReturnsPolicy } from '@/modules/shop/lib/returnable'
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
  const orders = await listOrdersByMemberId(member.id)

  // An order is where the shop learns a member's name and their company - which
  // is exactly what an account signed up for at a checkout has neither of. Core
  // decides what happens with them (blanks only, see lib/members/contact.ts);
  // the shop only says what the order was made out to. Newest first, so somebody
  // who has moved firms is carried over as the firm they bought from last.
  //
  // On any order they own, not only on one claimed by this very call. The claim
  // is a one-off - it happens on the first visit and returns 0 for ever after -
  // so gating on it meant a member whose orders were claimed before there was
  // anything to copy across, or on a visit where the copy failed, stayed blank
  // permanently with the answer sitting in their own order history. The cost of
  // getting that wrong is a member typing their company in at every checkout;
  // the cost of getting it right is one lookup by primary key on a page that
  // already runs a dozen, and core drops out of that lookup the moment it finds
  // nothing to fill.
  const newest = orders[0]
  if (newest) {
    await fillBlankMemberContactDetails(member.id, {
      fullName: newest.customerName,
      organisation: orderCompanyName(newest),
    })
  }

  return orders
}

/** One line of an order as a shopper sees it: what they bought, a picture of
 * it, somewhere to click through to, and where it has got to. */
export type MemberOrderLine = {
  item: ShpOrderItem
  productSlug: string | null
  imageUrl: string | null
  dispatchedQty: number
  outstandingQty: number
  /** Units still eligible to go back, once refunds and live returns are off.
   *  Always 0 on a line the shop does not take back. */
  returnableQty: number
  /** Units still eligible to be called off - what is left to supply, less
   *  anything a live cancellation has already spoken for. Always 0 on a line
   *  the shop does not take back, which is the same line it cannot be talked
   *  out of supplying. */
  cancellableQty: number
  /** Whether this line may go back at all, as snapshotted when it was ordered. */
  returnable: boolean
  /** All three answers as one, from the pair snapshotted onto the line. */
  returnsPolicy: ReturnsPolicy
  /** What the customer is told about it - why it may not come back, or that
   *  taking it back is ours to decide. Null on a line that simply comes back,
   *  where there is nothing to say. */
  returnsNote: string | null
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
  //
  // Counted in two piles, not one. A return spends DISPATCHED units and a
  // cancellation spends UNDISPATCHED ones, so netting either off the other is
  // wrong in both directions: a customer who calls off the half that has not
  // been packed would lose the right to send back the half they are holding,
  // and vice versa.
  const returnsSpokenFor = new Map<string, number>()
  const cancelsSpokenFor = new Map<string, number>()
  for (const request of requests) {
    if (request.status !== 'PENDING' && request.status !== 'APPROVED') continue
    // A damage report names lines without spending them: telling us a leg is
    // broken must not be what stops the customer sending the thing back.
    if (request.type === 'DAMAGE') continue
    // An APPROVED cancellation has already come off outstandingQty in the
    // dispatch summary, so only a PENDING one is still to be netted off here.
    const tally = request.type === 'CANCEL'
      ? (request.status === 'PENDING' ? cancelsSpokenFor : null)
      : returnsSpokenFor
    if (!tally) continue
    for (const line of request.items) {
      tally.set(line.orderItemId, (tally.get(line.orderItemId) ?? 0) + line.quantity)
    }
  }

  return items.map((item) => {
    const position = dispatchByItem.get(item.id)
    const media = item.productId ? mediaByProduct.get(item.productId) ?? [] : []
    const image = media.find((m) => m.isPrimary && m.type === 'IMAGE') ?? media.find((m) => m.type === 'IMAGE')
    const dispatchedQty = position?.dispatchedQty ?? 0
    const policy = returnsPolicy(item.returnable, item.returnsDiscretionary)
    const outstandingQty = position?.outstandingQty ?? Math.max(item.quantity - item.refundedQty, 0)
    return {
      item,
      productSlug: item.productId ? products.get(item.productId)?.slug ?? null : null,
      imageUrl: image?.url ?? null,
      dispatchedQty,
      outstandingQty,
      returnableQty: item.returnable
        ? Math.max(dispatchedQty - item.refundedQty - (returnsSpokenFor.get(item.id) ?? 0), 0)
        : 0,
      cancellableQty: cancellableQty(
        { outstandingQty, returnable: item.returnable },
        cancelsSpokenFor.get(item.id) ?? 0,
      ),
      returnable: item.returnable,
      // Every half off the order's own snapshot. Reading the note back off the
      // line's product looked tidier and was wrong: on a listing with variations
      // the line's product is the hidden CHILD, which never carries a reason -
      // the owner writes one on the listing - so every variation was handed the
      // stock sentence and the owner's own wording was quietly lost.
      returnsPolicy: policy,
      returnsNote: returnsPolicyNote(policy, item.nonReturnableNote),
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
  /** The open cancel or return, if there is one. */
  openRequest: ShpOrderRequestWithItems | null
  /** The open damage report, counted separately - a broken leg and a change of
   *  mind are two different conversations. */
  openDamageRequest: ShpOrderRequestWithItems | null
  cancel: RequestEligibility
  return: RequestEligibility
  damage: RequestEligibility
  /** When the return window shuts, if one is running. */
  returnBy: Date | null
}

/**
 * Everything the order detail page shows, and the rules for what may still be
 * asked for. Null when there is no such order.
 *
 * Knows nothing about who is asking, deliberately. It used to take the member
 * and do the ownership check itself, which was right while a member was the
 * only person who could ever see this - and became wrong the day a guest could
 * prove themselves with a delivery postcode instead. Who may look is one
 * question with one answer, and it is asked in lib/order-viewer.ts (through
 * lib/order-route-access.ts on the routes); what there is to look at is this.
 */
export async function loadOrderDetail(orderId: string): Promise<MemberOrderDetail | null> {
  const order = await getOrderById(orderId)
  if (!order) return null

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

  const openRequest = requests.find((r) => r.status === 'PENDING' && r.type !== 'DAMAGE') ?? null
  const openDamageRequest = requests.find((r) => r.status === 'PENDING' && r.type === 'DAMAGE') ?? null
  // Latest parcel out, which is what a return window is counted from.
  const lastShippedAt = shipments.reduce<Date | null>(
    (latest, shipment) => (!latest || shipment.shippedAt > latest ? shipment.shippedAt : latest),
    null,
  )

  // Whether the shop takes ANY of this order back. Deliberately about the flag
  // alone and not about what is left after refunds: an order whose returnable
  // lines have all been sent back already is a different sentence, and the
  // per-line figures below say it better than a blanket refusal would.
  const anyReturnable = items.some((item) => item.returnable)

  // The lines that cannot be called off. Goods a shop will not take back are
  // goods it committed to the moment the order was placed - cut, upholstered, or
  // ordered in specially - so a cancellation is no more possible than a return.
  // Named rather than counted, because "part of this order" sends the customer
  // straight to an email asking which part.
  const nonCancellable = items.filter((item) => !item.returnable).map((item) => item.productName)

  const lines = buildLines(items, dispatch, requests, products, mediaByProduct)

  const eligibilityInput = {
    order,
    dispatch: dispatch.lines,
    lastShippedAt,
    config,
    openRequest,
    openDamageRequest,
    anyReturnable,
    nonCancellable,
    // Per line, so one dispatched parcel or one bespoke desk no longer refuses
    // the whole order - it refuses those lines and leaves the rest offerable.
    cancellable: lines.map((line) => ({
      productName: line.item.productName,
      cancellableQty: line.cancellableQty,
      outstandingQty: line.outstandingQty,
      returnable: line.returnable,
    })),
  }

  return {
    order,
    lines,
    shipments,
    refunds,
    refundItems,
    downloads,
    requests,
    openRequest,
    openDamageRequest,
    cancel: canRequestCancel(eligibilityInput),
    return: canRequestReturn(eligibilityInput),
    damage: canReportDamage(eligibilityInput),
    returnBy:
      lastShippedAt && config.returnRequestsEnabled && config.returnWindowDays > 0
        ? returnDeadline(lastShippedAt, config.returnWindowDays)
        : null,
  }
}
