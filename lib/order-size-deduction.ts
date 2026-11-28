// Order-size deduction: the whole commercial rule, in one pure file.
//
// A product may carry a per-unit amount already inside its shelf price. Once the
// basket holds enough of that supplier's OFFER items - the lines carrying an
// amount, counted at the price they are charged once it is off - the amount comes
// off every one of them.
//
// Why offers only, and why at the reduced price: the threshold exists so the
// supplier's own minimum order is met whenever the money is given away. Judged
// on shelf prices with full-price items counted in, a basket could qualify while
// the purchase order behind it fell well short of that minimum, and the shop
// paid the supplier's small-order surcharge out of a margin it had just handed
// to the customer. Counted this way, a threshold set at the right figure
// guarantees the supplier's minimum by construction: full-price items on top can
// only add to the purchase order, never stand in for it.
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
import type { TaxViewSide } from '@/modules/shop/lib/tax-view-shared'

/** A supplier's rule: how much of their goods the basket needs. `threshold` is
 *  in stored price terms, matching the amounts on the products. */
export type OrderSizeDeductionRule = {
  supplier: string
  threshold: number
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
  /**
   * The stored per-unit amount on the product. Null/0/negative all mean none.
   *
   * It says how much of the price the shopper is being charged TODAY was put
   * there for this rule to take back off - whichever of a product's prices that
   * happens to be. The amount used to be ignored on anything not currently on
   * sale, which sounded like a guard against a stale stamp and was really a
   * guard against the ordinary case: a supplier whose amount sits inside the
   * NORMAL price could only be made to work by inventing a sale price for the
   * product, and the storefront then advertised that invention as an offer. The
   * stamp is the owner's statement about the current price; keeping it in step
   * with the price is the job of whatever sets the two, not of this file.
   */
  deduction: number | null | undefined
}

