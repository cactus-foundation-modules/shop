import { Render } from '@puckeditor/core/rsc'
import type { Data } from '@puckeditor/core'
import { prisma } from '@/lib/db/prisma'
import { resolveThemeLayout } from '@/lib/layout/resolveThemeLayout'
import type { LayoutRef } from '@/lib/puck/LayoutPickerField'
import type { PuckData, ShpProduct, ShpProductMedia } from '@/modules/shop/lib/types'
import { injectShopProductCardEmbed } from '@/modules/shop/lib/inject-part-context'
import type { CardPartContext, CardBadge } from '@/modules/shop/components/puck/parts/part-context'

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
): CardPartContext {
  const primary = media.find((m) => m.isPrimary) ?? media[0]
  const image = primary && primary.type !== 'VIDEO_URL' ? { url: primary.url, alt: primary.altText ?? product.name } : null
  const tagSlugs = tagIds.map((id) => tagById.get(id)).filter((s): s is string => Boolean(s))
  return { product, image, currencySymbol, badge: badgeFor(product, tagSlugs, isOutOfStock(product)) }
}

export type CardItem = { product: ShpProduct; ctx: CardPartContext }

// Stamps the template for each product and returns the card anchors. The
// surface supplies the `.shop-grid` wrapper and emits shopCardCss once.
export async function renderCards(template: PuckData, items: CardItem[]): Promise<React.ReactNode> {
  const { getModuleLayoutPuckRscConfig } = await import('@/lib/puck/config.rsc')
  const config = getModuleLayoutPuckRscConfig('shopProductCard')
  return items.map(({ product, ctx }) => {
    const data = injectShopProductCardEmbed(template, ctx)
    return (
      <a key={product.id} href={`/shop/products/${product.slug}`} className="shop-card">
        <Render config={config as any} data={data as Data} />
      </a>
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
        <span className="shop-card-price">
          {ctx.currencySymbol}
          {product.price}
        </span>
      </div>
    </a>
  )
}
