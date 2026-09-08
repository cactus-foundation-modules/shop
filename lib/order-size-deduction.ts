// Order-size deduction: the whole commercial rule, in one pure file.
//
// A product may carry a per-unit amount already inside its shelf price. Once the
// basket holds enough of that supplier's goods, the amount comes off every line
// that carries one.
//
// It is NOT delivery, and must never be described as carriage. Delivery is a
// service the shop sells and prices; this is money already inside the goods
// price that stops being charged. The two live on the same product page, and
// conflating them is the single easiest way to get this wrong.
//
// Deliberately dependency-free (bar formatMoney, which is itself pure), so the
// storefront islands can import it without dragging the server-only data layer
// into the browser bundle - the same arrangement lib/min-order.ts has.

import { formatMoney } from '@/modules/shop/lib/money'

/** A supplier's rule: how much of their goods the basket needs, and the owner's
 *  own explanation of why any of this is happening. `threshold` is in stored
 *  price terms, matching the amounts on the products. */
export type OrderSizeDeductionRule = {
  supplier: string
  threshold: number
  note: string | null
}

/** One basket line, as the rule sees it. Structural rather than the checkout's
 *  own type so the pure tests can build one in a line and the client island can
 *  pass what it has. */
export type OrderSizeDeductionLine = {
  /** The supplier name on the product. A line with none never qualifies and
   *  never deducts - there is no rule for it to answer to. */
  supplier: string | null
  unitPrice: number
  quantity: number
  lineSubtotal: number
  /** What a cart-line resolver attributes to a named charge rather than to the
   *  goods, as LINE totals (see CartLineCharge). Subtracted from the qualifying
   *  subtotal: a delivery service inside a line's price is not goods, and a
   *  basket that clears the threshold only because of it never reached it. */
  charges?: ReadonlyArray<{ label: string; amount: number }> | null
  /** The stored per-unit amount on the product. Null/0/negative all mean none. */
  deduction: number | null | undefined
  /** Whether this line is CURRENTLY on offer. A stale amount left on a product
   *  whose sale has ended must never take money off a full price. */
  onOffer: boolean
}

/** Where one supplier stands in this basket, for the copy and for the tests. */
export type OrderSizeDeductionState = {
  supplier: string
  /** Whether the goods subtotal reached the threshold. Judged PRE-deduction. */
  qualified: boolean
  /** This supplier's goods in the basket, charges already taken out. */
  goodsSubtotal: number
  threshold: number
  /** How much more of this supplier's goods is needed. 0 once qualified. */
  shortfall: number
  /** What comes off the basket for this supplier, per unit x quantity across
   *  every carrying line. The figure a qualified basket has saved, or the one a
   *  short basket stands to save if it reaches the threshold as it is. */
  saving: number
  note: string | null
}

/** Round to the penny. Local rather than imported from lib/checkout so this file
 *  stays free of the server-only money path - same two lines, same result. */
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/**
 * A stored amount, read as a usable per-unit deduction.
 *
 * Null, zero, negatives and anything non-finite all come back as null - "no
 * amount". A recorded 0 is a different thing from a blank in the database (one
 * is a decision, the other is silence) but they behave identically here, and a
 * negative would otherwise ADD money to a price, which is not a thing this
 * feature is allowed to do.
 */
export function deductionAmount(stored: number | string | null | undefined): number | null {
  if (stored == null || stored === '') return null
  const n = Number(stored)
  if (!Number.isFinite(n) || n <= 0) return null
  return round2(n)
}

/** This line's goods value: its subtotal less anything a resolver attributes to
 *  a named charge. Never below zero. */
function goodsValue(line: OrderSizeDeductionLine): number {
  const charged = (line.charges ?? []).reduce((sum, c) => sum + (Number.isFinite(c.amount) ? c.amount : 0), 0)
  const subtotal = Number.isFinite(line.lineSubtotal) ? line.lineSubtotal : 0
  return Math.max(0, subtotal - charged)
}

