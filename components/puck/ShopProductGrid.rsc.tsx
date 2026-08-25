import { connection } from 'next/server'
import { HARD_MAX_PER_PAGE } from '@/modules/shop/lib/db'
import { ShopGridPager } from '@/modules/shop/components/public/ShopGridPager'
import { getShopBreakpoints } from '@/modules/shop/lib/breakpoints'
import { resolveCardTemplate, renderCards, MinimalCard } from '@/modules/shop/lib/card-template'
import { listGridProducts, buildGridCardItems } from '@/modules/shop/lib/grid-page'
import { loadShopGridCards } from '@/modules/shop/lib/grid-cards-action'
import type { ShopGridScope } from '@/modules/shop/lib/grid-page-types'
import { shopCardCss } from '@/modules/shop/components/puck/parts/card-parts'
import { shopProductGridPuckComponent, GridSectionHead, type ShopProductGridProps } from './ShopProductGrid'

// Server (RSC) half of Shop: Product Grid. Kept out of the client editor bundle
// - lib/card-template dynamically imports lib/puck/config.rsc, which depends on
// next/headers via other modules' RSC blocks. See ShopProductGrid.tsx.

// RSC: real products, per-request via connection() (stock/pricing must never be stale-cached).
export async function ShopProductGridRsc(props: ShopProductGridProps) {
  await connection()
  const columns = props.columns ?? 3
  // Paging off is the old grid exactly: fetch `limit`, render `limit`, no pager
  // and no raised ceiling. Every branch below collapses to what it did before.
  const paginate = props.paginate === 'more' || props.paginate === 'pages' || props.paginate === 'scroll' ? props.paginate : null
  const limit = props.limit ?? 12
  const pageSize = paginate ? Math.max(1, Math.floor(Number(props.pageSize)) || limit) : limit
  // Only a paging grid asks for more than the default ceiling, and only because
  // it has somewhere to put the extra rows. See listProducts' maxPerPage.
  const fetchCount = paginate ? HARD_MAX_PER_PAGE : limit
  // Where the pages after the first come from. Meaningless without paging, and
  // 'upfront' either way is the behaviour every saved layout already has.
  const onDemand = Boolean(paginate) && props.pageLoad === 'ondemand'

  const scope: ShopGridScope = {
    categorySlug: props.categorySlug || undefined,
    collectionSlug: props.collectionSlug || undefined,
    tagSlug: props.tagSlug || undefined,
    // listProducts whitelists the sort key itself (unknown values fall back to
    // newest), so the block prop can pass straight through.
    sort: props.sort || 'newest',
    fetchCount,
  }

  const [bp, products, template] = await Promise.all([
    getShopBreakpoints(),
    listGridProducts(scope),
    resolveCardTemplate(props.layoutRef),
  ])

  if (products.length === 0) {
    return <p style={{ color: 'var(--color-text-muted)' }}>{props.emptyText || 'No products to show yet.'}</p>
  }

  // THE line that decides how heavy this page is. On-demand builds cards for the
  // first window only; every other mode builds them for the lot, exactly as this
  // block always has. Note it slices the PRODUCTS, not the finished cards - the
  // per-product media, price and contributed-photo loads inside
  // buildGridCardItems are most of the cost, and slicing afterwards would still
  // have paid all of it.
  const wanted = onDemand ? products.slice(0, pageSize) : products
  const items = await buildGridCardItems(wanted)
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
          total={products.length}
          // Bound here, so what the browser may ask for is a window and nothing
          // else - which products, which card design and how many at a time are
          // decided in this render and encrypted by Next on the way out. The
          // whole binding is re-validated server-side regardless; see the action.
          loadMore={onDemand ? loadShopGridCards.bind(null, { scope, layoutRef: props.layoutRef, maxCards: pageSize }) : undefined}
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
