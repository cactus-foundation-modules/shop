import { getOrderById, getOrderItems } from '@/modules/shop/lib/db/orders'
import { getOrderDispatchSummary } from '@/modules/shop/lib/db/shipments'
import { listRefundsForOrder, processRefund } from '@/modules/shop/lib/db/refunds'
import { creditNoteForSettledRefund } from '@/modules/shop/lib/credit-notes'
import { createOrderRequest, decideRequest, getRequestById, type CreateOrderRequestInput } from '@/modules/shop/lib/db/order-requests'
import { refundRouteForOrder } from '@/modules/shop/lib/payments/order-refund-route'
import { applyOrderStatusChange } from '@/modules/shop/lib/order-status'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import { sendShopEmail } from '@/modules/shop/lib/email'
import { notifyOrderCustomer } from '@/modules/shop/lib/order-notify'
import { formatMoney } from '@/modules/shop/lib/money'
import { netOffReturnCharge, type RefundLine } from '@/modules/shop/lib/return-charge'
import { requestRefundLines, withinRemaining } from '@/modules/shop/lib/request-refund-lines'
import { coversWholeOrder, heldUnits, reasonLabel } from '@/modules/shop/lib/order-requests'
import { refundableDelivery } from '@/modules/shop/lib/refund-delivery'
import type { ShpOrder, ShpOrderItem, ShpOrderRequestWithItems } from '@/modules/shop/lib/types'

// What a cancel or return request actually DOES, as opposed to where it is
// stored. Same split as lib/order-status.ts: the database layer records, this
// decides what recording it means, and both the member API and the admin queue
// come through here so the two can never drift apart.

const TYPE_WORD = { CANCEL: 'cancellation', RETURN: 'return', DAMAGE: 'damage report' } as const

function itemsSummary(request: ShpOrderRequestWithItems, orderItems: ShpOrderItem[]): string {
  if (request.items.length === 0 || coversWholeOrder(request, orderItems)) return 'The whole order'
  const byId = new Map(orderItems.map((i) => [i.id, i]))
  return request.items
    .map((line) => `${byId.get(line.orderItemId)?.productName ?? 'Item'} x${line.quantity}`)
    .join(', ')
}

// A send that throws must not undo a decision that has already been made: the
// request is recorded, the money may already have moved, and an SMTP hiccup is
// not a reason to tell the caller none of it happened.
async function sendQuietly(send: () => Promise<void>, context: string): Promise<void> {
  try {
    await send()
  } catch (error) {
    console.error(`[shop] ${context} email failed to send`, error)
  }
}

export type SubmitRequestResult =
  | { ok: false; status: number; error: string }
  | { ok: true; request: ShpOrderRequestWithItems }

/** Records a customer's request and tells both sides about it. */
export async function submitOrderRequest(input: CreateOrderRequestInput): Promise<SubmitRequestResult> {
  const created = await createOrderRequest(input)
  if (!created.ok) return created

  const request = created.request
  const [order, orderItems, config] = await Promise.all([
    getOrderById(request.orderId),
    getOrderItems(request.orderId),
    getShopConfigCached(),
  ])
  if (!order) return { ok: true, request } // recorded; nothing left to email about

  const typeWord = TYPE_WORD[request.type]
  const summary = itemsSummary(request, orderItems)
  const shopName = config.shopTitle || 'Shop'

  const isDamage = request.type === 'DAMAGE'

  await sendQuietly(
    () =>
      notifyOrderCustomer(isDamage ? 'DAMAGE_RECEIVED' : 'REQUEST_RECEIVED', order, {
        customerName: order.customerName,
        orderNumber: order.orderNumber,
        requestType: typeWord,
        requestReason: reasonLabel(request.type, request.reason),
        requestItems: summary,
        hasItems: request.items.length > 0 ? 'true' : 'false',
        // Said back to them so somebody who uploaded four pictures on a phone
        // knows all four landed, without opening the order to count.
        photoCount: String(request.photos.length),
        hasPhotos: request.photos.length > 0 ? 'true' : 'false',
        shopName,
      }),
    'request received',
  )

  const adminAlertEmail = config.adminOrderAlertEmail || config.storeEmail
  if (adminAlertEmail) {
    await sendQuietly(
      () =>
        sendShopEmail(isDamage ? 'ADMIN_NEW_DAMAGE' : 'ADMIN_NEW_REQUEST', adminAlertEmail, {
          orderNumber: order.orderNumber,
          customerName: order.customerName,
          customerEmail: order.customerEmail,
          requestType: typeWord,
          requestReason: reasonLabel(request.type, request.reason),
          requestItems: summary,
          hasItems: request.items.length > 0 ? 'true' : 'false',
          customerNote: request.customerNote ?? '',
          hasCustomerNote: request.customerNote ? 'true' : 'false',
          photoCount: String(request.photos.length),
          hasPhotos: request.photos.length > 0 ? 'true' : 'false',
          shopName,
        }),
      'admin new request',
    )
  }

  return { ok: true, request }
}

