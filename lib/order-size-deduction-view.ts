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

import { effectivePrice, isOnSale, type PricedProduct } from '@/modules/shop/lib/pricing'
import {
  deductionAmount,
  orderSizeDeductionLine,
  orderSizeDeductionRangeLine,
  type OrderSizeDeductionLineView,
  type OrderSizeDeductionRule,
} from '@/modules/shop/lib/order-size-deduction'

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
  /** Which optional price types the shop runs, so a shop that has switched sale
   *  prices off never advertises a deduction it would not apply. */
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
}

/**
 * The finished line, or null when there is nothing to say - which is every
 * product on every shop bar the handful this was built for.
 *
 * Silent unless all three hold: the supplier has a rule, the product carries an
 * amount, and the product is CURRENTLY on offer. That last one is not
 * decoration: a sale that has ended leaves the stamped amount behind, and a page
 * promising money off a price nobody built it into is a page making a promise
 * the checkout will not keep.
 */
export function orderSizeDeductionView(params: DeductionViewParams): OrderSizeDeductionLineView | null {
  const { product, rule, enabledPriceTypes, adjust, currencySymbol, someOptionsOnly } = params
  if (!rule) return null
  if (!isOnSale(product, enabledPriceTypes)) return null
  const amount = deductionAmount(product.orderSizeDeduction)
  if (amount == null) return null

  const convert = adjust ?? ((n: number) => n)
  // What the shopper would actually pay for one, once the basket is big enough.
  // Floored at zero for the same reason the basket floors it: a mis-stamped row
  // charges nothing rather than a negative.
  const reducedPrice = convert(Math.max(0, effectivePrice(product, enabledPriceTypes) - amount))
  const threshold = convert(rule.threshold)
  const compose = someOptionsOnly ? orderSizeDeductionRangeLine : orderSizeDeductionLine
  return {
    text: compose({ reducedPrice, supplier: rule.supplier, threshold, currencySymbol }),
    note: rule.note,
  }
}
