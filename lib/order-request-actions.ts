import { getOrderById, getOrderItems } from '@/modules/shop/lib/db/orders'
import { processRefund } from '@/modules/shop/lib/db/refunds'
import { createOrderRequest, decideRequest, type CreateOrderRequestInput } from '@/modules/shop/lib/db/order-requests'
import { getPaymentProvider } from '@/modules/shop/lib/payments/registry'
import { applyOrderStatusChange } from '@/modules/shop/lib/order-status'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import { sendShopEmail } from '@/modules/shop/lib/email'
import { notifyOrderCustomer } from '@/modules/shop/lib/order-notify'
import { formatMoney } from '@/modules/shop/lib/money'
import { reasonLabel } from '@/modules/shop/lib/order-requests'
import type { ShpOrder, ShpOrderItem, ShpOrderRequestWithItems } from '@/modules/shop/lib/types'

// What a cancel or return request actually DOES, as opposed to where it is
// stored. Same split as lib/order-status.ts: the database layer records, this
// decides what recording it means, and both the member API and the admin queue
// come through here so the two can never drift apart.

const TYPE_WORD = { CANCEL: 'cancellation', RETURN: 'return' } as const

function itemsSummary(request: ShpOrderRequestWithItems, orderItems: ShpOrderItem[]): string {
  if (request.items.length === 0) return 'The whole order'
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

  await sendQuietly(
    () =>
      notifyOrderCustomer('REQUEST_RECEIVED', order, {
        customerName: order.customerName,
        orderNumber: order.orderNumber,
        requestType: typeWord,
        requestReason: reasonLabel(request.type, request.reason),
        requestItems: summary,
        hasItems: request.items.length > 0 ? 'true' : 'false',
        shopName,
      }),
    'request received',
  )

  const adminAlertEmail = config.adminOrderAlertEmail || config.storeEmail
  if (adminAlertEmail) {
    await sendQuietly(
      () =>
        sendShopEmail('ADMIN_NEW_REQUEST', adminAlertEmail, {
          orderNumber: order.orderNumber,
          customerName: order.customerName,
          customerEmail: order.customerEmail,
          requestType: typeWord,
          requestReason: reasonLabel(request.type, request.reason),
          requestItems: summary,
          hasItems: request.items.length > 0 ? 'true' : 'false',
          customerNote: request.customerNote ?? '',
          hasCustomerNote: request.customerNote ? 'true' : 'false',
          shopName,
        }),
      'admin new request',
    )
  }

  return { ok: true, request }
}

// What a refund would cover. A CANCEL is the whole order less anything already
// refunded; a RETURN is exactly the lines that were asked for. Amounts use
// unitPrice x quantity, which is what the admin refund modal has always sent -
// two different arithmetics for the same lines would be worse than either.
function refundLines(
  request: ShpOrderRequestWithItems,
  orderItems: ShpOrderItem[],
): Array<{ orderItemId: string; quantity: number; amount: number }> {
  const wanted = request.type === 'CANCEL'
    ? orderItems.map((item) => ({ orderItemId: item.id, quantity: item.quantity - item.refundedQty }))
    : request.items.map((line) => ({ orderItemId: line.orderItemId, quantity: line.quantity }))

  const byId = new Map(orderItems.map((i) => [i.id, i]))
  return wanted
    .filter((line) => line.quantity > 0)
    .map((line) => {
      const item = byId.get(line.orderItemId)
      const unitPrice = Number(item?.unitPrice ?? 0)
      return {
        orderItemId: line.orderItemId,
        quantity: line.quantity,
        amount: Number((unitPrice * line.quantity).toFixed(2)),
      }
    })
}

async function issueRefund(
  order: ShpOrder,
  lines: Array<{ orderItemId: string; quantity: number; amount: number }>,
  reason: string,
  userId: string,
): Promise<{ ok: true; amount: number } | { ok: false; error: string }> {
  if (lines.length === 0) return { ok: false, error: 'There is nothing left to refund on this order.' }

  const provider = getPaymentProvider(order.paymentMethod)
  if (!provider) {
    // Bank transfer, cash on collection and the like. Saying so is far better
    // than recording a refund that never happened.
    return {
      ok: false,
      error: 'This order was not paid through a provider that can refund automatically. Approve without the refund and settle it by hand.',
    }
  }
  if (!order.paymentReference) {
    return { ok: false, error: 'This order has no payment reference to refund against.' }
  }

  const total = lines.reduce((sum, line) => sum + line.amount, 0)
  const outcome = await processRefund({
    orderId: order.id,
    reason,
    createdBy: userId,
    items: lines,
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
  return { ok: true, amount: total }
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
  const request = await decideRequest({
    requestId: input.requestId,
    status: 'APPROVED',
    adminNote: input.adminNote,
    decidedBy: input.userId,
  })
  if (!request) return { ok: false, status: 409, error: 'That request has already been decided.' }

  const [order, orderItems, config] = await Promise.all([
    getOrderById(request.orderId),
    getOrderItems(request.orderId),
    getShopConfigCached(),
  ])
  if (!order) return { ok: false, status: 404, error: 'Order not found' }

  let refundError: string | undefined
  let refundedAmount: number | undefined
  if (input.refund) {
    const result = await issueRefund(
      order,
      refundLines(request, orderItems),
      `${TYPE_WORD[request.type]} approved`,
      input.userId,
    )
    if (result.ok) refundedAmount = result.amount
    else refundError = result.error
  }

  if (request.type === 'CANCEL') {
    // sendEmail is off: the approval email below says the same thing and says
    // it better, and two emails about one decision is one too many.
    const changed = await applyOrderStatusChange({ orderId: order.id, status: 'CANCELLED', sendEmail: false })
    if (!changed.ok) {
      return { ok: true, request, refundError: refundError ?? changed.error, refundedAmount }
    }
  }

  await sendQuietly(
    () =>
      notifyOrderCustomer('REQUEST_APPROVED', order, {
        customerName: order.customerName,
        orderNumber: order.orderNumber,
        requestType: TYPE_WORD[request.type],
        adminNote: request.adminNote ?? '',
        hasAdminNote: request.adminNote ? 'true' : 'false',
        refundAmount: refundedAmount != null ? formatMoney(refundedAmount, config.currencySymbol) : '',
        hasRefund: refundedAmount != null ? 'true' : 'false',
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
      notifyOrderCustomer('REQUEST_DECLINED', order, {
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
