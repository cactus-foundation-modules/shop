import { NOTHING_RETURNABLE_REASON, nonCancellableReason } from '@/modules/shop/lib/returnable'
import type {
  ShpOrder,
  ShpOrderItemDispatch,
  ShpOrderRequestType,
  ShpOrderRequestWithItems,
} from '@/modules/shop/lib/types'

// Whether a customer may ask, and what they may ask for. Pure rules, no
// database: the member page uses them to decide what to offer, and the API uses
// the same functions to decide whether to accept. One copy, so the button and
// the endpoint can never disagree - a "Cancel this order" button that 400s is
// worse than no button.

/**
 * Units of a line the shop has agreed not to supply and has not yet paid back.
 *
 * A cancellation is two facts about the same units - we will not send them, and
 * the money is coming back - and the second one can lag the first by days on a
 * shop that settles by bank transfer. Only the unpaid part is counted here,
 * because refunded units are ALREADY off the dispatch list (refundedQty comes
 * off outstanding in its own right) and counting them twice would quietly
 * shrink the order every time an approval and its refund went through together.
 */
export function unrefundedCancelledUnits(cancelledQty: number, refundedQty: number): number {
  return Math.max(cancelledQty - refundedQty, 0)
}

/**
 * What is still to be supplied on one line: what was bought, less what has gone
 * out, less what has been refunded, less anything called off and not yet paid
 * back.
 *
 * The one definition, used by the dispatch summary, the dispatch cap and the
 * cancellation rules alike. A second copy of this sum is how a shop ends up
 * offering to send units a customer has already had cancelled.
 */
export function outstandingUnits(line: {
  quantity: number
  refundedQty: number
  dispatchedQty: number
  cancelledQty: number
}): number {
  return Math.max(
    line.quantity - line.refundedQty - line.dispatchedQty - unrefundedCancelledUnits(line.cancelledQty, line.refundedQty),
    0,
  )
}

/**
 * How many units of a line may still be called off: whatever is still to be
 * supplied, less anything a live request has already spoken for - and nothing
 * at all on a line the shop does not take back.
 *
 * Goods a shop will not take back are goods it committed to the moment the
 * order was placed: cut, upholstered, or ordered in specially. The van not
 * having been yet does not put that back in the box, so the returns flag
 * decides both questions.
 */
export function cancellableQty(
  line: { outstandingQty: number; returnable: boolean },
  alreadyRequested = 0,
): number {
  if (!line.returnable) return 0
  return Math.max(line.outstandingQty - alreadyRequested, 0)
}

export const SHP_CANCEL_REASONS = [
  { code: 'CHANGED_MIND', label: 'I have changed my mind' },
  { code: 'ORDERED_WRONG', label: 'I ordered the wrong thing' },
  { code: 'FOUND_ELSEWHERE', label: 'I found it elsewhere' },
  { code: 'TOO_SLOW', label: 'It is taking longer than I can wait' },
  { code: 'OTHER', label: 'Something else' },
] as const

// Damage is deliberately NOT on this list. A return is a shopper deciding they
// do not want something; a broken one is the shop's mistake, and it needs
// photographs and a replacement rather than a queue position and a refund. Put
// side by side in a dropdown, "it arrived damaged" is the reason people pick,
// and it turns every breakage into a return the shop then has to unpick by
// email. So the offer is made in words instead - see DAMAGED_GOODS_GUIDANCE,
// which sits above the form.
export const SHP_RETURN_REASONS = [
  { code: 'WRONG_ITEM', label: 'The wrong item arrived' },
  { code: 'NOT_AS_DESCRIBED', label: 'It is not as described' },
  { code: 'NO_LONGER_NEEDED', label: 'I no longer need it' },
  { code: 'OTHER', label: 'Something else' },
] as const

