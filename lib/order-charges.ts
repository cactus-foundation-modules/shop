// Extra charges on an order that has already been placed.
//
// The case that started it: the courier could not deliver because nobody was
// in, and the carrier bills the shop for a second attempt. The shop raises that
// fee on the order, the order goes on hold, and the customer is emailed. From
// their own order page they then do one of two things:
//
//   - pay it, by card or whatever else the shop takes online, and the order
//     comes off hold and goes out again; or
//   - cancel instead, and have what they paid refunded LESS the fee, because
//     the attempt that already happened cost the shop exactly that.
//
// Nothing here knows about deliveries. The charge is whatever the owner calls
// it, and the same two doors apply to any one-off extra.
//
// The charge is paid for SEPARATELY from the order. The order's own payment -
// its method, its reference, the refund that may one day be sent against it -
// is never touched: a provider takes the fee against the charge's own id (see
// `settlesOrderCharges` in lib/payments/provider.ts), and only providers that
// have promised to handle that are offered.
//
// A kept fee needs no paperwork of its own. The cancellation refund simply sends
// back less than the order took, and its credit note says so line by line - so
// the fee is what is left standing on the invoice, VAT and all, and the books
// follow without being told. A PAID fee is money outside the order's invoice,
// and is recorded on the order's timeline for the owner's books.
import { getAdminPathCached } from '@/lib/config/site'
import { getSiteUrlOrNull } from '@/lib/config/env'
import { getShopConfigCached, getAvailablePaymentMethods, type ShpConfig } from '@/modules/shop/lib/config'
import { addOrderNote, getOrderById, getOrderItems, updateOrderStatus } from '@/modules/shop/lib/db/orders'
import { listRefundsForOrder } from '@/modules/shop/lib/db/refunds'
import {
  ChargeAlreadyPendingError, claimChargeForCancellation, getChargeById, insertCharge,
  markChargePaid, markChargeWaived, releaseKeptCharge, restoreHeldOrderStatus, setChargeRefund, setOrderRefundedInPart,
} from '@/modules/shop/lib/db/order-charges'
import { cancellationRefundPlan, chargeFigures, type CancellationRefundPlan } from '@/modules/shop/lib/order-charge-money'
import { describePayOnlineMethods, type PayOnlineMethod } from '@/modules/shop/lib/order-pay-online'
import { issueRefund } from '@/modules/shop/lib/order-request-actions'
import { refundRouteForOrder } from '@/modules/shop/lib/payments/order-refund-route'
import { notifyOrderCustomer } from '@/modules/shop/lib/order-notify'
import { sendShopEmail } from '@/modules/shop/lib/email'
import { formatMoney } from '@/modules/shop/lib/money'
import type { ShpOrder, ShpOrderCharge, ShpOrderStatus } from '@/modules/shop/lib/types'

/** Who took the step, for the timeline and the refund row. `customer` is the
 *  customer on their own order page; anything else is a staff user id. */
export type ChargeActor = { kind: 'customer' } | { kind: 'staff'; userId: string }

export type ChargeOutcome =
  | { ok: true; charge: ShpOrderCharge }
  | { ok: false; status: number; error: string }

/** The refund row's `created_by` for a refund the customer started. Not a user
 *  id, so the order screen names it (see the admin order route). */
export const CUSTOMER_REFUND_CREATED_BY = 'customer'

// An order that has already been called off has nothing left to charge for.
const UNCHARGEABLE: ReadonlySet<ShpOrderStatus> = new Set<ShpOrderStatus>(['CANCELLED', 'REFUNDED'])

function actorId(actor: ChargeActor): string | null {
  return actor.kind === 'staff' ? actor.userId : null
}

async function quietly(label: string, send: () => Promise<unknown>): Promise<void> {
  try {
    await send()
  } catch (error) {
    console.error(`[shop] ${label} email failed`, error)
  }
}

/** The customer's own order page, where the charge is paid or declined. Empty
 *  where the site address is not configured, which drops the link line. */
function orderPageUrl(order: Pick<ShpOrder, 'id'>): string {
  const site = getSiteUrlOrNull()
  return site ? `${site}/shop/account/orders/${order.id}` : ''
}

