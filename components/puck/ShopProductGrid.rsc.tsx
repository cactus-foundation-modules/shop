import { Suspense } from 'react'
import { connection } from 'next/server'
import { HARD_MAX_PER_PAGE } from '@/modules/shop/lib/db'
import { ShopGridPager } from '@/modules/shop/components/public/ShopGridPager'
import { getShopBreakpoints } from '@/modules/shop/lib/breakpoints'
import { resolveCardTemplate, renderCards, MinimalCard } from '@/modules/shop/lib/card-template'
import { listGridProducts, buildGridCardItems } from '@/modules/shop/lib/grid-page'
import { loadShopGridCards } from '@/modules/shop/lib/grid-cards-action'
import type { ShopGridScope } from '@/modules/shop/lib/grid-page-types'
import { shopCardCss } from '@/modules/shop/components/puck/parts/card-parts'
import { shopProductGridPuckComponent, GridSectionHead, gridViewAll, type ShopProductGridProps } from './ShopProductGrid'
import { SharedStyle } from '@/components/SharedStyle'
import { CardGridSkeleton } from '@/components/CardGridSkeleton'

// Server (RSC) half of Shop: Product Grid. Kept out of the client editor bundle
// - lib/card-template dynamically imports lib/puck/config.rsc, which depends on
// next/headers via other modules' RSC blocks. See ShopProductGrid.tsx.

// RSC: real products, per-request via connection() (stock/pricing must never be stale-cached).
// The Suspense boundary has to be OUTSIDE the async work, which is why this is a
// plain function wrapping an async one: a Suspense declared inside the async
// component would already have awaited everything before React saw it. Same
// shape, and the same hard-won reason, as ProductDiscoveryRsc.
//
// WHAT IT BUYS. An async server component with no boundary above it blocks the
// entire first flush, so every other block on the page waits for this one's
// product query. The live homepage carried five grid blocks and took 2.9s to
// its first byte; the guided finder's own page, which does far more work but was
// already behind a boundary, took 0.70s. Nothing about the work changes - the
// page simply starts arriving straight away and the grid fills in.
export function ShopProductGridRsc(props: ShopProductGridProps) {
  return (
    <Suspense fallback={<CardGridSkeleton columns={props.columns ?? 3} count={Math.floor(Number(props.pageSize)) || props.limit || 12} />}>
      <ShopProductGridRscBody {...props} />
    </Suspense>
  )
}

async function ShopProductGridRscBody(props: ShopProductGridProps) {
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
  // Where the pages after the first come from. Meaningless without paging.
  //
  // ABSENT means the owner never chose, and since 0.1.328 that means on-demand:
  // a grid with paging switched on has already said there are more products than
  // fit, and building all of them in anyway is what makes such a page
  // unloadable. Only an explicit 'upfront' keeps the old behaviour.
  const onDemand = Boolean(paginate) && props.pageLoad !== 'upfront'

  const scope: ShopGridScope = {
    categorySlug: props.categorySlug || undefined,
    collectionSlug: props.collectionSlug || undefined,
    tagSlug: props.tagSlug || undefined,
    supplierSlug: props.supplierSlug || undefined,
    // listProducts whitelists the sort key itself (unknown values fall back to
    // newest), so the block prop can pass straight through.
    sort: props.sort || 'newest',
    fetchCount,
    // Absent means leave them out - see the prop's note in ShopProductGrid.tsx.
    excludeFeaturedHidden: props.hiddenProducts !== 'include',
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
  // Which window of the shelf this render is. Page one unless the address said
  // otherwise; ignored entirely when every card is going into the page anyway,
  // because then every product is already linked from page one.
  const page = onDemand ? Math.max(1, Math.floor(Number(props.page)) || 1) : 1
  const from = (page - 1) * pageSize
  const wanted = onDemand ? products.slice(from, from + pageSize) : products
  // A page number past the end of the shelf. Nothing links to one - the pager
  // clamps at the last page - so this is somebody inventing an address, and the
  // honest answer is the same "nothing here" the empty shelf gives.
  if (wanted.length === 0) {
    return <p style={{ color: 'var(--color-text-muted)' }}>{props.emptyText || 'No products to show yet.'}</p>
  }
  const items = await buildGridCardItems(wanted)
  // Every picture lazily unless the owner has said this grid opens the page; then
  // the opening row eagerly and the rest of the shelf lazily - and only on page
  // one, since a later page is one the shopper has already scrolled to. See the
  // imageLoading prop for why this block cannot work it out for itself.
  //
  // Lazy rather than eager-without-priority for the rest, because React writes a
  // preload hint into the page for every server-rendered picture that is not
  // lazy. "Eager but not urgent" would still put a row of shelf thumbnails in
  // the queue ahead of whatever the page really opens with.
  const eagerCount = props.imageLoading === 'eager' && page === 1 ? columns : 0
  const cards = template ? await renderCards(template, items, eagerCount) : items.map((item) => <MinimalCard key={item.product.id} {...item} />)

  // Same div, same class, same custom property either way - the pager renders
  // the grid wrapper itself so a paged grid and an unpaged one are the same
  // markup with a different number of children.
  const gridStyle = { ['--shop-cols' as string]: String(columns) } as React.CSSProperties

  return (
    <>
      <SharedStyle id="shop-cards" css={shopCardCss(bp)} />
      <GridSectionHead heading={props.heading} subheading={props.subheading} viewAll={gridViewAll(props)} />
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
          page={page}
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
