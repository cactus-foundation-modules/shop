import { connection } from 'next/server'
import { listProducts, getProductMedia, getProductTagIds, HARD_MAX_PER_PAGE, type ProductSort } from '@/modules/shop/lib/db'
import { ShopGridPager } from '@/modules/shop/components/public/ShopGridPager'
import { listTags, resolveCategoryProductFilter } from '@/modules/shop/lib/db/catalogue'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import { getShopBreakpoints } from '@/modules/shop/lib/breakpoints'
import { resolveCardTemplate, buildCardContext, buildTagMaps, renderCards, MinimalCard, type CardItem } from '@/modules/shop/lib/card-template'
import { resolveCardFromPrices } from '@/modules/shop/lib/card-price'
import { resolveTaxDisplay } from '@/modules/shop/lib/tax-display'
import { resolveShopCardExtras } from '@/modules/shop/lib/card-media'
import { shopCardCss } from '@/modules/shop/components/puck/parts/card-parts'
import { shopProductGridPuckComponent, GridSectionHead, type ShopProductGridProps } from './ShopProductGrid'
import { resolveShopCommerceMode } from '@/modules/shop/lib/commerce-mode'

// Server (RSC) half of Shop: Product Grid. Kept out of the client editor bundle
// - lib/card-template dynamically imports lib/puck/config.rsc, which depends on
// next/headers via other modules' RSC blocks. See ShopProductGrid.tsx.

// RSC: real products, per-request via connection() (stock/pricing must never be stale-cached).
export async function ShopProductGridRsc(props: ShopProductGridProps) {
  await connection()
  const columns = props.columns ?? 3
  // Paging off is the old grid exactly: fetch `limit`, render `limit`, no pager
  // and no raised ceiling. Every branch below collapses to what it did before.
  const paginate = props.paginate === 'more' || props.paginate === 'pages' ? props.paginate : null
  const limit = props.limit ?? 12
  const pageSize = paginate ? Math.max(1, Math.floor(Number(props.pageSize)) || limit) : limit
  // Only a paging grid asks for more than the default ceiling, and only because
  // it has somewhere to put the extra rows. See listProducts' maxPerPage.
  const fetchCount = paginate ? HARD_MAX_PER_PAGE : limit
  // Resolve the category filter first - a category page's grid rolls up over the
  // sub-tree (or not) per the category's own mode / the shop default.
  const config = await getShopConfigCached()
  const categoryFilter = props.categorySlug
    ? await resolveCategoryProductFilter(props.categorySlug, config.categoryProductDisplayMode)
    : {}
  const [bp, tags, listed, template] = await Promise.all([
    getShopBreakpoints(),
    listTags(),
    listProducts({
      status: 'ACTIVE',
      ...categoryFilter,
      collectionSlug: props.collectionSlug || undefined,
      tagSlug: props.tagSlug || undefined,
      perPage: fetchCount,
      maxPerPage: fetchCount,
      // listProducts whitelists the sort key itself (unknown values fall back
      // to newest), so the block prop can pass straight through.
      sort: (props.sort || 'newest') as ProductSort,
      excludeHidden: true,
      storefront: true,
    }),
    resolveCardTemplate(props.layoutRef),
  ])
  const { products } = listed
  const { tagById, tagsById } = buildTagMaps(tags)

  if (products.length === 0) {
    return <p style={{ color: 'var(--color-text-muted)' }}>{props.emptyText || 'No products to show yet.'}</p>
  }

  // Load each product's media + tags once, up front - the injected context
  // carries them into the card so no part re-queries. The "From £…" figure for
  // any variation-priced product is resolved for the whole grid in one go.
  const productIds = products.map((p) => p.id)
  const [fromPrices, cardExtras, taxDisplay] = await Promise.all([
    resolveCardFromPrices(productIds),
    resolveShopCardExtras(productIds),
    resolveTaxDisplay(),
  ])
  // What the shop prints prices as (net or gross) is a per-shop answer, not a
  // per-card one, so it is resolved once here and handed to every card.
  // Whether prices may be shown at all is a per-shop answer too - a quote-only
  // shop withholds every figure on every card, not some of them. Cached, so this
  // costs nothing per surface. See lib/commerce-mode.ts.
  const pricing = { ...config, taxDisplay, commerce: await resolveShopCommerceMode() }
  const items: CardItem[] = await Promise.all(
    products.map(async (product) => {
      const [media, tagIds] = await Promise.all([getProductMedia(product.id), getProductTagIds(product.id)])
      return { product, ctx: buildCardContext(product, media, tagById, tagIds, config.currencySymbol, pricing, fromPrices.get(product.id) ?? null, cardExtras.get(product.id), tagsById) }
    }),
  )

  const cards = template ? await renderCards(template, items) : items.map((item) => <MinimalCard key={item.product.id} {...item} />)

  // Same div, same class, same custom property either way - the pager renders
  // the grid wrapper itself so a paged grid and an unpaged one are the same
  // markup with a different number of children.
  const gridStyle = { ['--shop-cols' as string]: String(columns) } as React.CSSProperties

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: shopCardCss(bp) }} />
      <GridSectionHead heading={props.heading} subheading={props.subheading} />
      {paginate ? (
        <ShopGridPager
          cards={cards}
          perPage={pageSize}
          mode={paginate}
          gridClassName="shop-grid"
          gridStyle={gridStyle}
          moreLabel={props.moreLabel}
          countTemplate={props.countTemplate}
        />
      ) : (
        <div className="shop-grid" style={gridStyle}>
          {cards}
        </div>
      )}
    </>
  )
}

export const shopProductGridPuckRscComponent = {
  ...shopProductGridPuckComponent,
  render: ShopProductGridRsc,
}