function chargeVars(charge: ShpOrderCharge, config: ShpConfig): Record<string, string> {
  const symbol = config.currencySymbol
  const taxed = Number(charge.taxAmount) > 0
  return {
    chargeReason: charge.reason,
    chargeNote: charge.note ?? '',
    hasChargeNote: charge.note ? 'true' : 'false',
    chargeNet: formatMoney(charge.netAmount, symbol),
    chargeTax: formatMoney(charge.taxAmount, symbol),
    chargeTotal: formatMoney(charge.total, symbol),
    hasChargeTax: taxed ? 'true' : 'false',
    taxLabel: config.invoiceTaxLabel || 'VAT',
  }
}

// ---------------------------------------------------------------------------
// Which ways a charge can be paid
// ---------------------------------------------------------------------------

/**
 * The methods a charge can be paid with right now: switched on for this shop,
 * automated, and willing to take a payment that is not the order's own (see
 * `settlesOrderCharges`). Empty is an ordinary answer - the customer is then
 * asked to get in touch, and staff record the payment by hand.
 */
export async function chargePayMethods(config: ShpConfig): Promise<PayOnlineMethod[]> {
  return describePayOnlineMethods(
    await getAvailablePaymentMethods(),
    (provider) => provider.settlesOrderCharges === true && provider.confirmMode !== 'manual',
    config,
  )
}

/** Re-asked on every pay request rather than trusted from the page that drew
 *  the button, which may have been open since before the charge was settled. */
export async function assertChargePayable(
  order: ShpOrder,
  charge: ShpOrderCharge | null,
  method: string,
): Promise<{ ok: true; charge: ShpOrderCharge } | { ok: false; status: number; error: string }> {
  if (!charge || charge.orderId !== order.id) return { ok: false, status: 404, error: 'That charge was not found on this order.' }
  if (charge.status !== 'PENDING') return { ok: false, status: 409, error: 'There is nothing left to pay on that charge.' }
  const methods = await chargePayMethods(await getShopConfigCached())
  if (!methods.some((candidate) => candidate.id === method)) {
    return { ok: false, status: 400, error: 'That way of paying is not available for this charge.' }
  }
  return { ok: true, charge }
}

// ---------------------------------------------------------------------------
// Raising one
// ---------------------------------------------------------------------------

export type RaiseChargeInput = {
  orderId: string
  reason: string
  note: string | null
  /** Before tax, in the order's currency. */
  netAmount: number
  /** A percentage. */
  taxRate: number
  /** Put the order on hold until the charge is settled. */
  holdOrder: boolean
  emailCustomer: boolean
  userId: string
}

export async function raiseOrderCharge(input: RaiseChargeInput): Promise<ChargeOutcome> {
  const order = await getOrderById(input.orderId)
  if (!order) return { ok: false, status: 404, error: 'Order not found' }
  if (UNCHARGEABLE.has(order.status)) {
    return { ok: false, status: 409, error: 'This order has already been cancelled or refunded, so there is nothing to charge against.' }
  }

  const figures = chargeFigures(input.netAmount, input.taxRate)
  if (!figures.ok) return { ok: false, status: 400, error: figures.error }

  // Only an order this charge actually puts on hold remembers where it was.
  // One already on hold for some other reason stays on hold when the charge is
  // settled - that reason has not gone away just because the fee has been paid.
  const holding = input.holdOrder && order.status !== 'ON_HOLD'

  let charge: ShpOrderCharge
  try {
    charge = await insertCharge({
      orderId: order.id,
      reason: input.reason,
      note: input.note,
      netAmount: figures.figures.net,
      taxRate: figures.figures.taxRate,
      taxAmount: figures.figures.tax,
      total: figures.figures.total,
      currency: order.currency,
      holdOrder: input.holdOrder,
      heldFromStatus: holding ? order.status : null,
      createdBy: input.userId,
    })
  } catch (error) {
    if (error instanceof ChargeAlreadyPendingError) return { ok: false, status: 409, error: error.message }
    throw error
  }

  // Straight to the column, not through applyOrderStatusChange: ON_HOLD sends
  // no email of its own, and the charge email below is the one that explains it.
  if (holding) await updateOrderStatus(order.id, 'ON_HOLD')

  const config = await getShopConfigCached()
  const symbol = config.currencySymbol
  await addOrderNote(
    order.id,
    `Charge raised: ${charge.reason}, ${formatMoney(charge.total, symbol)}` +
      (Number(charge.taxAmount) > 0
        ? ` (${formatMoney(charge.netAmount, symbol)} + ${formatMoney(charge.taxAmount, symbol)} ${config.invoiceTaxLabel || 'VAT'})`
        : '') +
      `.${holding ? ' Order put on hold until it is settled.' : ''}${input.emailCustomer ? ' Customer emailed.' : ''}`,
    true,
    input.userId,
  )

  if (input.emailCustomer) await sendChargeRaisedEmail(order, charge, config)

  return { ok: true, charge }
}