// What a refund would cover: exactly the lines that were asked for, or - on a
// request that named none, which is what a whole-order cancellation is -
// everything not already refunded, each at what the customer actually paid for
// those units. That used to be unitPrice x quantity, which on an EXCLUSIVE shop
// is the net figure: every refund approved from the queue kept the VAT. See
// lib/request-refund-lines.ts for the arithmetic.
//
// Kept inside what is left of the order's money, so penny rounding between the
// lines and the order total cannot turn the right refund into a refused one.
// Anything already refunded, or still in flight, counts as gone.
//
// A cancellation only ever refunds units still on the shelf. It is about goods
// that have not gone, and the dispatch screen only warns about a waiting one -
// so by the time it is approved some of what it named may be on a van, and a
// refund for those is a refund for goods the customer is holding. They come
// back through a return like anything else that arrived.
async function refundLines(
  request: ShpOrderRequestWithItems,
  orderItems: ShpOrderItem[],
  order: ShpOrder,
): Promise<{ lines: RefundLine[]; delivery: number }> {
  let asked: { items: ReadonlyArray<{ orderItemId: string; quantity: number }> } = request
  let nothingSent = false
  if (request.type === 'CANCEL') {
    const summary = await getOrderDispatchSummary(order.id)
    const dispatched = new Map(summary.lines.map((line) => [line.orderItemId, line.dispatchedQty]))
    nothingSent = summary.lines.every((line) => line.dispatchedQty === 0)
    const onShelf = (item: ShpOrderItem) =>
      Math.max(item.quantity - item.refundedQty - heldUnits({ quantity: item.quantity, dispatchedQty: dispatched.get(item.id) ?? 0, refundedQty: item.refundedQty }), 0)
    const byId = new Map(orderItems.map((item) => [item.id, item]))
    const named = request.items.length === 0
      ? orderItems.map((item) => ({ orderItemId: item.id, quantity: item.quantity - item.refundedQty }))
      : request.items
    asked = {
      items: named.map((line) => {
        const item = byId.get(line.orderItemId)
        return { ...line, quantity: item ? Math.min(line.quantity, onShelf(item)) : 0 }
      }),
    }
  }
  const lines = requestRefundLines(asked, orderItems, order)
  const refunds = await listRefundsForOrder(order.id)
  const alreadyGone = refunds
    .filter((refund) => refund.status === 'COMPLETED' || refund.status === 'PENDING')
    .reduce((sum, refund) => sum + Number(refund.amount), 0)
  // The delivery charge goes back with a cancellation of the WHOLE order made
  // before anything was sent: the customer is owed the standard delivery on an
  // order called off before it left, and nothing has been spent carrying it. A
  // cancellation of some items, or of an order already partly on its way, keeps
  // its delivery - that van ran, or will. The owner can still refund it from
  // the order screen.
  const wholeOrder = request.items.length === 0 || coversWholeOrder(request, orderItems)
  const delivery = request.type === 'CANCEL' && wholeOrder && nothingSent
    ? refundableDelivery(order, orderItems, refunds)
    : 0
  return { lines: withinRemaining(lines, Number(order.total) - alreadyGone - delivery), delivery }
}