/** Where one supplier stands in this basket, for the copy and for the tests. */
export type OrderSizeDeductionState = {
  supplier: string
  /** Whether the offer subtotal reached the threshold. */
  qualified: boolean
  /**
   * This supplier's OFFER items in the basket, at the price they come to once
   * the amount is off, charges already taken out. Full-price lines are not in
   * it, and a line's own amount never is - so this is the figure the shopper
   * would actually pay for those items on a qualifying basket.
   */
  offerSubtotal: number
  threshold: number
  /** How much more of this supplier's offer items is needed. 0 once qualified. */
  shortfall: number
  /** What comes off the basket for this supplier, per unit x quantity across
   *  every carrying line. The figure a qualified basket has saved, or the one a
   *  short basket stands to save if it reaches the threshold as it is. */
  saving: number
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
 *  the line carries an amount: a line carrying none counts towards the threshold
 *  and loses nothing, which is the whole asymmetry of the rule and the easiest
 *  part of it to get wrong. */
function lineDeduction(line: OrderSizeDeductionLine): number | null {
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
 * Where every supplier in the basket stands.
 *
 * The test is on what the offer items come to AFTER their amounts are off, and
 * it is worked out directly from that - never by applying the deduction and then
 * looking at the result - so it still cannot oscillate: a line's reduced value
 * is the same figure whether or not the basket qualifies. One pass, no fixed
 * point to hunt for, nothing to guard against.
 *
 * Only lines carrying an amount count. A full-price line from the same supplier
 * is charged in full and adds nothing towards the threshold either: the point of
 * the threshold is that the supplier's minimum order is met by the offer items
 * alone.
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
    const per = lineDeduction(line)
    // A line carrying no amount is not an offer: it counts for nothing here, and
    // a supplier with no offers in the basket has no standing to report.
    if (per == null) continue
    let row = tally.get(rule.supplier)
    if (!row) {
      row = { rule, goods: 0, saving: 0 }
      tally.set(rule.supplier, row)
    }
    // Per unit, not per line: five chairs at £6 is £30.
    const off = per * Math.max(0, line.quantity)
    row.goods += Math.max(0, goodsValue(line) - off)
    row.saving += off
  }

  return [...tally.values()].map(({ rule, goods, saving }) => {
    const offerSubtotal = round2(goods)
    const qualified = offerSubtotal >= rule.threshold
    return {
      supplier: rule.supplier,
      qualified,
      offerSubtotal,
      threshold: rule.threshold,
      shortfall: qualified ? 0 : round2(rule.threshold - offerSubtotal),
      saving: round2(saving),
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
 * Only lines that actually carry an amount lose anything, and only they count
 * towards the threshold. Lines from the same supplier carrying none are charged
 * in full and left out of the sum.
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
// Shop composes these from figures and the supplier's own name. Nothing here
// says discount, saving, carriage or delivery - all four are a different thing,
// and three of them are somebody else's feature.

/** Money as this copy prints it: whole pounds bare, pence only where there are
 *  any. "£350" reads as a threshold; "£350.00" reads as a bill. */
export function tidyMoney(amount: number, currencySymbol = '£'): string {
  const formatted = formatMoney(amount, currencySymbol)
  return formatted.endsWith('.00') ? formatted.slice(0, -3) : formatted
}

/**
 * The finished product-page line. Composed server-side - by the detail block as
 * the page opens, and by the public route once the shopper picks a combination
 * - so the browser is handed wording rather than figures to assemble, and the
 * two paths can never word it differently.
 */
export type OrderSizeDeductionLineView = {
  /**
   * The whole sentence as plain text, exactly as it reads on screen. Kept
   * alongside the parts below so anything that cannot render markup - a fallback
   * path, a future surface, a test - has one string to print rather than
   * reassembling the pieces and risking a different sentence.
   */
  text: string
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
  /** " when you spend £339 or more on Dynamic Office Solutions offer prices". */
  tail: string
  /**
   * The figured half of the sentence on each side of tax, where the shopper's
   * VAT switch is on (lib/tax-view-shared.ts) - every figure in it, the
   * threshold included, moves together. Null or absent where the switch is off,
   * and then `was`/`now`/`tail` above are the whole story. The lead-in carries no
   * figure and is the same on both sides.
   */
  taxSides?: {
    defaultSide: TaxViewSide
    inc: OrderSizeDeductionFigures
    ex: OrderSizeDeductionFigures
  } | null
  /**
   * The supplier named in `tail`, with their page, where the shop publishes
   * one. Null or absent otherwise, and the name stays plain text. The name is
   * found in the tail rather than the tail being split here, so every side of
   * tax and every surface links the same words the same way.
   */
  supplierLink?: SupplierLink | null
}

/**
 * The supplier's name as it appears in a sentence, and where their page lives.
 * Only ever handed over where that page is actually published (see
 * supplierPageHref in lib/supplier-url.ts), so a renderer that finds one links
 * it and one that finds none prints the name as plain text.
 */
export type SupplierLink = { name: string; href: string }

/** The part of the line that carries money, on one side of tax. */
export type OrderSizeDeductionFigures = Pick<OrderSizeDeductionLineView, 'was' | 'now' | 'tail'>

/**
 * The product page's line, in the parts a renderer needs to dress it:
 *
 *   Get it for just  [£137]  £97  when you spend £339 or more on Dynamic Office Solutions offer prices
 *   \_ lead ______/  \_was_/  \now/  \_ tail ____________________________________________________/
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
  // "Offer prices" is what tells the shopper the threshold is counted at the
  // reduced figure, and only on the items that carry one - see the rule above.
  const tail = ` when you spend ${tidyMoney(threshold, currencySymbol)} or more on ${supplier} offer prices`
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
 *   "Add £44 more of Dynamic Office Solutions offers and £120 comes off."
 *
 * The saving quoted is what would come off the basket AS IT STANDS. Adding
 * another carrying item raises it, so the sentence under-promises and can never
 * over-promise.
 */
export function orderSizeDeductionShortfallNote(state: OrderSizeDeductionState, currencySymbol = '£'): string {
  return `Add ${tidyMoney(state.shortfall, currencySymbol)} more of ${state.supplier} offers and ${tidyMoney(state.saving, currencySymbol)} comes off.`
}

/**
 * And once they are over it:
 *
 *   "£120 has come off - your Dynamic Office Solutions offers are over £339."
 */
export function orderSizeDeductionQualifiedNote(state: OrderSizeDeductionState, currencySymbol = '£'): string {
  return `${tidyMoney(state.saving, currencySymbol)} has come off - your ${state.supplier} offers are over ${tidyMoney(state.threshold, currencySymbol)}.`
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
  /** Where a supplier's page lives, or null where it has none published. The
   *  basket links the name in the sentence to it. Omitted means no links. */
  supplierHref?: (supplier: string) => string | null,
): Array<{ id: string; text: string; amounts: string[]; link: SupplierLink | null }> {
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
      link: supplierLinkFor(s.supplier, supplierHref),
    }))
}

function supplierLinkFor(name: string, supplierHref?: (supplier: string) => string | null): SupplierLink | null {
  const href = supplierHref?.(name) ?? null
  return href ? { name, href } : null
}