/** "There is a charge to pay on your order." Also what staff resend from the
 *  order screen. The cancellation figure is worked out at send time, so the
 *  email promises what the page will actually do. */
export async function sendChargeRaisedEmail(order: ShpOrder, charge: ShpOrderCharge, config?: ShpConfig): Promise<void> {
  const shop = config ?? (await getShopConfigCached())
  const plan = await planCancellation(order, charge)
  await quietly('charge raised', () =>
    notifyOrderCustomer('CHARGE_RAISED', order, {
      customerName: order.customerName,
      orderNumber: order.orderNumber,
      ...chargeVars(charge, shop),
      chargeUrl: orderPageUrl(order),
      hasChargeUrl: orderPageUrl(order) ? 'true' : 'false',
      isOnHold: charge.holdOrder ? 'true' : 'false',
      canCancel: plan.ok ? 'true' : 'false',
      cancelRefund: plan.ok ? formatMoney(plan.refund, shop.currencySymbol) : '',
      shopName: shop.shopTitle || 'Shop',
    }),
  )
}

// ---------------------------------------------------------------------------
// Paying one
// ---------------------------------------------------------------------------

/** For a payment provider's own settlement paths: is this id a charge, and
 *  what must the payment come to? Null for anything that is not a charge, which
 *  is the provider's cue to carry on looking for an order. */
export async function getOrderChargeForSettlement(
  id: string,
): Promise<{ id: string; orderId: string; total: string; currency: string; status: ShpOrderCharge['status'] } | null> {
  const charge = await getChargeById(id)
  if (!charge) return null
  return { id: charge.id, orderId: charge.orderId, total: charge.total, currency: charge.currency, status: charge.status }
}

/**
 * Records a charge as paid by a payment provider, exactly once, and puts the
 * order back where it was. Called from the order page's own confirm route and
 * from any provider's webhook or return route - whichever gets there first wins,
 * and the rest find it already done and return false.
 *
 * The provider has already checked the money matches the charge before calling
 * this. What it cannot know is whether the charge was settled some other way in
 * the meantime - the customer cancelled while the card was being taken - and a
 * payment that lands on a charge no longer pending is money the shop is now
 * holding for nothing. That is said loudly on the order's timeline rather than
 * swallowed, because somebody has to send it back.
 */
export async function settleOrderChargePayment(
  chargeId: string,
  payment: { method: string; providerReference: string | null },
): Promise<boolean> {
  const paid = await markChargePaid(chargeId, { method: payment.method, reference: payment.providerReference, resolvedBy: null })
  if (!paid) {
    const charge = await getChargeById(chargeId)
    if (charge && charge.status !== 'PAID') {
      const config = await getShopConfigCached()
      await addOrderNote(
        charge.orderId,
        `A payment of ${formatMoney(charge.total, config.currencySymbol)} came in for "${charge.reason}" after it had already been ` +
          `${charge.status === 'KEPT' ? 'kept back out of a cancellation refund' : 'waived'}. ` +
          `The customer has paid it twice over - refund that payment` +
          `${payment.providerReference ? ` (${payment.providerReference})` : ''} from the payment provider's own dashboard.`,
        true,
        null,
      )
    }
    return false
  }
  await afterChargePaid(paid, { kind: 'customer' }, true)
  return true
}

/** Staff recording a charge as paid some other way - over the phone, by bank
 *  transfer. Nothing is taken; it is written down. */
export async function recordChargePaidByHand(
  chargeId: string,
  input: { userId: string; reference: string | null; emailCustomer: boolean },
): Promise<ChargeOutcome> {
  const paid = await markChargePaid(chargeId, { method: 'MANUAL', reference: input.reference, resolvedBy: input.userId })
  if (!paid) return { ok: false, status: 409, error: 'That charge has already been settled.' }
  await afterChargePaid(paid, { kind: 'staff', userId: input.userId }, input.emailCustomer)
  return { ok: true, charge: paid }
}

