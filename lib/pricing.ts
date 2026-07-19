// Single source of truth for "which of a product's prices is the one that
// counts". A product carries up to five figures (price, sale, retail, trade,
// cost) but only ever charges one, and working that out in more than one place
// is how a shop ends up advertising one number and taking another.
//
// Prices arrive from the query layer as decimal-pound strings; everything here
// coerces defensively and falls back to the mandatory `price` rather than
// throwing, because a malformed optional figure must never break a checkout.

export const PRICE_TYPES = ['sale', 'retail', 'trade', 'cost'] as const
export type ShpPriceType = (typeof PRICE_TYPES)[number]

/** Labels and blurbs, shared by the settings toggles and the product editor so
 * the two can never drift into calling the same field different things. */
export const PRICE_TYPE_META: Record<ShpPriceType, { label: string; blurb: string }> = {
  sale: {
    label: 'Sale price',
    blurb: 'What the item drops to during an offer. Shoppers are charged this, with the normal price struck through beside it.',
  },
  retail: {
    label: 'Retail price (RRP)',
    blurb: 'The recommended retail price. Shown as a comparison if you want it, never charged.',
  },
  trade: {
    label: 'Trade price',
    blurb: 'What a trade or wholesale customer would pay. Kept in the admin only, never shown to shoppers and never charged.',
  },
  cost: {
    label: 'Cost price',
    blurb: 'What the item costs you. Never shown to shoppers, only used to work out your margin.',
  },
}

/** The price-bearing fields of a product, as everything downstream sees them. */
export type PricedProduct = {
  price: string | number
  salePrice?: string | number | null
  retailPrice?: string | number | null
  tradePrice?: string | number | null
  costPrice?: string | number | null
}

function toNumber(value: string | number | null | undefined): number | null {
  if (value == null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

/** Whether an optional price type is switched on for this shop. Sale is the
 * only one that can change money, so a shop that has turned it off charges the
 * normal price even on a product that still carries an old sale figure. */
export function isPriceTypeEnabled(enabled: readonly string[] | undefined, type: ShpPriceType): boolean {
  return (enabled ?? []).includes(type)
}

/** True when the product is genuinely on offer: sale prices are switched on,
 * a figure is set, and it actually undercuts the normal price. A sale price at
 * or above the normal price is a typo, not a discount, and is ignored rather
 * than shown as a saving of zero (or worse, a negative one). */
export function isOnSale(product: PricedProduct, enabled?: readonly string[]): boolean {
  if (enabled && !isPriceTypeEnabled(enabled, 'sale')) return false
  const price = toNumber(product.price)
  const sale = toNumber(product.salePrice)
  return price != null && sale != null && sale >= 0 && sale < price
}

/** The figure the shopper is actually charged, as a number. PROTECTED - the
 * checkout money path calls this, so it must never guess: anything that isn't a
 * clean undercut falls back to the mandatory price. */
export function effectivePrice(product: PricedProduct, enabled?: readonly string[]): number {
  if (isOnSale(product, enabled)) return toNumber(product.salePrice) as number
  return toNumber(product.price) ?? 0
}

export type PriceView = {
  /** What to print big: the sale price if on offer, otherwise the normal price. */
  now: string
  /** The struck-through figure, or null when there is nothing to strike. */
  was: string | null
  /** Whole-percent saving against `was`, or null. */
  savePct: number | null
  /** RRP, when the shop shows one and it sits above what is being charged. */
  rrp: string | null
  onSale: boolean
}

/** Everything a storefront price block needs, worked out once. Amounts come
 * back as strings so they stay in the same shape formatMoney already takes. */
export function priceView(product: PricedProduct, enabled?: readonly string[]): PriceView {
  const onSale = isOnSale(product, enabled)
  const now = effectivePrice(product, enabled)
  const was = onSale ? toNumber(product.price) : null
  const savePct = was != null && was > 0 ? Math.round((1 - now / was) * 100) : null
  const retail = !enabled || isPriceTypeEnabled(enabled, 'retail') ? toNumber(product.retailPrice) : null
  return {
    now: now.toFixed(2),
    was: was != null ? was.toFixed(2) : null,
    savePct: savePct != null && savePct > 0 ? savePct : null,
    rrp: retail != null && retail > now ? retail.toFixed(2) : null,
    onSale,
  }
}
