import { formatMoney } from '@/modules/shop/lib/money'

// The shop-wide minimum and maximum order value (Settings, Shop, Checkout),
// asked by the checkout session route that prices a basket and by the
// payment-intent route that turns one into an order, so the two can never
// disagree about the same basket.
//
// Measured on the goods BEFORE any discount, and before delivery - and the
// shopper is told so, in so many words, so the rule is the one they read.
//
// Measuring after the discount was tried, and it locked people out: a coupon
// that took a £60 basket under a £50 floor was accepted by the coupon box,
// refused by the checkout, and there is no way to take a coupon back off - so a
// shopper who had done nothing wrong could not pay at all. Before the discount,
// a coupon can never be what stops an order. Delivery stays out of it: an order
// is not more worth taking because it is going further away.
//
// Still the stored side of tax, as it always was - the figures prices are kept
// in. Nothing here converts for a shop that prints its prices the other way.
//
// The per-method limits are a different rule on a different figure - the whole
// amount the provider is handed, VAT and delivery included - and live in
// lib/payments/order-value-limits.ts.

type ShopOrderValueLimits = {
  minimumOrderValue: number | null
  maximumOrderValue: number | null
  currencySymbol: string
}

type ShopOrderValueTotals = { subtotal: number }

// Compared in pence, so a basket exactly on the line is on it rather than a
// float's width either side of it.
function pence(amount: number): number {
  return Math.round(amount * 100)
}

/** Why the shop will not take an order of this size, in the shopper's words, or
 *  null when it will (or has set no limit). */
export function shopOrderValueRefusal(limits: ShopOrderValueLimits, totals: ShopOrderValueTotals): string | null {
  const value = pence(totals.subtotal)
  if (limits.minimumOrderValue != null && value < pence(limits.minimumOrderValue)) {
    return `The minimum order is ${formatMoney(limits.minimumOrderValue, limits.currencySymbol)} of goods, before any discount and not counting delivery.`
  }
  if (limits.maximumOrderValue != null && value > pence(limits.maximumOrderValue)) {
    return `The maximum order is ${formatMoney(limits.maximumOrderValue, limits.currencySymbol)} of goods, before any discount and not counting delivery.`
  }
  return null
}
