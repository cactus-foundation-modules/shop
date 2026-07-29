// How prices are SHOWN, as opposed to how they are stored. Two questions a shop
// only notices are different the day its prices are typed in without tax and its
// shoppers are consumers, who must be quoted with it.
//
// `taxMode` (Shop settings > General) says what the figures in the product
// editor MEAN: INCLUSIVE = the price already carries tax, EXCLUSIVE = tax is
// added at the till. `priceDisplayTax` (Shop settings > Tax & shipping) says
// what the storefront PRINTS. 'AS_ENTERED' keeps the two in step, which is what
// the shop did before this setting existed - so an upgrade moves no figure.
//
// Nothing here touches the database or next: the basket and the variation picker
// do this arithmetic in the browser, so this half has to be client-safe. The
// server-side resolver (which zone, which rate) lives in ./tax-display.

export const PRICE_DISPLAY_TAX = ['AS_ENTERED', 'INCLUSIVE', 'EXCLUSIVE'] as const
export type PriceDisplayTax = (typeof PRICE_DISPLAY_TAX)[number]

export type PriceDisplay = {
  mode: PriceDisplayTax
  /** Whether the stored figures already carry tax - i.e. `taxMode === 'INCLUSIVE'`. */
  storedIncludesTax: boolean
  /** Small text printed after a price ("inc. VAT"), or '' for none. */
  suffix: string
}

/** What a storefront falls back to when it has not heard from the config yet:
 *  print exactly what is stored, say nothing about tax. Deliberately inert. */
export const DEFAULT_PRICE_DISPLAY: PriceDisplay = { mode: 'AS_ENTERED', storedIncludesTax: true, suffix: '' }

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/** Whether the storefront is printing tax-inclusive figures. */
export function displayIncludesTax(display: PriceDisplay): boolean {
  if (display.mode === 'AS_ENTERED') return display.storedIncludesTax
  return display.mode === 'INCLUSIVE'
}

/** The tax mode the storefront's own sums behave like once the prices on screen
 *  have been converted. A basket showing gross line prices adds up exactly like
 *  an INCLUSIVE shop's, whatever the figures in the database are, so every
 *  totals block can carry on with the one branch it already had. */
export function displayTaxMode(display: PriceDisplay): 'INCLUSIVE' | 'EXCLUSIVE' {
  return displayIncludesTax(display) ? 'INCLUSIVE' : 'EXCLUSIVE'
}

/** Multiplier that turns a stored figure into the one a shopper is shown. 1 when
 *  the two already agree, when the line is zero-rated, or when the setting is
 *  left alone - so the common case is a multiply by one, not a special case. */
export function displayPriceFactor(display: PriceDisplay, taxRate: number): number {
  const rate = Number.isFinite(taxRate) && taxRate > 0 ? taxRate : 0
  if (rate === 0) return 1
  const wanted = displayIncludesTax(display)
  if (wanted === display.storedIncludesTax) return 1
  return wanted ? 1 + rate : 1 / (1 + rate)
}

/** A stored amount as it should be printed, to the penny. */
export function displayAmount(amount: number, display: PriceDisplay, taxRate: number): number {
  const factor = displayPriceFactor(display, taxRate)
  return factor === 1 ? amount : round2(amount * factor)
}

/** `£120.00 inc. VAT` - the suffix appended where the shop has set one. Takes an
 *  already-formatted string so it can sit at the end of any money formatter. */
export function withPriceSuffix(formatted: string, suffix: string): string {
  return suffix ? `${formatted} ${suffix}` : formatted
}

export type DisplayTotalsInput = {
  subtotal: number
  taxAmount: number
  goodsSubtotal?: number
  charges?: { label: string; amount: number }[]
}

export type DisplayTotals = {
  subtotal: number
  goodsSubtotal: number
  charges: { label: string; amount: number }[]
  /** Whether the tax row is a slice of the total rather than an addition to it. */
  taxIncluded: boolean
}

/** The subtotal rows of an order as the storefront should print them, given
 *  server totals computed in the shop's own tax mode. The TOTAL is deliberately
 *  not touched: it is the figure the card is charged, and this only ever moves
 *  money between the rows above it. Scaling the parts by one ratio keeps the
 *  column adding up exactly - subtotal - discount + shipping still lands on the
 *  server's total, to the penny, however the lines are rated. */
export function displayOrderTotals(totals: DisplayTotalsInput, display: PriceDisplay): DisplayTotals {
  const taxIncluded = displayIncludesTax(display)
  const goodsSubtotal = totals.goodsSubtotal ?? totals.subtotal
  const charges = totals.charges ?? []
  if (taxIncluded === display.storedIncludesTax || totals.subtotal <= 0 || totals.taxAmount === 0) {
    return { subtotal: totals.subtotal, goodsSubtotal, charges, taxIncluded }
  }
  const target = round2(taxIncluded ? totals.subtotal + totals.taxAmount : totals.subtotal - totals.taxAmount)
  const ratio = target / totals.subtotal
  const shownCharges = charges.map((c) => ({ label: c.label, amount: round2(c.amount * ratio) }))
  // The goods row takes whatever the penny-rounding left over, so the rows on
  // screen always sum to the subtotal above them. Rounding all of them
  // independently can leave the column a penny short of its own heading, which
  // is exactly the sort of thing a shopper writes in about.
  const chargeTotal = shownCharges.reduce((sum, c) => sum + c.amount, 0)
  return {
    subtotal: target,
    goodsSubtotal: round2(target - chargeTotal),
    charges: shownCharges,
    taxIncluded,
  }
}