async function afterChargePaid(charge: ShpOrderCharge, actor: ChargeActor, emailCustomer: boolean): Promise<void> {
  const released = await releaseHold(charge)
  const [order, config] = await Promise.all([getOrderById(charge.orderId), getShopConfigCached()])
  if (!order) return
  const symbol = config.currencySymbol
  const how = actor.kind === 'customer'
    ? `Paid online by the customer${charge.paymentReference ? ` (payment ${charge.paymentReference})` : ''}`
    : `Recorded as paid by staff${charge.paymentReference ? ` (reference ${charge.paymentReference})` : ''}`
  await addOrderNote(
    order.id,
    `${charge.reason} of ${formatMoney(charge.total, symbol)} paid. ${how}.` +
      `${released ? ' Order taken off hold.' : ''}` +
      ' This payment is not on the order\'s invoice - record it in your books separately.',
    true,
    actorId(actor),
  )

  if (emailCustomer) {
    await quietly('charge paid', () =>
      notifyOrderCustomer('CHARGE_PAID', order, {
        customerName: order.customerName,
        orderNumber: order.orderNumber,
        ...chargeVars(charge, config),
        shopName: config.shopTitle || 'Shop',
      }),
    )
  }
  // The owner only needs telling when the customer did it. Staff who recorded
  // it know.
  if (actor.kind === 'customer') {
    await sendAdminChargeUpdate(order, charge, config, `paid the ${charge.reason.toLowerCase()} online. The order is back to where it was, so the next step is yours.`)
  }
}

/** Puts the order back to where it was before the charge held it - only if the
 *  charge held it, and only if it is still on hold. True when it moved. */
async function releaseHold(charge: ShpOrderCharge): Promise<boolean> {
  if (!charge.holdOrder || !charge.heldFromStatus) return false
  return restoreHeldOrderStatus(charge.orderId, charge.heldFromStatus)
}

// ---------------------------------------------------------------------------
// Waiving one
// ---------------------------------------------------------------------------

export async function waiveOrderCharge(chargeId: string, userId: string): Promise<ChargeOutcome> {
  const waived = await markChargeWaived(chargeId, userId)
  if (!waived) return { ok: false, status: 409, error: 'That charge has already been settled.' }
  const released = await releaseHold(waived)
  const config = await getShopConfigCached()
  await addOrderNote(
    waived.orderId,
    `${waived.reason} of ${formatMoney(waived.total, config.currencySymbol)} waived.${released ? ' Order taken off hold.' : ''}`,
    true,
    userId,
  )
  return { ok: true, charge: waived }
}

// ---------------------------------------------------------------------------
// Cancelling instead
// ---------------------------------------------------------------------------

/** What cancelling this order now, keeping the charge back, would refund. The
 *  order page and the email both quote it, so both read it from here. */
export async function planCancellation(order: ShpOrder, charge: ShpOrderCharge): Promise<CancellationRefundPlan> {
  if (UNCHARGEABLE.has(order.status)) return { ok: false, error: 'This order has already been cancelled.' }
  if (!refundRouteForOrder(order)) {
    return { ok: false, error: 'This order was not paid through a method this shop can still refund.' }
  }
  const [items, refunds] = await Promise.all([getOrderItems(order.id), listRefundsForOrder(order.id)])
  return cancellationRefundPlan({ order, items, refunds, fee: Number(charge.total) })
}

export type CancelOutcome =
  | { ok: true; charge: ShpOrderCharge; refunded: number }
  | { ok: false; status: number; error: string }

/**
 * Cancels the order and refunds everything the customer paid, less the charge.
 *
 * The charge is claimed first (PENDING to KEPT), so a card payment arriving
 * mid-cancellation cannot also settle it. The refund goes next, down the same
 * route the order screen's refund button takes. If it is refused the claim is
 * handed back and nothing has changed - the customer can try again, or pay.
 * If it goes through, the order is closed and both sides are told.
 *
 * A refund whose outcome is unknown (the provider call died) keeps the claim:
 * the refund row is left PENDING for the reconciler, exactly as any other
 * stranded refund is, and releasing the charge would let somebody pay a fee that
 * may already have been kept.
 */
