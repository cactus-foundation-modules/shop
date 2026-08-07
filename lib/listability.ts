// Provider for the `shop.product-listability` extension point: given a batch of
// product ids, which of them must not be listed to whoever is asking right now.
//
// Shop applies its own out-of-stock hiding directly (lib/stock-visibility.ts).
// This exists for the other end of the site - the search module lists products
// too, and cannot import shop's lib without breaking a build on a site with no
// shop installed. Same shape and same reasoning as shop.product-card-prices,
// which search already resolves through the core registry for its prices.
//
// Answers for the caller's viewer, cookie and all, so a signed-in member of
// staff still finds a sold-out product in search while a shopper does not.
import { filterHiddenOutOfStock } from '@/modules/shop/lib/stock-visibility'

export const shopProductListabilityProvider = {
  async hiddenProductIds(productIds: string[]): Promise<string[]> {
    if (productIds.length === 0) return []
    const visible = await filterHiddenOutOfStock(productIds.map((id) => ({ id })))
    if (visible.length === productIds.length) return []
    const shown = new Set(visible.map((p) => p.id))
    return productIds.filter((id) => !shown.has(id))
  },
}
