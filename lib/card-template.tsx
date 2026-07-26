import { Render } from '@puckeditor/core/rsc'
import type { Data } from '@puckeditor/core'
import { prisma } from '@/lib/db/prisma'
import { resolveThemeLayout } from '@/lib/layout/resolveThemeLayout'
import type { LayoutRef } from '@/lib/puck/LayoutPickerField'
import type { PuckData, ShpProduct, ShpProductMedia } from '@/modules/shop/lib/types'
import { injectShopProductCardEmbed } from '@/modules/shop/lib/inject-part-context'
import { formatMoney } from '@/modules/shop/lib/money'
import { priceView } from '@/modules/shop/lib/pricing'
import type { CardPartContext, CardBadge, PartImage } from '@/modules/shop/components/puck/parts/part-context'
import type { ShopCardExtra } from '@/modules/shop/lib/card-media'

// Server-only helper shared by every product-card surface (grid, related,
// featured, single). It resolves the one Product Card template - a per-block
// override if the surface was given one, else the published `shopProductCard`
// default - and stamps it once per product with injected context. There is no
// hardcoded design fallback: the published Default starter is the source of
// truth (see SPEC_shop_block_layouts.md). The tiny MinimalCard below is only a
// safety net for the pathological case where an owner has unpublished every
// card layout, so the storefront never renders a blank grid.
//
// config.rsc is imported dynamically (as LayoutEmbedRsc does) to avoid an import
// cycle: config.rsc -> module-rsc-components -> these surfaces -> this file.

export async function resolveCardTemplate(layoutRef?: LayoutRef | null): Promise<PuckData | null> {
  let layout = null
  if (layoutRef?.id) {
    layout = await prisma.layout.findUnique({ where: { id: layoutRef.id } }).catch(() => null)
  }
  if (!layout?.builderData) {
    layout = await resolveThemeLayout('shopProductCard', { moduleName: 'shop' })
  }
  if (!layout?.builderData) return null
  return layout.builderData as PuckData
}

function isOutOfStock(product: ShpProduct): boolean {
  return (
    !!product.trackInventory &&
    (product.stockCount ?? 0) <= 0 &&
    product.outOfStockBehaviour === 'BLOCK' &&
    !product.isPreOrder
  )
}

function badgeFor(product: ShpProduct, tagSlugs: string[], outOfStock: boolean): CardBadge | null {
  if (outOfStock) return { label: 'Out of stock', variant: 'muted' }
  if (product.isPreOrder) return { label: 'Pre-order', variant: 'new' }
  if (tagSlugs.includes('new')) return { label: 'New', variant: 'new' }
  const lowStock =
    !!product.trackInventory &&
    product.stockCount != null &&
    product.stockCount > 0 &&
    product.lowStockThreshold != null &&
    product.stockCount <= product.lowStockThreshold
  if (lowStock) return { label: 'Low stock', variant: 'low' }
  if (tagSlugs.includes('trade')) return { label: 'Trade price', variant: 'trade' }
  return null
}