/**
 * Codes no longer offered, kept so the requests that carry them still read as
 * English. Dropping a reason from the list must not turn every historical row
 * into the word FAULTY on the owner's queue - the request was honestly made
 * under the old list, and the record of it belongs to the customer.
 *
 * Not reachable from reasonsFor, so nothing new can be raised against one, and
 * a hand-rolled POST quoting an old code is refused like any other rubbish.
 */
const RETIRED_REASON_LABELS: Record<string, string> = {
  FAULTY: 'It arrived damaged or faulty',
}

/**
 * What the customer is told instead, above the return form. Damage is a
 * replacement, not a refund, and it starts with a photograph: a return raised
 * for a broken leg has the goods collected, checked and refunded when what the
 * shopper actually wanted was the leg.
 */
export const DAMAGED_GOODS_GUIDANCE =
  'Has something arrived damaged or faulty? Do not start a return - send us photographs of the damage and we will arrange a replacement.'

// Damage has its own list, and FAULTY is on it. The same word means two
// different things in the two places: on a return it was a shopper explaining
// why they wanted their money back, and here it is the start of a replacement.
export const SHP_DAMAGE_REASONS = [
  { code: 'ARRIVED_DAMAGED', label: 'It arrived damaged' },
  { code: 'FAULTY', label: 'It has developed a fault' },
  { code: 'PARTS_MISSING', label: 'Parts are missing or broken' },
  { code: 'OTHER', label: 'Something else' },
] as const

/**
 * How many photographs one report may carry.
 *
 * Six, because a damaged desk is a wide shot, the damage, the label on the
 * carton and one of the packaging it came in, and somebody always sends two of
 * the same thing. It is a cap on an upload a guest can reach with nothing but a
 * postcode, so it exists as much to bound that as to keep the queue readable.
 */
export const MAX_DAMAGE_PHOTOS = 6

/** The query the order page opens its issue-report form on. */
export const REPORT_ISSUE_QUERY_KEY = 'report'

/**
 * The order page, asked to open the issue-report form as it arrives.
 *
 * The whole point of the merge tag this fills: "something not right with your
 * order?" in an email is one click from a filled-in form rather than from an
 * order page the customer then has to read for the right button. It survives
 * the postcode gate on the way - see lib/order-link-intent.ts.
 *
 * Built by parsing rather than by appending a string, because the order link
 * already carries a token on it for guests and a second "?" makes an address
 * that opens nothing and proves nothing. Empty in, empty out: a shop with guest
 * tracking switched off has no order link to send anybody to, and the {{#if}}
 * in the email takes the whole line with it.
 */
export function reportIssueUrl(orderUrl: string): string {
  if (!orderUrl) return ''
  try {
    const url = new URL(orderUrl)
    url.searchParams.set(REPORT_ISSUE_QUERY_KEY, '1')
    return url.toString()
  } catch {
    return ''
  }
}

/**
 * Whether a cancellation covers everything the customer is still owed.
 *
 * A cancellation that names no lines has always meant the whole order. One that
 * names every line in full means exactly the same thing, and the shopper who
 * ticked every box deserves to be told so in the same words: "The whole order"
 * reads as a decision, and a list of nine products reads as homework.
 *
 * Measured against quantity less what has already been refunded, because that
 * is what is left to call off - a line refunded down to nothing is not a line
 * standing between this request and the whole order.
 */
export function coversWholeOrder(
  request: { type: ShpOrderRequestType; items: ReadonlyArray<{ orderItemId: string; quantity: number }> },
  orderItems: ReadonlyArray<{ id: string; quantity: number; refundedQty: number }>,
): boolean {
  if (request.type !== 'CANCEL') return false
  if (request.items.length === 0) return true
  const asked = new Map(request.items.map((line) => [line.orderItemId, line.quantity]))
  return orderItems.every((item) => (asked.get(item.id) ?? 0) >= item.quantity - item.refundedQty)
}

export function reasonsFor(type: ShpOrderRequestType): ReadonlyArray<{ code: string; label: string }> {
  if (type === 'CANCEL') return SHP_CANCEL_REASONS
  if (type === 'DAMAGE') return SHP_DAMAGE_REASONS
  return SHP_RETURN_REASONS
}