export async function cancelOrderKeepingCharge(chargeId: string, actor: ChargeActor): Promise<CancelOutcome> {
  const pending = await getChargeById(chargeId)
  if (!pending) return { ok: false, status: 404, error: 'That charge was not found.' }
  const order = await getOrderById(pending.orderId)
  if (!order) return { ok: false, status: 404, error: 'Order not found' }
  if (pending.status !== 'PENDING') return { ok: false, status: 409, error: 'That charge has already been settled.' }

  const plan = await planCancellation(order, pending)
  if (!plan.ok) return { ok: false, status: 409, error: plan.error }

  const charge = await claimChargeForCancellation(chargeId, actorId(actor))
  if (!charge) return { ok: false, status: 409, error: 'That charge has already been settled.' }

  const config = await getShopConfigCached()
  const symbol = config.currencySymbol
  const reason = `Order cancelled ${actor.kind === 'customer' ? 'by the customer' : 'by staff'} instead of paying the ${charge.reason.toLowerCase()} - ` +
    `${formatMoney(plan.kept, symbol)} kept back`

  let result: Awaited<ReturnType<typeof issueRefund>>
  try {
    result = await issueRefund(
      order,
      plan.lines,
      reason,
      actor.kind === 'staff' ? actor.userId : CUSTOMER_REFUND_CREATED_BY,
      plan.delivery,
    )
  } catch (error) {
    console.error(`[shop] cancellation refund for order ${order.orderNumber} did not finish`, error)
    await addOrderNote(
      order.id,
      `The customer chose to cancel instead of paying the ${charge.reason.toLowerCase()}, but the refund of ` +
        `${formatMoney(plan.refund, symbol)} did not finish and its outcome is not known. Check the payment provider ` +
        'before refunding again, then cancel the order by hand.',
      true,
      actorId(actor),
    )
    return { ok: false, status: 502, error: 'Your refund could not be finished just now. We have been told and will sort it out.' }
  }

  if (!result.ok) {
    await releaseKeptCharge(charge.id)
    return { ok: false, status: 502, error: result.error }
  }

  await setChargeRefund(charge.id, result.refundId)
  // The refund took every unit back, so it has marked the whole thing REFUNDED.
  // It was cancelled, and a fee was kept - "refunded in full" is the one thing
  // the page must not now say.
  await updateOrderStatus(order.id, 'CANCELLED')
  await setOrderRefundedInPart(order.id)

  const manual = refundRouteForOrder(order)?.refundMode === 'manual'
  await addOrderNote(
    order.id,
    `${reason}. Refunded ${formatMoney(result.amount, symbol)} of the ${formatMoney(plan.held, symbol)} paid, and the order cancelled.` +
      (manual ? ' This order was not paid by card, so the refund is recorded - send the money yourself.' : '') +
      ' If the goods are with a courier, arrange for them to come back.',
    true,
    actorId(actor),
  )

  await quietly('charge order cancelled', () =>
    notifyOrderCustomer('CHARGE_ORDER_CANCELLED', order, {
      customerName: order.customerName,
      orderNumber: order.orderNumber,
      ...chargeVars(charge, config),
      refundAmount: formatMoney(result.amount, symbol),
      paidAmount: formatMoney(plan.held, symbol),
      shopName: config.shopTitle || 'Shop',
    }),
  )
  if (actor.kind === 'customer') {
    await sendAdminChargeUpdate(
      order,
      charge,
      config,
      `cancelled the order rather than pay the ${charge.reason.toLowerCase()}. ` +
        `${formatMoney(result.amount, symbol)} has been refunded${manual ? ' on paper - send it yourself, as it was not paid by card' : ''}, ` +
        `and ${formatMoney(plan.kept, symbol)} kept back. If the goods are with a courier, arrange for them to come back.`,
    )
  }

  const kept = await getChargeById(charge.id)
  return { ok: true, charge: kept ?? charge, refunded: result.amount }
}

async function sendAdminChargeUpdate(order: ShpOrder, charge: ShpOrderCharge, config: ShpConfig, outcome: string): Promise<void> {
  const to = config.adminOrderAlertEmail || config.storeEmail
  if (!to) return
  const site = getSiteUrlOrNull()
  const adminPath = await getAdminPathCached()
  const adminOrderUrl = site && adminPath ? `${site}/${adminPath}/m/shop/orders/${order.id}` : ''
  await quietly('admin charge update', () =>
    sendShopEmail('ADMIN_CHARGE_UPDATE', to, {
      orderNumber: order.orderNumber,
      customerName: order.customerName,
      customerEmail: order.customerEmail,
      ...chargeVars(charge, config),
      chargeOutcome: outcome,
      adminOrderUrl,
      hasAdminOrderUrl: adminOrderUrl ? 'true' : 'false',
      shopName: config.shopTitle || 'Shop',
    }),
  )
}

/** The one charge on this order still waiting, if any. */
export function pendingCharge(charges: readonly ShpOrderCharge[]): ShpOrderCharge | null {
  return charges.find((charge) => charge.status === 'PENDING') ?? null
}