/** What this line would lose, per unit, if its supplier qualified. Null unless
 *  the line is on offer AND carries an amount: a full-price line counts towards
 *  the threshold and loses nothing, which is the whole asymmetry of the rule and
 *  the easiest part of it to get wrong. */
function lineDeduction(line: OrderSizeDeductionLine): number | null {
  if (!line.onOffer) return null
  const amount = deductionAmount(line.deduction)
  if (amount == null) return null
  // A deduction may never take a line below nothing. Capped at the unit price
  // rather than refused outright: a mis-stamped row should charge zero, not a
  // negative, and the admin report beside this flags it either way.
  const unit = Number.isFinite(line.unitPrice) ? line.unitPrice : 0
  const capped = Math.min(amount, Math.max(0, unit))
  return capped > 0 ? round2(capped) : null
}

/**
 * Where every supplier in the basket stands, judged BEFORE any money comes off.
 *
 * That ordering is the reason this can never oscillate: a basket that qualifies
 * and then falls below the threshold once the amounts are taken off keeps its
 * deduction, because the test was already settled. One pass, no fixed point to
 * hunt for, nothing to guard against.
 *
 * Suppliers are scored separately - two suppliers' goods do not add up to one
 * supplier's threshold - and a line with no supplier at all is simply not in any
 * of these sums.
 */
export function orderSizeDeductionStates(
  lines: readonly OrderSizeDeductionLine[],
  rules: readonly OrderSizeDeductionRule[],
): OrderSizeDeductionState[] {
  const byName = new Map<string, OrderSizeDeductionRule>()
  for (const rule of rules) {
    if (!Number.isFinite(rule.threshold) || rule.threshold < 0) continue
    byName.set(rule.supplier.trim().toLowerCase(), rule)
  }
  if (byName.size === 0) return []

  // Goods and potential saving per supplier, in one pass over the basket.
  const tally = new Map<string, { rule: OrderSizeDeductionRule; goods: number; saving: number }>()
  for (const line of lines) {
    const name = line.supplier?.trim()
    if (!name) continue
    const rule = byName.get(name.toLowerCase())
    if (!rule) continue
    let row = tally.get(rule.supplier)
    if (!row) {
      row = { rule, goods: 0, saving: 0 }
      tally.set(rule.supplier, row)
    }
    row.goods += goodsValue(line)
    const per = lineDeduction(line)
    // Per unit, not per line: five chairs at £6 is £30.
    if (per != null) row.saving += per * Math.max(0, line.quantity)
  }

  return [...tally.values()].map(({ rule, goods, saving }) => {
    const goodsSubtotal = round2(goods)
    const qualified = goodsSubtotal >= rule.threshold
    return {
      supplier: rule.supplier,
      qualified,
      goodsSubtotal,
      threshold: rule.threshold,
      shortfall: qualified ? 0 : round2(rule.threshold - goodsSubtotal),
      saving: round2(saving),
      note: rule.note,
    }
  })
}

/** A line after the rule has run: what came off each unit, and what the line is
 *  worth now. `orderSizeDeduction` is per unit and display-only downstream - it
 *  has already been taken off `unitPrice`, and subtracting it again anywhere is
 *  a bug. Null on every line that lost nothing. */
export type DeductedLine<T> = T & {
  unitPrice: number
  lineSubtotal: number
  orderSizeDeduction: number | null
}

/**
 * The whole rule, applied to a basket: reduced lines, plus where each supplier
 * stands.
 *
 * Only lines that actually carry an amount lose anything. Full-price lines from
 * the same supplier count towards the threshold and are charged in full.
 */