export function isValidReason(type: ShpOrderRequestType, code: string): boolean {
  return reasonsFor(type).some((r) => r.code === code)
}

export function reasonLabel(type: ShpOrderRequestType, code: string): string {
  return reasonsFor(type).find((r) => r.code === code)?.label ?? RETIRED_REASON_LABELS[code] ?? code
}

// Statuses where there is nothing left to call off or send back. CANCELLED and
// REFUNDED are already done; PENDING is an order whose payment never landed, so
// there is nothing to cancel that abandonment will not clear up by itself.
//
// PARTIALLY_REFUNDED is left off on purpose. Money back on one line is no
// reason to refuse the return of another, or the call-off of a line still on
// the shelf; the per-line figures (cancellable, returnLines) already take every
// refunded unit off what may be asked for, and say so when nothing is left.
const CLOSED_STATUSES = new Set(['CANCELLED', 'REFUNDED'])

export type RequestEligibility =
  | { allowed: true }
  | {
      allowed: false
      reason: string
      /**
       * True where the reason is not worth printing on the order page.
       *
       * The endpoint still answers with it - a hand-rolled POST deserves to be
       * told why it was turned away - but the customer looking at an order
       * placed twenty minutes ago does not need two lines explaining that
       * nothing has been dispatched yet. They can see that. Saying it makes the
       * page read as a list of things they have done wrong.
       */
      silent?: boolean
    }

/** One line, as the cancellation rules need to see it. */
export type CancelLinePosition = {
  productName: string
  /** Units that may still be called off - always 0 on a line the shop will not take back. */
  cancellableQty: number
  /** Units still to be supplied, whatever the returns policy says about them. */
  outstandingQty: number
  /** Whether the shop takes this line back at all, as snapshotted at checkout. */
  returnable: boolean
}

export type EligibilityInput = {
  order: Pick<ShpOrder, 'status' | 'paymentStatus'>
  dispatch: Pick<ShpOrderItemDispatch, 'outstandingQty' | 'dispatchedQty'>[]
  /**
   * Whether ANY line on this order may be sent back at all, as snapshotted at
   * checkout. False on an order of nothing but made-to-order goods, where the
   * window and the dispatch state are beside the point.
   *
   * Optional so a caller that has not looked it up gets today's behaviour rather
   * than a silent "no" - the per-line check in lib/db/order-requests.ts is the
   * one that actually holds the line, and it reads the columns itself.
   */
  anyReturnable?: boolean
  /**
   * The names of any lines the shop does not take back, which are therefore
   * also the lines it cannot be talked out of supplying once the order is
   * placed. Empty (or absent, on a caller that has not looked) leaves
   * cancelling exactly as it was.
   */
  nonCancellable?: string[]
  /**
   * Per-line cancellation position, where the caller has worked it out.
   *
   * A cancellation used to be all-or-nothing, so one dispatched line or one
   * bespoke line refused the whole order. Both of those are now per-line
   * answers: the customer calls off the lines that can be called off and is
   * told, by name, what has to stay. Absent means the caller has not looked,
   * and gets the old whole-order answer rather than a silent "no".
   */
  cancellable?: CancelLinePosition[]
  /**
   * Per-line return position, where the caller has worked it out: units the
   * customer is holding, has not been paid back for, and has not already asked
   * to send back (see returnableQty). Always 0 on a line the shop does not take
   * back.
   *
   * What stops a part-refunded order offering a return form with nothing on it.
   * A refund on one line is no reason to refuse the return of another, so the
   * order's status is not the test - the lines are. Absent means the caller has
   * not looked, and gets today's answer rather than a silent "no".
   */
  returnLines?: Array<{ returnableQty: number }>
  /** The most recent parcel's ship date, or null if nothing has gone out. */
  lastShippedAt: Date | null
  config: {
    cancelRequestsEnabled: boolean
    returnRequestsEnabled: boolean
    returnWindowDays: number
    damageReportsEnabled: boolean
  }
  /** Any cancel or return already open on this order. */
  openRequest?: ShpOrderRequestWithItems | null
  now?: Date
}

