// The product page's order-size deduction line, composed in one place.
//
// Two callers have to word it identically: the detail block as the page is
// server-rendered, and the public route the client island asks once the shopper
// settles on a combination. A second copy of this arithmetic is how a listing
// ends up promising one figure before a colour is picked and a different one
// after - so there is only ever this one.
//
// Pure, like the rule module it sits beside: no database, no next, nothing the
// storefront bundle would object to.

import { effectivePrice, type PricedProduct } from '@/modules/shop/lib/pricing'
import {
  deductionAmount,
  orderSizeDeductionLineParts,
  type OrderSizeDeductionFigures,
  type OrderSizeDeductionLineView,
  type OrderSizeDeductionRule,
} from '@/modules/shop/lib/order-size-deduction'
import { taxViewAmount, type ProductTaxView, type TaxViewSide } from '@/modules/shop/lib/tax-view-shared'

/** The bits of a product this needs. Structural, so a caller can hand over an
 *  ShpProduct or a variation row without either side knowing about the other. */
export type DeductionViewProduct = PricedProduct & {
  supplier: string | null
  orderSizeDeduction: string | number | null
}

export type DeductionViewParams = {
  product: DeductionViewProduct
  /** The supplier's rule, or null when they have none - see getDeductionRules. */
  rule: OrderSizeDeductionRule | null
  /** Which optional price types the shop runs, so the figure struck through is
   *  the one the shopper is actually charged today - the same call the checkout
   *  makes, on a shop that has sale prices switched off as much as one that has
   *  them on. */
  enabledPriceTypes?: readonly string[]
  /**
   * Turns a stored figure into the one this shop prints (lib/tax-display.ts).
   * Applied to BOTH the price and the threshold, so the sentence is in one set
   * of terms rather than a gross price beside a net threshold. It uses this
   * product's own tax rate, which is exactly right on the single-rate shop and
   * the only defined answer anywhere else - a basket-wide threshold has no rate
   * of its own to convert at. Omitted means print as stored, which is what a
   * shop quoting as-entered (Deskwell today) does and where the two are equal.
   */
  adjust?: ((amount: number) => number) | null
  currencySymbol?: string
  /**
   * True when the page is a listing whose combinations are chosen by a companion
   * module: the amount on the parent row is the listing's, and the combination
   * the shopper eventually picks may carry none. The sentence says so rather
   * than promising a figure the next click might withdraw, and the client island
   * replaces it with the definite one the moment a combination is settled.
   */
  someOptionsOnly?: boolean
  /**
   * The shopper's VAT switch for this product, or null/omitted where the shop
   * has it off. Where it is on, the line carries its figures on both sides of
   * tax, worked out from the converted figures above at this product's rate.
   */
  taxView?: ProductTaxView | null
  /**
   * The supplier's page, where the shop publishes one (supplierPageHref in
   * lib/supplier-url.ts). The line links the supplier's name to it; null or
   * omitted leaves the name as plain text.
   */
  supplierHref?: string | null
}

/**
 * The finished line, or null when there is nothing to say - which is every
 * product on every shop bar the handful this was built for.
 *
 * Silent unless both hold: the supplier has a rule, and the product carries an
 * amount. It deliberately does NOT also require the product to be on offer.
 * That extra test read as a guard against a stale stamp and behaved as a ban on
 * the ordinary case - a supplier whose amount sits inside the normal price
 * could only be made to work by giving its products a sale price they never
 * had, which the storefront then advertised as a genuine reduction. The same
 * two tests decide it here and in the basket, so the page cannot promise
 * something the checkout declines to do.
 */
export function orderSizeDeductionView(params: DeductionViewParams): OrderSizeDeductionLineView | null {
  const { product, rule, enabledPriceTypes, adjust, currencySymbol, someOptionsOnly, taxView, supplierHref } = params
  if (!rule) return null
  const amount = deductionAmount(product.orderSizeDeduction)
  if (amount == null) return null

  const convert = adjust ?? ((n: number) => n)
  const charged = effectivePrice(product, enabledPriceTypes)
  // What the shopper would actually pay for one, once the basket is big enough.
  // Floored at zero for the same reason the basket floors it: a mis-stamped row
  // charges nothing rather than a negative.
  const reducedPrice = convert(Math.max(0, charged - amount))
  // What it costs today, for the struck-through figure. Converted the same way
  // and by the same call, so the two prices are on one side of tax and cannot
  // disagree by a rounding penny.
  const currentPrice = convert(charged)
  const threshold = convert(rule.threshold)
  const parts = orderSizeDeductionLineParts({
    reducedPrice,
    currentPrice,
    supplier: rule.supplier,
    threshold,
    currencySymbol,
    someOptionsOnly,
  })
  const supplierLink = supplierHref ? { name: rule.supplier, href: supplierHref } : null
  if (!taxView) return { ...parts, supplierLink }

  // Each side composed by the same call as the line itself, so the struck
  // figure is dropped on a side exactly when it would read equal there.
  const figuresOn = (side: TaxViewSide): OrderSizeDeductionFigures => {
    const sideParts = orderSizeDeductionLineParts({
      reducedPrice: taxViewAmount(reducedPrice, taxView, side),
      currentPrice: taxViewAmount(currentPrice, taxView, side),
      supplier: rule.supplier,
      threshold: taxViewAmount(threshold, taxView, side),
      currencySymbol,
      someOptionsOnly,
    })
    return { was: sideParts.was, now: sideParts.now, tail: sideParts.tail }
  }
  return { ...parts, supplierLink, taxSides: { defaultSide: taxView.defaultSide, inc: figuresOn('inc'), ex: figuresOn('ex') } }
}
