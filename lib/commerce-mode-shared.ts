// The pure half of the commerce mode: types, defaults and the two helpers that
// decide what a surface prints. No database, no server imports - the client cart
// surfaces read this mode out of GET /config and need the same defaults and the
// same money helper the server parts use, and a shared file is the only way the
// two can't drift. Mirrors lib/tax-display-shared.ts, which exists for the same
// reason. The resolver itself lives in lib/commerce-mode.ts (server only).

export type ShopCommerceMode = {
  // 'cart' is shop's own behaviour. 'quote' means no money changes hands here:
  // checkout is closed and the cart's forward button leads to whatever the
  // provider nominates instead.
  mode: 'cart' | 'quote'
  // Wording for the product-page and card buy buttons ("Add to quote"). Null
  // leaves each surface's own label alone.
  addLabel?: string | null
  // Wording and destination for the cart's forward button ("Request a quote" ->
  // /quote). Null keeps shop's own label and /shop/checkout.
  cartCtaLabel?: string | null
  cartCtaHref?: string | null
  // Whether prices may be shown at all. A trade shop quoting by hand does not
  // want a figure on screen it has not agreed to; `hiddenPriceLabel` is what
  // goes in place of each one, so a hidden price leaves the layout intact
  // instead of a hole where a number was.
  hidePrices?: boolean
  hiddenPriceLabel?: string | null
  // Plain-English refusal shown (and returned by the checkout routes) when a
  // shopper reaches a payment surface in quote mode.
  blockedMessage?: string | null
}

/** Every field decided, so no caller has to repeat the fallbacks. */
export type ResolvedShopCommerceMode = {
  mode: 'cart' | 'quote'
  addLabel: string | null
  cartCtaLabel: string | null
  cartCtaHref: string
  hidePrices: boolean
  hiddenPriceLabel: string
  blockedMessage: string
}

export const SHOP_DEFAULT_COMMERCE_MODE: ResolvedShopCommerceMode = {
  mode: 'cart',
  addLabel: null,
  cartCtaLabel: null,
  cartCtaHref: '/shop/checkout',
  hidePrices: false,
  hiddenPriceLabel: 'POA',
  blockedMessage: 'This shop takes quote requests rather than orders.',
}

/** Fills in every gap a provider (or a config payload from an older shop) left,
 *  so one shape reaches every surface. */
export function normaliseShopCommerceMode(raw: ShopCommerceMode | null | undefined): ResolvedShopCommerceMode {
  if (!raw) return SHOP_DEFAULT_COMMERCE_MODE
  const trim = (value: string | null | undefined): string | null => {
    const text = (value ?? '').trim()
    return text === '' ? null : text
  }
  return {
    mode: raw.mode === 'quote' ? 'quote' : 'cart',
    addLabel: trim(raw.addLabel),
    cartCtaLabel: trim(raw.cartCtaLabel),
    cartCtaHref: trim(raw.cartCtaHref) ?? SHOP_DEFAULT_COMMERCE_MODE.cartCtaHref,
    hidePrices: raw.hidePrices === true,
    hiddenPriceLabel: trim(raw.hiddenPriceLabel) ?? SHOP_DEFAULT_COMMERCE_MODE.hiddenPriceLabel,
    blockedMessage: trim(raw.blockedMessage) ?? SHOP_DEFAULT_COMMERCE_MODE.blockedMessage,
  }
}

/**
 * Money for a storefront surface that may not be allowed to show it. Every price
 * a shopper can see goes through this rather than being formatted straight, so
 * switching a shop to quote-only hides the figures everywhere at once instead of
 * leaving one part of one layout still quoting a price.
 */
export function commerceModeMoney(
  mode: Pick<ResolvedShopCommerceMode, 'hidePrices' | 'hiddenPriceLabel'>,
  formatted: string,
): string {
  return mode.hidePrices ? mode.hiddenPriceLabel : formatted
}

/**
 * What a buy or forward button should actually say.
 *
 * Three parties have an opinion: the layout author (a Puck field), the mode
 * ("Add to quote"), and shop's own wording. The author wins - it is their shop -
 * but only where they have genuinely said something: every saved layout carries
 * shop's default label in that field whether it was ever touched or not, so
 * treating a field equal to the default as an instruction would leave a
 * quote-only shop with "Proceed to checkout" buttons that lead to a quote form.
 * So: a label matching shop's default counts as "not set" and the mode wins.
 */
export function commerceModeButtonLabel(
  modeLabel: string | null,
  authorLabel: string | null | undefined,
  shopDefault: string,
): string {
  const author = (authorLabel ?? '').trim()
  if (modeLabel && (author === '' || author === shopDefault)) return modeLabel
  return author === '' ? shopDefault : author
}