/** Cancelling is for units that have not started moving. The moment a unit is
 * in a van, calling it off is not a cancellation any more - it is a return, and
 * it goes through the return flow so the goods come back before the money does.
 *
 * Asked per line rather than of the whole order. A part-dispatched order still
 * has lines nobody has packed, and an order holding one bespoke desk beside
 * three stock chairs is not an order that has to be seen through in full - the
 * chairs can go, the desk cannot, and the customer is told which is which by
 * name. The refusals below are therefore only reached when NOTHING on the order
 * can be called off. */
export function canRequestCancel(input: EligibilityInput): RequestEligibility {
  if (!input.config.cancelRequestsEnabled) {
    return { allowed: false, reason: 'This shop handles cancellations by email. Get in touch and we will sort it.' }
  }
  if (input.openRequest) {
    return { allowed: false, reason: 'You already have a request open on this order. We will come back to you on it.' }
  }
  if (CLOSED_STATUSES.has(input.order.status)) {
    return { allowed: false, reason: 'This order has already been cancelled or refunded.' }
  }

  if (input.cancellable) {
    if (input.cancellable.some((line) => line.cancellableQty > 0)) return { allowed: true }

    // Nothing may go. Which of the three sentences that is depends on WHY, and
    // the customer needs the true one: "it is a return now" and "we cannot
    // unmake this one" send them to two different places.
    const stillHere = input.cancellable.filter((line) => line.outstandingQty > 0)
    if (stillHere.length === 0) {
      return input.dispatch.some((line) => line.dispatchedQty > 0)
        ? { allowed: false, reason: 'Everything on this order has been dispatched, so it is a return rather than a cancellation.' }
        : { allowed: false, reason: 'There is nothing left on this order to call off.' }
    }
    // Everything still to come is something the shop cannot be talked out of
    // supplying. Named, because "part of this order" sends the customer straight
    // to an email asking which part.
    return { allowed: false, reason: nonCancellableReason(stillHere.map((line) => line.productName)) }
  }

  // No per-line figures, so the old whole-order answer. Only a caller that has
  // not looked lands here - lib/member-orders.ts always looks - and it is
  // deliberately the cautious reading rather than a silent "yes".
  if (input.dispatch.some((line) => line.dispatchedQty > 0)) {
    return { allowed: false, reason: 'Part of this order has already been dispatched, so it is a return rather than a cancellation.' }
  }
  if (input.nonCancellable && input.nonCancellable.length > 0) {
    return { allowed: false, reason: nonCancellableReason(input.nonCancellable) }
  }
  return { allowed: true }
}

/** Returns are for goods that have actually arrived - so at least one unit has
 * to have been dispatched, and the window is counted from the last parcel out
 * rather than from the order date. An order that took three weeks to dispatch
 * must not eat the customer's return window while it sat on a shelf. */
