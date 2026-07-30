// Server-side resolver for the `shop.commerce-mode` extension point: how this
// shop is meant to be transacted with at all.
//
// Shop's own answer is the only one it has ever had - a shopper adds things to a
// basket and pays for them - and that stays the default here, resolved with no
// database read of its own beyond the installed-module list. A companion module
// (Quote for Shop) can answer differently: the buttons say something else, the
// cart's forward button goes somewhere other than checkout, prices may not be
// shown at all, and /shop/checkout refuses to serve.
//
// One point rather than four (label, CTA, gate, prices) because they are one
// decision. A shop that has switched its checkout off and still says "Add to
// basket" on every product, or still shows a "Proceed to checkout" button that
// 503s, is worse than either mode done whole - so a provider hands back the
// whole shape or nothing.
//
// Precedent: shop.cart-line-resolver -> lib/line-meta.ts, whose memoised
// installed-module read this shares. Providers must be server-safe: this is
// called from RSC parts, public pages and public API routes. The types, defaults
// and money helper live in lib/commerce-mode-shared.ts so the client cart
// surfaces can use exactly the same ones.
import { gatherCartExtensionPoint } from '@/modules/shop/lib/line-meta'
import {
  normaliseShopCommerceMode,
  SHOP_DEFAULT_COMMERCE_MODE,
  type ResolvedShopCommerceMode,
  type ShopCommerceMode,
} from '@/modules/shop/lib/commerce-mode-shared'

export type { ShopCommerceMode, ResolvedShopCommerceMode }
export { SHOP_DEFAULT_COMMERCE_MODE, commerceModeMoney } from '@/modules/shop/lib/commerce-mode-shared'

export type ShopCommerceModeProvider = {
  resolve: () => Promise<ShopCommerceMode | null> | ShopCommerceMode | null
}

const POINT = 'shop.commerce-mode'

// Same 5s window as getShopConfigCached: this is consulted by nearly every
// storefront surface, and a provider's own answer is itself a config read.
const CACHE_TTL_MS = 5_000
let cached: { value: ResolvedShopCommerceMode; at: number } | null = null

/**
 * The mode this shop is in. First provider with an answer wins - two modules
 * disagreeing about whether the shop takes money would leave the storefront half
 * in each, so the order of the active-modules query decides rather than merging.
 * A provider that throws is ignored: an add-on with a broken settings read must
 * not take the whole storefront down with it, and shop's own default is always a
 * safe answer.
 */
export async function resolveShopCommerceMode(): Promise<ResolvedShopCommerceMode> {
  const now = Date.now()
  if (cached && now - cached.at < CACHE_TTL_MS) return cached.value

  let value = SHOP_DEFAULT_COMMERCE_MODE
  const providers = await gatherCartExtensionPoint<ShopCommerceModeProvider>(POINT)
  for (const provider of providers) {
    try {
      const answer = await provider.resolve()
      if (answer) { value = normaliseShopCommerceMode(answer); break }
    } catch {
      // Ignored deliberately - see the doc comment above.
    }
  }

  cached = { value, at: now }
  return value
}

export function invalidateShopCommerceModeCache(): void {
  cached = null
}