// Exported for lib/order-charges.ts, whose "cancel and keep the fee" is the same
// money going back down the same route, and needs the refund's id to point at.
export async function issueRefund(
  order: ShpOrder,
  lines: Array<{ orderItemId: string; quantity: number; amount: number }>,
  reason: string,
  userId: string,
  // The delivery charge going back with it, tax and all (see refundLines).
  delivery = 0,
): Promise<{ ok: true; amount: number; refundId: string } | { ok: false; error: string }> {
  if (lines.length === 0 && !(delivery > 0)) return { ok: false, error: 'There is nothing left to refund on this order.' }

  // The same route the order screen's refund button takes (lib/payments/
  // order-refund-route.ts): a card refund goes back through the card provider,
  // and a bank transfer, cash or charged replacement part is recorded for the
  // owner to send. Looking the parent's provider up directly sent a charged
  // replacement's refund to a card provider that never took the money.
  const provider = refundRouteForOrder(order)
  if (!provider) {
    // A method whose module has since been removed. Saying so is far better
    // than recording a refund that never happened.
    return {
      ok: false,
      error: 'This order was not paid through a method this shop can still refund. Approve without the refund and settle it by hand.',
    }
  }
  if (order.kind !== 'REPLACEMENT' && !order.paymentReference && (order.paymentMethod === 'STRIPE' || order.paymentMethod === 'PAYPAL')) {
    return { ok: false, error: 'This order has no payment reference to refund against.' }
  }

  const total = lines.reduce((sum, line) => sum + line.amount, 0) + delivery
  const outcome = await processRefund({
    orderId: order.id,
    reason,
    createdBy: userId,
    items: lines,
    shippingAmount: delivery,
    performRefund: async (idempotencyKey) => {
      const result = await provider.refundOrder({
        providerReference: order.paymentReference ?? '',
        amount: total,
        currency: order.currency,
        items: lines.map((line) => ({ name: line.orderItemId, quantity: line.quantity, amount: line.amount })),
        idempotencyKey,
      })
      return { success: result.success, providerRefundId: result.providerRefundId ?? null, error: result.error }
    },
  })

  if (!outcome.ok) return { ok: false, error: outcome.error }
  if (!outcome.success) return { ok: false, error: outcome.error ?? 'The payment provider refused the refund.' }
  // A refund approved off the back of a return is the same money going back as
  // one done from the order screen, and needs the same paperwork.
  await creditNoteForSettledRefund(outcome.refundId, { userId })
  return { ok: true, amount: total, refundId: outcome.refundId }
}

/**
 * Whether approving this cancellation finishes the order off.
 *
 * A cancellation naming no lines is the whole order by definition and closes it
 * outright, refund or no refund - the customer asked for it to be called off and
 * we agreed, so leaving it live and dispatchable because a card processor had a
 * bad minute would be the worse of the two failures.
 *
 * One that names lines closes the order only when nothing survives it: an order
 * of five chairs where two are called off is still an order for three, and
 * marking it CANCELLED would stop the shop sending them. Read back off the
 * dispatch summary AFTER the decision has been recorded, so the units this
 * approval has just taken off are already in the figures - and the same figures
 * the dispatch screen uses, so the two cannot disagree about whether there is
 * anything left to pack.
 */
async function cancellationClosesOrder(request: ShpOrderRequestWithItems, orderId: string): Promise<boolean> {
  if (request.items.length === 0) return true
  const summary = await getOrderDispatchSummary(orderId)
  return summary.lines.every((line) => line.outstandingQty === 0 && line.dispatchedQty === 0)
}

export type DecideRequestOutcome =
  | { ok: false; status: number; error: string }
  | { ok: true; request: ShpOrderRequestWithItems; refundError?: string; refundedAmount?: number }

export type ApproveInput = {
  requestId: string
  adminNote?: string | null
  userId: string
  /** Send the money back as part of approving. Off leaves it to the owner. */
  refund: boolean
  /**
   * What the shop keeps back for collecting the goods. Recorded on the request
   * whether or not the refund goes out now, because a shop that approves today
   * and refunds when the van comes back still has to remember what it said it
   * would keep. Ignored on anything but a return.
   */
  returnCharge?: number | null
}

/** Approves a request: records the decision, optionally refunds, and for a
 * cancellation closes the order.
 *
 * Order matters. The decision is recorded first so two admins cannot both run
 * the refund behind it - decideRequest only moves a PENDING row, so the second
 * one finds nothing and stops. The refund goes next, because it is the only
 * step that can fail in a way worth reporting. The status change goes last and
 * happens either way: the customer asked for the order to be called off and we
 * agreed, so leaving it live and dispatchable because a card processor had a
 * bad minute would be the worse of the two failures. A refund that did not go
 * through comes back in `refundError` and can be retried from the order screen,
 * where the refund UI already lives. */