export function canRequestReturn(input: EligibilityInput): RequestEligibility {
  if (!input.config.returnRequestsEnabled) {
    return { allowed: false, reason: 'This shop handles returns by email. Get in touch and we will sort it.' }
  }
  if (input.openRequest) {
    return { allowed: false, reason: 'You already have a request open on this order. We will come back to you on it.' }
  }
  if (CLOSED_STATUSES.has(input.order.status)) {
    return { allowed: false, reason: 'This order has already been cancelled or refunded.' }
  }
  if (!input.dispatch.some((line) => line.dispatchedQty > 0)) {
    return {
      allowed: false,
      reason: 'Nothing from this order has been dispatched yet, so there is nothing to send back.',
      silent: true,
    }
  }
  // Checked BEFORE the window, so an order of nothing but bespoke goods is told
  // the honest reason rather than being handed a deadline that was never going
  // to help it. Undefined means the caller did not look, which is not a "no".
  if (input.anyReturnable === false) {
    return { allowed: false, reason: NOTHING_RETURNABLE_REASON }
  }
  // Everything that arrived and can come back has already been paid back or
  // asked for. Checked before the window for the same reason as the line above:
  // a deadline is no help to an order with nothing left to send.
  if (input.returnLines && !input.returnLines.some((line) => line.returnableQty > 0)) {
    return {
      allowed: false,
      reason: 'Everything from this order that can come back is already being returned or has been refunded.',
    }
  }
  if (input.config.returnWindowDays === 0) {
    return { allowed: false, reason: 'This shop does not take returns through the website. Get in touch and we will help.' }
  }
  if (input.lastShippedAt) {
    const deadline = returnDeadline(input.lastShippedAt, input.config.returnWindowDays)
    if ((input.now ?? new Date()) > deadline) {
      return {
        allowed: false,
        reason: `The ${input.config.returnWindowDays}-day return window for this order closed on ${deadline.toLocaleDateString('en-GB')}. Get in touch if you think something is wrong with it.`,
      }
    }
  }
  return { allowed: true }
}

/**
 * Reporting an issue. The loosest of the three rules on purpose.
 *
 * No return window, because a fault does not read a calendar and the shop's
 * obligations over faulty goods outlive any window it chooses to offer. No
 * returnable check either: a made-to-measure desk that arrives smashed is still
 * smashed, and it is exactly the customer who cannot send it back who most
 * needs a way to say so. All that is required is that something has actually
 * turned up to be damaged.
 *
 * And no "you have already told us" either, which was the last thing in the way.
 * A report spends nothing - it names lines without taking them off the order -
 * so a second one costs the shop nothing but the reading. What refusing it cost
 * was the order of eight desks whose second carton is opened the next morning:
 * the button was gone, and the second fault arrived as an email attached to
 * nothing. See migration 053.
 *
 * The one thing that does close it is the money having gone back in full. An
 * order refunded down to its last unit has nothing on it the shop still owes
 * anybody a replacement for, and a report raised against it lands in the queue
 * offering to send a part for goods already paid for twice. A PART-refunded
 * order stays open: a refund on one line says nothing about a fault on the
 * next, and a line that had a little money back as goodwill is still the chair
 * the customer is sitting on.
 */
export function canReportDamage(input: EligibilityInput): RequestEligibility {
  if (!input.config.damageReportsEnabled) {
    return { allowed: false, reason: 'Get in touch about anything damaged or faulty and we will put it right.' }
  }
  if (input.order.status === 'CANCELLED') {
    return { allowed: false, reason: 'This order has been cancelled.' }
  }
  if (input.order.status === 'REFUNDED') {
    return { allowed: false, reason: 'This order has been refunded in full. Get in touch if something is still not right and we will help.' }
  }
  if (!input.dispatch.some((line) => line.dispatchedQty > 0)) {
    return {
      allowed: false,
      reason: 'Nothing from this order has been dispatched yet, so there is nothing to report.',
      silent: true,
    }
  }
  return { allowed: true }
}

export function returnDeadline(lastShippedAt: Date, windowDays: number): Date {
  const deadline = new Date(lastShippedAt)
  deadline.setDate(deadline.getDate() + windowDays)
  // End of that day, not the same clock time: a customer told they have until
  // the 30th should have until the end of the 30th.
  deadline.setHours(23, 59, 59, 999)
  return deadline
}

/**
 * Units of a line the customer is holding and has not been paid back for.
 *
 * Not "dispatched less refunded", which is what this used to be, because a
 * refund does not say WHICH units it paid for. A cancellation refunds units that
 * never left the building, and taking those off what arrived refused the return
 * of the very goods the customer was holding: two chairs ordered, one called off
 * and refunded, the other delivered - and "there is nothing left to return".
 *
 * So refunds are counted against the units that never went out first, which is
 * how every other sum in this module already treats them (outstandingUnits takes
 * refunded units off the dispatch list), and only what is left over comes off
 * what arrived. That is the smaller of what arrived and what has not been paid
 * back.
 */
