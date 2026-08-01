import type { ReactNode } from 'react'
import { getProductsByIds, getProductMedia, getProductTagIds } from '@/modules/shop/lib/db'
import { listTags } from '@/modules/shop/lib/db/catalogue'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import { getShopBreakpoints } from '@/modules/shop/lib/breakpoints'
import { resolveCardTemplate, buildCardContext, renderCards, MinimalCard, type CardItem } from '@/modules/shop/lib/card-template'
import { resolveCardFromPrices } from '@/modules/shop/lib/card-price'
import { resolveTaxDisplay } from '@/modules/shop/lib/tax-display'
import { resolveShopCardExtras } from '@/modules/shop/lib/card-media'
import { resolveShopCommerceMode } from '@/modules/shop/lib/commerce-mode'
import { shopCardCss } from '@/modules/shop/components/puck/parts/card-parts'

// Provider for the search module's `search.shop-cards` extension point.
// Stamps the site's designed Product Card template for a list of product ids -
// the exact pipeline ShopProductGridRsc uses, so search results are identical
// by construction to the shop grids. Server-side only (the registry that
// carries this is only importable from RSC/route code).
export const shopSearchCardProvider = {
  // `media: 'still'` renders each card with its primary image only and no
  // overlay controls. The search dropdown injects this markup as fetched HTML
  // that never hydrates, so the carousel arrows and 3D button would render as
  // dead controls there - a single still image is honest about what works.
  async renderProductCards(productIds: string[], opts?: { columns?: number; media?: 'interactive' | 'still' }): Promise<ReactNode | null> {
    if (productIds.length === 0) return null
    const config = await getShopConfigCached()
    if (config.shopStatus === 'CLOSED') return null

    const [bp, tags, productById, template] = await Promise.all([
      getShopBreakpoints(),
      listTags(),
      getProductsByIds(productIds),
      resolveCardTemplate(null),
    ])
    // Preserve the caller's (relevance) order; drop anything not publicly listable.
    const products = productIds
      .map((id) => productById.get(id))
      .filter((p): p is NonNullable<typeof p> => Boolean(p && p.status === 'ACTIVE' && !p.catalogueHidden))
    if (products.length === 0) return null

    const tagById = new Map(tags.map((t) => [t.id, t.slug]))
    const ids = products.map((p) => p.id)
    const [fromPrices, cardExtras, taxDisplay] = await Promise.all([
      resolveCardFromPrices(ids),
      resolveShopCardExtras(ids),
      resolveTaxDisplay(),
    ])
    const pricing = { ...config, taxDisplay, commerce: await resolveShopCommerceMode() }
    const still = opts?.media === 'still'
    const items: CardItem[] = await Promise.all(
      products.map(async (product) => {
        const [media, tagIds] = await Promise.all([getProductMedia(product.id), getProductTagIds(product.id)])
        const ctx = buildCardContext(product, media, tagById, tagIds, config.currencySymbol, pricing, fromPrices.get(product.id) ?? null, cardExtras.get(product.id))
        // Facts (e.g. the variation swatch row) survive a still card - they are
        // plain server-rendered markup, unlike the carousel and its overlays.
        return { product, ctx: still ? { ...ctx, images: ctx.images.slice(0, 1), overlays: [] } : ctx }
      }),
    )

    const cards = template ? await renderCards(template, items) : items.map((item) => <MinimalCard key={item.product.id} {...item} />)
    const columns = Math.max(2, Math.min(4, opts?.columns ?? 3))
    return (
      <>
        <style dangerouslySetInnerHTML={{ __html: shopCardCss(bp) }} />
        <div className="shop-grid" style={{ ['--shop-cols' as string]: String(columns) } as React.CSSProperties}>
          {cards}
        </div>
      </>
    )
  },
}