export async function approveOrderRequest(input: ApproveInput): Promise<DecideRequestOutcome> {
  // A cancellation of the whole order is refused once any of it has gone out.
  // Approving it would close an order with goods on the customer's doorstep,
  // which is not a cancellation any more. The creation-time check cannot cover
  // this: the dispatch screen only warns about a waiting request, so the goods
  // can leave between the ask and the answer.
  const pending = await getRequestById(input.requestId)
  if (pending?.type === 'CANCEL' && pending.items.length === 0) {
    const summary = await getOrderDispatchSummary(pending.orderId)
    if (summary.lines.some((line) => line.dispatchedQty > 0)) {
      return {
        ok: false,
        status: 409,
        error: 'Part of this order has already been sent, so it can no longer be cancelled as a whole. Decline this, then refund what has not gone and arrange a return for what has.',
      }
    }
  }

  const request = await decideRequest({
    requestId: input.requestId,
    status: 'APPROVED',
    adminNote: input.adminNote,
    returnCharge: input.returnCharge,
    decidedBy: input.userId,
  })
  if (!request) return { ok: false, status: 409, error: 'That request has already been decided.' }

  const [order, orderItems, config] = await Promise.all([
    getOrderById(request.orderId),
    getOrderItems(request.orderId),
    getShopConfigCached(),
  ])
  if (!order) return { ok: false, status: 404, error: 'Order not found' }

  // Read back off the row rather than off the input: decideRequest is the one
  // that decides whether a charge applies to this kind of request at all, and
  // the figure the customer is told has to be the figure that was stored.
  const returnCharge = Number(request.returnCharge ?? 0)

  let refundError: string | undefined
  let refundedAmount: number | undefined
  if (input.refund) {
    const planned = await refundLines(request, orderItems, order)
    const netted = netOffReturnCharge(planned.lines, returnCharge)
    if (!netted.ok) {
      // The approval stands and the charge is recorded; only the money has not
      // moved. Told plainly rather than swallowed, and retriable from the order
      // screen where the refund UI lives.
      refundError = netted.error
    } else {
      const result = await issueRefund(
        order,
        netted.lines,
        netted.charge > 0
          ? `${TYPE_WORD[request.type]} approved, less a ${formatMoney(netted.charge, config.currencySymbol)} return charge`
          : `${TYPE_WORD[request.type]} approved`,
        input.userId,
        planned.delivery,
      )
      if (result.ok) refundedAmount = result.amount
      else refundError = result.error
    }
  }

  if (request.type === 'CANCEL' && await cancellationClosesOrder(request, order.id)) {
    // sendEmail is off: the approval email below says the same thing and says
    // it better, and two emails about one decision is one too many.
    const changed = await applyOrderStatusChange({ orderId: order.id, status: 'CANCELLED', sendEmail: false })
    if (!changed.ok) {
      return { ok: true, request, refundError: refundError ?? changed.error, refundedAmount }
    }
  }

  await sendQuietly(
    () =>
      notifyOrderCustomer(request.type === 'DAMAGE' ? 'DAMAGE_RESOLVED' : 'REQUEST_APPROVED', order, {
        customerName: order.customerName,
        orderNumber: order.orderNumber,
        requestType: TYPE_WORD[request.type],
        adminNote: request.adminNote ?? '',
        hasAdminNote: request.adminNote ? 'true' : 'false',
        refundAmount: refundedAmount != null ? formatMoney(refundedAmount, config.currencySymbol) : '',
        hasRefund: refundedAmount != null ? 'true' : 'false',
        // Said whether or not the money has moved yet: a customer who is told
        // the figure now cannot be surprised by it when the refund lands.
        returnCharge: returnCharge > 0 ? formatMoney(returnCharge, config.currencySymbol) : '',
        hasReturnCharge: returnCharge > 0 ? 'true' : 'false',
        shopName: config.shopTitle || 'Shop',
      }),
    'request approved',
  )

  return { ok: true, request, refundError, refundedAmount }
}

export async function declineOrderRequest(input: {
  requestId: string
  adminNote?: string | null
  userId: string
}): Promise<DecideRequestOutcome> {
  const request = await decideRequest({
    requestId: input.requestId,
    status: 'DECLINED',
    adminNote: input.adminNote,
    decidedBy: input.userId,
  })
  if (!request) return { ok: false, status: 409, error: 'That request has already been decided.' }

  const [order, config] = await Promise.all([getOrderById(request.orderId), getShopConfigCached()])
  if (!order) return { ok: true, request }

  await sendQuietly(
    () =>
      notifyOrderCustomer(request.type === 'DAMAGE' ? 'DAMAGE_DECLINED' : 'REQUEST_DECLINED', order, {
        customerName: order.customerName,
        orderNumber: order.orderNumber,
        requestType: TYPE_WORD[request.type],
        adminNote: request.adminNote ?? '',
        hasAdminNote: request.adminNote ? 'true' : 'false',
        shopName: config.shopTitle || 'Shop',
      }),
    'request declined',
  )

  return { ok: true, request }
}
