import { Suspense } from 'react'
import { connection } from 'next/server'
import { getCollectionBySlug, listProducts, getProductMediaForProducts, getProductTagIdsForProducts, type ProductSort } from '@/modules/shop/lib/db'
import { listTags } from '@/modules/shop/lib/db/catalogue'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import { getShopBreakpoints } from '@/modules/shop/lib/breakpoints'
import { resolveCardTemplate, buildCardContext, buildTagMaps, renderCards, MinimalCard, type CardItem } from '@/modules/shop/lib/card-template'
import { resolveCardFromPrices } from '@/modules/shop/lib/card-price'
import { resolveTaxDisplay } from '@/modules/shop/lib/tax-display'
import { resolveShopCardExtras } from '@/modules/shop/lib/card-media'
import { shopCardCss } from '@/modules/shop/components/puck/parts/card-parts'
import { shopFeaturedCollectionPuckComponent, type ShopFeaturedCollectionProps } from './ShopFeaturedCollection'
import { resolveShopCommerceMode } from '@/modules/shop/lib/commerce-mode'
import { SharedStyle } from '@/components/SharedStyle'
import { CardGridSkeleton } from '@/components/CardGridSkeleton'

// Server (RSC) half of Shop: Featured Collection. Kept out of the client editor
// bundle - see ShopFeaturedCollection.tsx.

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
export function ShopFeaturedCollectionRsc(props: ShopFeaturedCollectionProps) {
  return (
    <Suspense fallback={<CardGridSkeleton columns={Math.min(props.limit ?? 4, 4)} count={props.limit ?? 4} />}>
      <ShopFeaturedCollectionRscBody {...props} />
    </Suspense>
  )
}

async function ShopFeaturedCollectionRscBody(props: ShopFeaturedCollectionProps) {
  await connection()
  if (!props.collectionSlug) return null
  const collection = await getCollectionBySlug(props.collectionSlug)
  if (!collection) return null

  const [config, bp, tags, listed, template] = await Promise.all([
    getShopConfigCached(),
    getShopBreakpoints(),
    listTags(),
    listProducts({ status: 'ACTIVE', collectionSlug: props.collectionSlug, perPage: props.limit ?? 4, sort: (props.sort || 'newest') as ProductSort, excludeHidden: true, excludeFeaturedHidden: props.hiddenProducts !== 'include', storefront: true }),
    resolveCardTemplate(),
  ])
  const { products } = listed
  if (products.length === 0) return null
  const { tagById, tagsById } = buildTagMaps(tags)

  const productIds = products.map((p) => p.id)
  const [mediaByProduct, tagIdsByProduct, fromPrices, cardExtras, taxDisplay] = await Promise.all([
    getProductMediaForProducts(productIds),
    getProductTagIdsForProducts(productIds),
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
  const items: CardItem[] = products.map((p) => ({
    product: p,
    ctx: buildCardContext(p, mediaByProduct.get(p.id) ?? [], tagById, tagIdsByProduct.get(p.id) ?? [], config.currencySymbol, pricing, fromPrices.get(p.id) ?? null, cardExtras.get(p.id), tagsById),
  }))

  const carousel = (props.layout ?? 'Grid') === 'Carousel'
  const columns = Math.min(products.length, 4)
  const cards = template ? await renderCards(template, items) : items.map((item) => <MinimalCard key={item.product.id} {...item} />)

  return (
    <section>
      <SharedStyle id="shop-cards" css={shopCardCss(bp)} />
      <div className="shop-sec-head">
        <h2>{props.heading || collection.name}</h2>
        {props.subheading && <span>{props.subheading}</span>}
        {props.showViewAll === 'yes' && (
          <a
            href={`/shop/collections/${props.collectionSlug}`}
            style={{ marginLeft: 'auto', fontSize: 14, fontWeight: 600, color: 'var(--color-primary)', textDecoration: 'none' }}
          >
            {props.viewAllLabel || 'View all'}
          </a>
        )}
      </div>
      {carousel ? (
        <div className="shop-scroller">{cards}</div>
      ) : (
        <div className="shop-grid" style={{ ['--shop-cols' as string]: String(columns) } as React.CSSProperties}>
          {cards}
        </div>
      )}
    </section>
  )
}

export const shopFeaturedCollectionPuckRscComponent = { ...shopFeaturedCollectionPuckComponent, render: ShopFeaturedCollectionRsc }