export function applyOrderSizeDeduction<T extends OrderSizeDeductionLine>(
  lines: readonly T[],
  rules: readonly OrderSizeDeductionRule[],
): { lines: DeductedLine<T>[]; states: OrderSizeDeductionState[] } {
  const states = orderSizeDeductionStates(lines, rules)
  const qualified = new Set(
    states.filter((s) => s.qualified).map((s) => s.supplier.trim().toLowerCase()),
  )

  const out = lines.map((line): DeductedLine<T> => {
    const name = line.supplier?.trim().toLowerCase()
    const per = name && qualified.has(name) ? lineDeduction(line) : null
    if (per == null) return { ...line, unitPrice: line.unitPrice, lineSubtotal: line.lineSubtotal, orderSizeDeduction: null }
    const unitPrice = round2(Math.max(0, line.unitPrice - per))
    return {
      ...line,
      unitPrice,
      lineSubtotal: round2(unitPrice * line.quantity),
      orderSizeDeduction: per,
    }
  })

  return { lines: out, states }
}

// ---------------------------------------------------------------------------
// Copy
// ---------------------------------------------------------------------------
//
// Shop composes these from figures and the supplier's own name; the "why?" is
// the owner's note off the supplier record. Nothing here says discount, saving,
// carriage or delivery - all four are a different thing, and three of them are
// somebody else's feature.

/** Money as this copy prints it: whole pounds bare, pence only where there are
 *  any. "£350" reads as a threshold; "£350.00" reads as a bill. */
export function tidyMoney(amount: number, currencySymbol = '£'): string {
  const formatted = formatMoney(amount, currencySymbol)
  return formatted.endsWith('.00') ? formatted.slice(0, -3) : formatted
}

/**
 * The finished product-page line: the sentence itself, and the owner's own
 * "why?" copy to fold underneath it. Composed server-side - by the detail block
 * as the page opens, and by the public route once the shopper picks a
 * combination - so the browser is handed wording rather than figures to
 * assemble, and the two paths can never word it differently.
 */
export type OrderSizeDeductionLineView = {
  /**
   * The whole sentence as plain text, exactly as it reads on screen. Kept
   * alongside the parts below so anything that cannot render markup - a fallback
   * path, a future surface, a test - has one string to print rather than
   * reassembling the pieces and risking a different sentence.
   */
  text: string
  note: string | null
  /** "Get it for just " on a definite product, the range lead-in on a listing. */
  lead: string
  /**
   * What the shopper pays TODAY, struck through, when the deduction actually
   * moves it. Null where there is nothing to strike, so a renderer never draws a
   * line through a figure equal to the one beside it.
   */
  was: string | null
  /** What they would pay once the basket clears the threshold. */
  now: string
  /** " on Dynamic Office Solutions orders of £350 or more". */
  tail: string
}

/**
 * The product page's line, in the parts a renderer needs to dress it:
 *
 *   Get it for just  [£35]  £29  on Dynamic Office Solutions orders of £350 or more
 *   \_ lead ______/  \_was/  \now/  \_ tail _______________________________________/
 *
 * `was` is what the shopper pays TODAY and is struck through; `now` is what they
 * would pay once the basket clears the threshold. Showing both is the difference
 * between a price and an offer - one figure alone gave no sense that it was the
 * better of two, which is the same reason the lead-in exists.
 *
 * `was` comes back null when there is nothing to strike (no current price given,
 * or the two figures are equal), so a renderer can never draw a line through a
 * number identical to the one beside it.
 *
 * The lead-in is deliberate. Opening on the figure alone ("£110 on ...") read as
 * a specification rather than an offer - a second price sitting under the price,
 * with no hint that it is a better one. Naming it as something the shopper can
 * go and get is the difference between stating a fact and making an offer.
 *
 * On a listing where only SOME combinations carry an amount the lead-in changes
 * instead of a qualifier trailing after the sentence. A muted "Selected options"
 * on the end was the first attempt and was rejected in review: it is doing the
 * work of "depending on the options you pick" and does not read that way. If a
 * trailing qualifier is ever wanted, the fallback is "Some options only" - never
 * "Selected options".
 */