export function heldUnits(line: { quantity: number; dispatchedQty: number; refundedQty: number }): number {
  return Math.max(Math.min(line.dispatchedQty, line.quantity - line.refundedQty), 0)
}

/** How many units of each line may still be sent back: what the customer is
 * holding and has not been paid back for, less anything a waiting RETURN has
 * spoken for.
 *
 * The two kinds of return are counted in different places, because an approved
 * one is usually refunded too. An APPROVED return has taken its units back off
 * the customer, so it comes off what was dispatched; a refund comes off what was
 * bought (heldUnits). Taking an approved-and-refunded return off both - which is
 * what one "already requested" figure did - counted the same chair twice, and a
 * customer who had sent one of two chairs back could not return the other. A
 * PENDING return has not happened yet, so it only reserves units out of what is
 * left.
 *
 * Cancellations are deliberately not counted here. They spend undispatched
 * units and returns spend dispatched ones, so netting one off the other refuses
 * the return of goods the customer is holding because they called off the part
 * that had not been packed yet. */
export function returnableQty(
  line: Pick<ShpOrderItemDispatch, 'quantity' | 'dispatchedQty'>,
  refundedQty: number,
  pendingReturns = 0,
  approvedReturns = 0,
): number {
  const holding = heldUnits({ quantity: line.quantity, dispatchedQty: line.dispatchedQty - approvedReturns, refundedQty })
  return Math.max(holding - pendingReturns, 0)
}

/**
 * Where a customer's damage photographs are filed in the media library: under
 * Orders / <order number> / issues, beside the order they belong to.
 *
 * One copy, because two routes have to agree on it. The photos route files the
 * upload here, and the report route only accepts photographs it finds here - a
 * media id is a global handle, and without the folder check a report on one
 * order could hang somebody else's photograph, or anything else in the library,
 * off it and have the owner's queue open it.
 */
export function damagePhotoFolderPath(orderNumber: string): string[] {
  return ['Orders', orderNumber, 'issues']
}

/** Units of one line that open requests have asked about, for the dispatch screen. */
export type PendingRequestUnits = { cancel: number; return: number }

/**
 * What customers have ASKED to call off or send back, line by line, that nobody
 * has decided yet.
 *
 * Deliberately not a cap. A cancellation somebody has merely asked for must not
 * stop the shop dispatching - the owner may yet say no, and holding the van on
 * every ask would stall fulfilment on every disputed order. But the person
 * packing ought to know before the goods go out, not after the refund has been
 * approved and the carriage paid for twice. So this is what the dispatch screen
 * warns with, and nothing more.
 *
 * A cancellation naming no lines asks for the whole order, so it counts against
 * everything still to go out.
 */
export function pendingRequestUnits(
  requests: ReadonlyArray<Pick<ShpOrderRequestWithItems, 'status' | 'type' | 'items'>>,
  lines: ReadonlyArray<Pick<ShpOrderItemDispatch, 'orderItemId' | 'outstandingQty'>>,
): Map<string, PendingRequestUnits> {
  const out = new Map<string, PendingRequestUnits>()
  const add = (orderItemId: string, kind: keyof PendingRequestUnits, quantity: number) => {
    if (quantity <= 0) return
    const current = out.get(orderItemId) ?? { cancel: 0, return: 0 }
    current[kind] += quantity
    out.set(orderItemId, current)
  }
  for (const request of requests) {
    if (request.status !== 'PENDING') continue
    // A damage report spends nothing and asks for nothing to be held back.
    if (request.type === 'DAMAGE') continue
    const kind = request.type === 'CANCEL' ? 'cancel' : 'return'
    if (kind === 'cancel' && request.items.length === 0) {
      for (const line of lines) add(line.orderItemId, 'cancel', line.outstandingQty)
      continue
    }
    for (const item of request.items) add(item.orderItemId, kind, item.quantity)
  }
  return out
}
