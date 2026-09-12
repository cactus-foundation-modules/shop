import { Suspense } from 'react'
import { connection } from 'next/server'
import { getProductBySlugCached, getProductMediaForProducts, getProductTagIdsForProducts } from '@/modules/shop/lib/db'
import { listTags } from '@/modules/shop/lib/db/catalogue'
import { resolveRelatedProducts } from '@/modules/shop/lib/db/recommendations'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import { getShopBreakpoints } from '@/modules/shop/lib/breakpoints'
import { resolveCardTemplate, buildCardContext, buildTagMaps, renderCards, MinimalCard, type CardItem } from '@/modules/shop/lib/card-template'
import { resolveCardFromPrices } from '@/modules/shop/lib/card-price'
import { resolveTaxDisplay } from '@/modules/shop/lib/tax-display'
import { resolveShopCardExtras } from '@/modules/shop/lib/card-media'
import { shopCardCss } from '@/modules/shop/components/puck/parts/card-parts'
import { shopRelatedProductsPuckComponent, type ShopRelatedProductsProps } from './ShopRelatedProducts'
import { resolveShopCommerceMode } from '@/modules/shop/lib/commerce-mode'
import { SharedStyle } from '@/components/SharedStyle'
import { CardGridSkeleton } from '@/components/CardGridSkeleton'

// Server (RSC) half of Shop: Related Products. Kept out of the client editor
// bundle - see ShopRelatedProducts.tsx.

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
//
// Four tiles reserved, because this block has no limit field and settles on
// `Math.min(items.length, 4)` once it knows what it found - which is also what
// its own editor canvas draws.
export function ShopRelatedProductsRsc(props: ShopRelatedProductsProps) {
  return (
    <Suspense fallback={<CardGridSkeleton columns={4} count={4} />}>
      <ShopRelatedProductsRscBody {...props} />
    </Suspense>
  )
}

async function ShopRelatedProductsRscBody(props: ShopRelatedProductsProps) {
  await connection()
  if (!props.productSlug) return null
  const product = await getProductBySlugCached(props.productSlug)
  if (!product) return null
  const related = await resolveRelatedProducts(product)
  if (related.length === 0) return null

  const [config, bp, tags, template] = await Promise.all([
    getShopConfigCached(),
    getShopBreakpoints(),
    listTags(),
    resolveCardTemplate(),
  ])
  const { tagById, tagsById } = buildTagMaps(tags)

  const relatedIds = related.map((p) => p.id)
  const [mediaByProduct, tagIdsByProduct, fromPrices, cardExtras, taxDisplay] = await Promise.all([
    getProductMediaForProducts(relatedIds),
    getProductTagIdsForProducts(relatedIds),
    resolveCardFromPrices(relatedIds),
    resolveShopCardExtras(relatedIds),
    resolveTaxDisplay(),
  ])
  // What the shop prints prices as (net or gross) is a per-shop answer, not a
  // per-card one, so it is resolved once here and handed to every card.
  // Whether prices may be shown at all is a per-shop answer too - a quote-only
  // shop withholds every figure on every card, not some of them. Cached, so this
  // costs nothing per surface. See lib/commerce-mode.ts.
  const pricing = { ...config, taxDisplay, commerce: await resolveShopCommerceMode() }
  const items: CardItem[] = related.map((p) => ({
    product: p,
    ctx: buildCardContext(p, mediaByProduct.get(p.id) ?? [], tagById, tagIdsByProduct.get(p.id) ?? [], config.currencySymbol, pricing, fromPrices.get(p.id) ?? null, cardExtras.get(p.id), tagsById),
  }))

  const columns = Math.min(items.length, 4)
  const cards = template ? await renderCards(template, items) : items.map((item) => <MinimalCard key={item.product.id} {...item} />)
  const carousel = props.layout === 'Carousel'

  return (
    <section>
      <SharedStyle id="shop-cards" css={shopCardCss(bp)} />
      <div className="shop-sec-head">
        <h2>{props.heading || 'Completes the setup'}</h2>
        {props.subheading && <span>{props.subheading}</span>}
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

export const shopRelatedProductsPuckRscComponent = { ...shopRelatedProductsPuckComponent, render: ShopRelatedProductsRsc }