export function orderSizeDeductionLineParts(params: {
  reducedPrice: number
  supplier: string
  threshold: number
  /** What it costs today. Omitted, or equal to the reduced price, means nothing
   *  to strike through. */
  currentPrice?: number | null
  currencySymbol?: string
  someOptionsOnly?: boolean
}): { lead: string; was: string | null; now: string; tail: string; text: string } {
  const { reducedPrice, supplier, threshold, currentPrice, currencySymbol, someOptionsOnly } = params
  const lead = someOptionsOnly ? 'Some options drop to ' : 'Get it for just '
  const now = tidyMoney(reducedPrice, currencySymbol)
  const strike =
    currentPrice != null && Number.isFinite(currentPrice) && currentPrice > reducedPrice
      ? tidyMoney(currentPrice, currencySymbol)
      : null
  // Equal figures after formatting are the same price wearing two labels, and a
  // line through one of them would say something untrue about the other.
  const was = strike && strike !== now ? strike : null
  const tail = ` on ${supplier} orders of ${tidyMoney(threshold, currencySymbol)} or more`
  return { lead, was, now, tail, text: `${lead}${was ? `${was} ` : ''}${now}${tail}` }
}

/**
 * The same sentence as one plain string, for anywhere that cannot draw the
 * strike-through. Built from the parts above rather than beside them, so the two
 * can never word it differently.
 */
export function orderSizeDeductionLine(params: {
  reducedPrice: number
  supplier: string
  threshold: number
  currentPrice?: number | null
  currencySymbol?: string
}): string {
  return orderSizeDeductionLineParts(params).text
}

/** The listing wording, as one plain string. */
export function orderSizeDeductionRangeLine(params: {
  reducedPrice: number
  supplier: string
  threshold: number
  currentPrice?: number | null
  currencySymbol?: string
}): string {
  return orderSizeDeductionLineParts({ ...params, someOptionsOnly: true }).text
}

/**
 * The basket's nudge, for a supplier the shopper is short of:
 *
 *   "Add £62 more from Dynamic Office Solutions and save £24."
 *
 * The saving quoted is what would come off the basket AS IT STANDS. Adding
 * another carrying item raises it, so the sentence under-promises and can never
 * over-promise.
 */
export function orderSizeDeductionShortfallNote(state: OrderSizeDeductionState, currencySymbol = '£'): string {
  return `Add ${tidyMoney(state.shortfall, currencySymbol)} more from ${state.supplier} and save ${tidyMoney(state.saving, currencySymbol)}.`
}

/**
 * And once they are over it:
 *
 *   "£24 has come off this order - your Dynamic Office Solutions items are over £350."
 */
export function orderSizeDeductionQualifiedNote(state: OrderSizeDeductionState, currencySymbol = '£'): string {
  return `${tidyMoney(state.saving, currencySymbol)} has come off this order - your ${state.supplier} items are over ${tidyMoney(state.threshold, currencySymbol)}.`
}

/**
 * Every note the basket should print, in supplier order.
 *
 * Silent in four cases, all of which are "there is nothing to say" rather than
 * "something went wrong": no supplier rule at all; nothing in the basket
 * carrying an amount; qualified but with nothing to take off; and a shortfall
 * against a supplier the shopper has no carrying items from. The last is the one
 * worth spelling out - telling somebody to spend another £62 to save nothing is
 * worse than saying nothing at all.
 */
export function orderSizeDeductionNotes(
  states: readonly OrderSizeDeductionState[],
  currencySymbol = '£',
): Array<{ id: string; text: string; amounts: string[] }> {
  return states
    .filter((s) => s.saving > 0)
    .map((s) => ({
      id: `shop-order-size-deduction:${s.supplier}`,
      text: s.qualified
        ? orderSizeDeductionQualifiedNote(s, currencySymbol)
        : orderSizeDeductionShortfallNote(s, currencySymbol),
      // The money inside the sentence, formatted exactly as it appears there, so
      // the basket can set the figures apart without going looking for them.
      // Same arrangement as the product page's parts: the composer knows the
      // answer, so it says it rather than leaving a regular expression to guess.
      amounts: s.qualified
        ? [tidyMoney(s.saving, currencySymbol), tidyMoney(s.threshold, currencySymbol)]
        : [tidyMoney(s.shortfall, currencySymbol), tidyMoney(s.saving, currencySymbol)],
    }))
}
