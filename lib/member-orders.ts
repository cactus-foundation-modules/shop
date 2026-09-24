import { claimGuestOrdersForMember, listOrdersByMemberId, getOrderById, getOrderItems, listReplacementOrdersForParent, listReplacementOrdersForParents } from '@/modules/shop/lib/db/orders'
import { getProductsByIds, getProductMediaForProducts } from '@/modules/shop/lib/db/products'
import { getShipmentsForOrder, getOrderDispatchSummary } from '@/modules/shop/lib/db/shipments'
import { listRefundsForOrder, listRefundItemsForOrder } from '@/modules/shop/lib/db/refunds'
import { listDownloadsForOrder } from '@/modules/shop/lib/db/digital'
import { listRequestsForOrder } from '@/modules/shop/lib/db/order-requests'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import { fillBlankMemberContactDetails } from '@/lib/members/contact'
import { syncMemberMarketingConsent } from '@/lib/members/marketing-consent'
import { latestMarketingConsent } from '@/modules/shop/lib/marketing-consent'
import { orderCompanyName } from '@/modules/shop/lib/order-display'
import {
  canReportDamage,
  canRequestCancel,
  canRequestReturn,
  cancellableQty,
  returnDeadline,
  returnableQty,
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
  member: { id: string; email: string; emailVerified: boolean; marketingConsent?: boolean | null },
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

  // The account's standing marketing answer follows the newest order that
  // carries one, so a guest who ticks the box and only makes an account later
  // still ends up with it. Done here for the same reason as the details above:
  // the claim is a one-off, and a sync that failed on that single visit would
  // otherwise never be tried again. Nothing is written once the two agree.
  const consent = latestMarketingConsent(orders, member.email)
  if (consent !== null && consent !== member.marketingConsent) {
    await syncMemberMarketingConsent(member.id, consent, member.email)
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
  /** On a replacement, the number of the order it is putting right. Null on a
   *  sale, and null on the rare replacement whose parent this member cannot
   *  see - in which case the row simply reads as a replacement and says no more
   *  than it can back up. */
  parentOrderNumber: string | null
  /** How many parts have been sent out to put this order right. 0 on almost
   *  every order, which is the whole reason it is a count and not a list. */
  replacementCount: number
}

/** The list page: every order with enough on it to be recognised at a glance,
 * gathered in a handful of queries rather than a handful per order. */
export async function listOrderSummariesForMember(
  member: { id: string; email: string; emailVerified: boolean; marketingConsent?: boolean | null },
): Promise<MemberOrderSummary[]> {
  const orders = await listOrdersForMember(member)
  if (orders.length === 0) return []

  const [itemsByOrder, dispatchByOrder, requestsByOrder, allReplacements] = await Promise.all([
    Promise.all(orders.map((o) => getOrderItems(o.id))),
    Promise.all(orders.map((o) => getOrderDispatchSummary(o.id))),
    Promise.all(orders.map((o) => listRequestsForOrder(o.id))),
    // One query for the whole page rather than one per order. Nearly always
    // returns nothing at all.
    listReplacementOrdersForParents(orders.filter((o) => o.kind !== 'REPLACEMENT').map((o) => o.id)),
  ])

  // Both directions of the same link, resolved off the orders already in hand:
  // a replacement wants its parent's number to introduce itself with, and a
  // parent wants to know how many went out.
  const numberById = new Map(orders.map((o) => [o.id, o.orderNumber]))
  const replacementCounts = new Map<string, number>()
  for (const replacement of allReplacements) {
    if (!replacement.parentOrderId) continue
    replacementCounts.set(replacement.parentOrderId, (replacementCounts.get(replacement.parentOrderId) ?? 0) + 1)
  }

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
      parentOrderNumber: order.parentOrderId ? numberById.get(order.parentOrderId) ?? null : null,
      replacementCount: replacementCounts.get(order.id) ?? 0,
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
  // Returns in two piles again - waiting and approved - for returnableQty,
  // which takes each off a different figure (see there).
  const returnsSpokenFor = new Map<string, number>()
  const returnsApproved = new Map<string, number>()
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
      : (request.status === 'APPROVED' ? returnsApproved : returnsSpokenFor)
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
      // The one sum lib/db/order-requests.ts checks the POST against, so the form
      // cannot offer a unit the endpoint then refuses. Refunds come off the
      // units that never went out first - see heldUnits.
      returnableQty: item.returnable
        ? returnableQty({ quantity: item.quantity, dispatchedQty }, item.refundedQty, returnsSpokenFor.get(item.id) ?? 0, returnsApproved.get(item.id) ?? 0)
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

/**
 * A part sent out to put this order right, as the customer needs to see it:
 * enough to recognise what it is and a way through to follow the parcel.
 *
 * Deliberately not the whole order. The replacement has its own page with the
 * whole tracking rail on it - this is the signpost, and a second set of parcel
 * details here would be two answers to the same question.
 */
export type MemberOrderReplacement = {
  order: ShpOrder
  /** What is actually in the box, in the customer's words rather than SKUs. */
  itemNames: string[]
  fulfilment: MemberOrderFulfilment
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
  /** The open issue reports, counted separately from the cancel/return slot - a
   *  broken leg and a change of mind are two different conversations - and
   *  counted as a LIST, because more than one can be open at a time. An order of
   *  eight desks is opened one carton at a time, and the second fault must not
   *  have to wait for the first to be decided. */
  openDamageRequests: ShpOrderRequestWithItems[]
  cancel: RequestEligibility
  return: RequestEligibility
  damage: RequestEligibility
  /** When the return window shuts, if one is running. */
  returnBy: Date | null
  /** Parts sent out to put this order right. Empty on almost every order, and
   *  always empty on a replacement - one level only. */
  replacements: MemberOrderReplacement[]
  /** On a replacement, the order it is putting right. Null on a sale. */
  parentOrder: ShpOrder | null
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

  const [items, dispatch, shipments, refunds, refundItems, downloads, requests, config, replacementOrders] = await Promise.all([
    getOrderItems(order.id),
    getOrderDispatchSummary(order.id),
    getShipmentsForOrder(order.id),
    listRefundsForOrder(order.id),
    listRefundItemsForOrder(order.id),
    listDownloadsForOrder(order.id),
    listRequestsForOrder(order.id),
    getShopConfigCached(),
    // Always asked, never expensive: it is one read on a partial index that has
    // no row at all for the overwhelming majority of orders. A replacement of a
    // replacement is not a thing, so this returns nothing on one.
    order.kind === 'REPLACEMENT' ? Promise.resolve([]) : listReplacementOrdersForParent(order.id),
  ])

  // The parts sent out to put this order right, and - the other way up - the
  // order a replacement is putting right. Both are what turns two orders the
  // customer cannot connect into one story they can follow.
  const [replacements, parentOrder] = await Promise.all([
    buildReplacements(replacementOrders),
    order.parentOrderId ? getOrderById(order.parentOrderId) : Promise.resolve(null),
  ])

  const productIds = items.map((i) => i.productId).filter((id): id is string => !!id)
  const [products, mediaByProduct] = await Promise.all([
    getProductsByIds(productIds),
    getProductMediaForProducts(productIds),
  ])

  const openRequest = requests.find((r) => r.status === 'PENDING' && r.type !== 'DAMAGE') ?? null
  // Oldest first, which is the order they were told about them in. listRequests
  // hands them back newest first.
  const openDamageRequests = requests.filter((r) => r.status === 'PENDING' && r.type === 'DAMAGE').reverse()
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
    // And the same for sending back, so a part-refunded order whose returnable
    // goods have all gone back already is told so, rather than offered a form
    // with nothing on it.
    returnLines: lines.map((line) => ({ returnableQty: line.returnableQty })),
  }

  // Only links that still hand a file over. One for a line since refunded (or
  // on an order refunded as a whole) now only opens a page saying so - see
  // lib/download-access.ts - so offering it here just sent the customer to be
  // told no.
  const itemById = new Map(items.map((item) => [item.id, item]))
  const orderRefunded = order.status === 'REFUNDED' || order.paymentStatus === 'REFUNDED'
  const liveDownloads = orderRefunded ? [] : downloads.filter((download) => {
    const item = itemById.get(download.orderItemId)
    return item !== undefined && item.refundedQty < item.quantity
  })

  return {
    order,
    lines,
    shipments,
    refunds,
    refundItems,
    downloads: liveDownloads,
    requests,
    openRequest,
    openDamageRequests,
    cancel: canRequestCancel(eligibilityInput),
    return: canRequestReturn(eligibilityInput),
    damage: canReportDamage(eligibilityInput),
    returnBy:
      lastShippedAt && config.returnRequestsEnabled && config.returnWindowDays > 0
        ? returnDeadline(lastShippedAt, config.returnWindowDays)
        : null,
    replacements,
    parentOrder,
  }
}

/** What is in each replacement and how far along it is, in as few queries as
 *  there are replacements - which is nearly always none, and never many. */
async function buildReplacements(orders: ShpOrder[]): Promise<MemberOrderReplacement[]> {
  if (orders.length === 0) return []
  const [itemsByOrder, dispatchByOrder] = await Promise.all([
    Promise.all(orders.map((o) => getOrderItems(o.id))),
    Promise.all(orders.map((o) => getOrderDispatchSummary(o.id))),
  ])
  return orders.map((order, index) => {
    const dispatch = dispatchByOrder[index]
    return {
      order,
      itemNames: (itemsByOrder[index] ?? []).map((item) => item.productName),
      fulfilment: dispatch?.fullyDispatched
        ? 'DISPATCHED'
        : dispatch?.partiallyDispatched
          ? 'PARTIAL'
          : 'UNDISPATCHED',
    }
  })
}