// Builds the per-product context from data the surface already loaded - no
// re-query happens here (spec wrinkle 1: pass data down, don't re-fetch).
export function buildCardContext(
  product: ShpProduct,
  media: ShpProductMedia[],
  tagById: Map<string, string>,
  tagIds: string[],
  currencySymbol: string,
  // Which optional price types the shop has switched on, and whether an RRP is
  // shown to shoppers. Optional so a card surface in another module that has not
  // been rebuilt still compiles; without it a sale price set on a product shows
  // even if the shop has since switched sale prices off.
  pricing?: { enabledPriceTypes?: readonly string[]; showRetailPrice?: boolean },
  // The cheapest figure when a companion module prices this product as a range
  // (shop-variations), resolved once for the whole grid via resolveCardFromPrices
  // and passed in per product. Null/absent leaves the card on shop's own price.
  fromPrice?: string | null,
  // Images + overlays contributed by companion modules through `shop.card-media`,
  // resolved once for the whole grid via resolveShopCardExtras and passed in per
  // product. Absent on a shop-only site and for any product no module added to.
  extra?: ShopCardExtra,
): CardPartContext {
  // The product's own pictures, primary first then the rest in position order,
  // videos-by-URL excluded (they cannot sit in an <img>) - the same filter the
  // detail gallery uses. Variation photos, if any, follow after.
  const usable = media.filter((m) => m.type !== 'VIDEO_URL')
  const primary = usable.find((m) => m.isPrimary) ?? usable[0]
  const ordered = primary ? [primary, ...usable.filter((m) => m !== primary)] : usable
  const ownImages: PartImage[] = ordered.map((m) => ({ url: m.url, alt: m.altText ?? product.name }))
  // Own images first, then any a companion module folded in, deduped by url so a
  // variation whose photo is also the parent's primary does not appear twice.
  const images: PartImage[] = []
  const seenUrls = new Set<string>()
  for (const im of [...ownImages, ...(extra?.images ?? [])]) {
    if (seenUrls.has(im.url)) continue
    seenUrls.add(im.url)
    images.push(im)
  }
  const tagSlugs = tagIds.map((id) => tagById.get(id)).filter((s): s is string => Boolean(s))
  return {
    product,
    image: images[0] ?? null,
    images,
    overlays: extra?.overlays ?? [],
    facts: extra?.facts ?? [],
    currencySymbol,
    prices: priceView(product, pricing?.enabledPriceTypes),
    showRetailPrice: pricing?.showRetailPrice ?? false,
    badge: badgeFor(product, tagSlugs, isOutOfStock(product)),
    fromPrice: fromPrice ?? null,
  }
}

export type CardItem = { product: ShpProduct; ctx: CardPartContext }

// Stamps the template for each product and returns the card anchors. The
// surface supplies the `.shop-grid` wrapper and emits shopCardCss once.
export async function renderCards(template: PuckData, items: CardItem[]): Promise<React.ReactNode> {
  const { getModuleLayoutPuckRscConfig } = await import('@/lib/puck/config.rsc')
  const config = getModuleLayoutPuckRscConfig('shopProductCard')
  // Every block registered for this layout type, shop's own parts and any a
  // companion module contributed. They all get the card context injected, so a
  // module's card part renders real data rather than its editor skeleton.
  const partTypes = config.categories.blocks.components
  return items.map(({ product, ctx }) => {
    const data = injectShopProductCardEmbed(template, ctx, partTypes)
    return (
      <div key={product.id} className="shop-card">
        {/* Stretched link: the whole card still navigates, but the anchor is a
            sibling under the parts rather than wrapping them. That is what lets the
            image carousel's arrows and the 3D icon inside the card be real, focusable
            buttons instead of interactive content illegally nested in an <a>. The
            link sits above the picture and text (z-index) but below those controls -
            see shopCardCss. */}
        <a className="shop-card-link" href={`/shop/products/${product.slug}`} aria-label={product.name} />
        <Render config={config as any} data={data as Data} />
      </div>
    )
  })
}

// Safety-net card used only when no Product Card layout is published at all.
export function MinimalCard({ product, ctx }: CardItem) {
  return (
    <a href={`/shop/products/${product.slug}`} className="shop-card">
      <div className="shop-card-img">
        {ctx.image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={ctx.image.url} alt={ctx.image.alt} />
        )}
      </div>
      <h3 className="shop-card-name">{product.name}</h3>
      <div className="shop-card-pricerow">
        {ctx.fromPrice != null ? (
          <span className="shop-card-price">From {formatMoney(ctx.fromPrice, ctx.currencySymbol)}</span>
        ) : (
          <>
            <span className="shop-card-price">{formatMoney(ctx.prices.now, ctx.currencySymbol)}</span>
            {ctx.prices.was && <span className="shop-card-compare">{formatMoney(ctx.prices.was, ctx.currencySymbol)}</span>}
          </>
        )}
      </div>
    </a>
  )
}
