import { listProducts, getProductMediaForProducts, getProductTagIdsForProducts, HARD_MAX_PER_PAGE, type ProductSort } from '@/modules/shop/lib/db'
import { listTags, resolveCategoryProductFilter } from '@/modules/shop/lib/db/catalogue'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import { buildCardContext, buildTagMaps, type CardItem } from '@/modules/shop/lib/card-template'
import { resolveCardFromPrices } from '@/modules/shop/lib/card-price'
import { resolveTaxDisplay } from '@/modules/shop/lib/tax-display'
import { resolveShopCardExtras } from '@/modules/shop/lib/card-media'
import { resolveShopCommerceMode } from '@/modules/shop/lib/commerce-mode'
import type { ShpProduct } from '@/modules/shop/lib/types'
import type { ShopGridScope } from '@/modules/shop/lib/grid-page-types'

// The two halves of "what a product grid is made of", split so that a grid can
// render one page of cards now and fetch the rest later without the two ever
// disagreeing about which products, in which order, or what is printed on them.
//
// Every grid block used to do both halves inline for the whole result set. That
// is why a 432-product collection page shipped 14.6 MB: each card is a Puck
// document stamped per product and handed to a client component as a prop, so
// the whole lot lands in the flight payload whether the shopper ever scrolls to
// it or not. Splitting the query from the card build is what lets the block
// render a window and a server function render the next one on the same terms.
//
// Server-only by construction (it reaches the database). A client component must
// never import this - the grids hand their pager a server function as a PROP
// instead, which is a reference, not an import edge. See scripts/check-client-graph.mjs.

// The scope's products, in the scope's order. THE authorising query: a storefront
// list of ACTIVE, non-hidden products with the shop's out-of-stock rules applied.
// A server function re-runs this rather than trusting anything from the browser,
// so the worst a forged request can do is ask for cards it could already see.
export async function listGridProducts(scope: ShopGridScope): Promise<ShpProduct[]> {
  const config = await getShopConfigCached()
  const categoryFilter = scope.categorySlug
    ? await resolveCategoryProductFilter(scope.categorySlug, config.categoryProductDisplayMode)
    : {}
  const fetchCount = Math.min(HARD_MAX_PER_PAGE, Math.max(1, Math.floor(Number(scope.fetchCount)) || 24))
  const { products } = await listProducts({
    status: 'ACTIVE',
    ...categoryFilter,
    collectionSlug: scope.collectionSlug || undefined,
    tagSlug: scope.tagSlug || undefined,
    perPage: fetchCount,
    maxPerPage: fetchCount,
    // listProducts whitelists the sort key itself (unknown values fall back to
    // newest), so a block prop can pass straight through. Omitted entirely
    // where the scope names none, so listProducts' own default still applies -
    // passing `undefined` and passing nothing are the same thing to it, but
    // spelling it out here keeps the two callers honest.
    ...(scope.sort ? { sort: scope.sort as ProductSort } : {}),
    excludeHidden: true,
    excludeFeaturedHidden: scope.excludeFeaturedHidden === true,
    storefront: true,
  })
  return products
}

// Everything a card prints, for exactly these products and no others. The
// per-product loads are scoped to the window, which is the point: the media,
// prices, contributed photos and tags of the 408 cards nobody scrolled to are
// work this no longer does.
//
// The shop-wide answers (how prices are printed, whether they are shown at all)
// are resolved once here rather than per card, exactly as the grid blocks did
// inline - they are cached, so a second page costs nothing extra for them.
export async function buildGridCardItems(products: ShpProduct[]): Promise<CardItem[]> {
  if (products.length === 0) return []
  const productIds = products.map((p) => p.id)
  const [config, tags, mediaByProduct, tagIdsByProduct, fromPrices, cardExtras, taxDisplay, commerce] = await Promise.all([
    getShopConfigCached(),
    listTags(),
    getProductMediaForProducts(productIds),
    getProductTagIdsForProducts(productIds),
    resolveCardFromPrices(productIds),
    resolveShopCardExtras(productIds),
    resolveTaxDisplay(),
    resolveShopCommerceMode(),
  ])
  const { tagById, tagsById } = buildTagMaps(tags)
  const pricing = { ...config, taxDisplay, commerce }
  return products.map((product) => ({
    product,
    ctx: buildCardContext(
      product,
      mediaByProduct.get(product.id) ?? [],
      tagById,
      tagIdsByProduct.get(product.id) ?? [],
      config.currencySymbol,
      pricing,
      fromPrices.get(product.id) ?? null,
      cardExtras.get(product.id),
      tagsById,
    ),
  }))
}
