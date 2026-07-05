import { connection } from 'next/server'
import { Render } from '@puckeditor/core/rsc'
import type { Data } from '@puckeditor/core'
import { prisma } from '@/lib/db/prisma'
import { resolveThemeLayout } from '@/lib/layout/resolveThemeLayout'
import type { LayoutRef } from '@/lib/puck/LayoutPickerField'
import { getProductBySlug, getProductMedia, getProductTagIds, getDigitalFileById } from '@/modules/shop/lib/db'
import { listTags } from '@/modules/shop/lib/db/catalogue'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import { getShopBreakpoints } from '@/modules/shop/lib/breakpoints'
import { injectShopProductDetailEmbed } from '@/modules/shop/lib/inject-part-context'
import { ShopLayoutPicker } from '@/modules/shop/components/public/ShopLayoutPicker'
import type { PuckData } from '@/modules/shop/lib/types'
import type { DetailPartContext } from '@/modules/shop/components/puck/parts/part-context'

// [ANCHOR] on the shopProduct page. The product detail now renders from a
// designable Product Detail layout (admin > Layouts > Shop > Product Detail),
// built from the part-blocks in components/puck/parts/detail-parts.tsx - not
// hardcoded JSX. This block resolves that layout (a per-block override if set,
// else the published `shopProductDetail` default), injects the current product
// into its parts, and renders it. productSlug is injected by the product page
// (lib/inject-product-context.ts).
export type ShopProductDetailProps = {
  productSlug?: string
  layoutRef?: LayoutRef | null
}

// Editor canvas: a light two-column placeholder so the shopProduct page editor
// isn't misleading - the real layout is the resolved Product Detail template.
export function ShopProductDetail(_props: ShopProductDetailProps) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32, opacity: 0.6, padding: '8px 0' }}>
      <div style={{ border: '1px solid var(--color-border)', borderRadius: 16, background: 'var(--color-bg-subtle)', aspectRatio: '1/1' }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ height: 24, width: '40%', background: 'var(--color-border)', borderRadius: 6 }} />
        <div style={{ height: 30, width: '70%', background: 'var(--color-border)', borderRadius: 6 }} />
        <div style={{ height: 24, width: 110, background: 'var(--color-border)', borderRadius: 6 }} />
        <div style={{ height: 52, width: '80%', background: 'var(--color-border)', borderRadius: 9999, marginTop: 12 }} />
      </div>
    </div>
  )
}

async function resolveDetailTemplate(layoutRef: LayoutRef | null | undefined, slug: string): Promise<PuckData | null> {
  let layout = null
  if (layoutRef?.id) {
    layout = await prisma.layout.findUnique({ where: { id: layoutRef.id } }).catch(() => null)
  }
  if (!layout?.builderData) {
    layout = await resolveThemeLayout('shopProductDetail', { moduleName: 'shop', slug })
  }
  return layout?.builderData ? (layout.builderData as PuckData) : null
}

export async function ShopProductDetailRsc(props: ShopProductDetailProps) {
  await connection()
  if (!props.productSlug) return null
  const product = await getProductBySlug(props.productSlug)
  if (!product) return null

  const [media, config, bp, tags, tagIds, template] = await Promise.all([
    getProductMedia(product.id),
    getShopConfigCached(),
    getShopBreakpoints(),
    listTags(),
    getProductTagIds(product.id),
    resolveDetailTemplate(props.layoutRef, props.productSlug),
  ])
  const tagById = new Map(tags.map((t) => [t.id, t.slug]))
  const tagSlugs = tagIds.map((id) => tagById.get(id)).filter((s): s is string => Boolean(s))

  const digitalFile =
    product.type === 'DIGITAL' && product.digitalFileId ? await getDigitalFileById(product.digitalFileId) : null

  const images = media
    .filter((m) => m.type !== 'VIDEO_URL')
    .map((m) => ({ url: m.url, alt: m.altText ?? product.name }))

  const outOfStock =
    product.trackInventory && (product.stockCount ?? 0) <= 0 && product.outOfStockBehaviour === 'BLOCK' && !product.isPreOrder
  const lowStock =
    !!product.trackInventory &&
    product.stockCount != null &&
    product.stockCount > 0 &&
    product.lowStockThreshold != null &&
    product.stockCount <= product.lowStockThreshold

  const priceNum = Number(product.price)
  const compareNum = product.compareAtPrice ? Number(product.compareAtPrice) : null
  const hasWas = compareNum != null && compareNum > priceNum
  const savePct = hasWas ? Math.round((1 - priceNum / (compareNum as number)) * 100) : null

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.shortDescription ?? product.description ?? undefined,
    image: media.map((m) => m.url),
    sku: product.sku ?? undefined,
    offers: {
      '@type': 'Offer',
      price: product.price,
      priceCurrency: config.currency,
      availability: product.isPreOrder
        ? 'https://schema.org/PreOrder'
        : outOfStock
          ? 'https://schema.org/OutOfStock'
          : 'https://schema.org/InStock',
    },
  }

  if (!template) return null

  const ctx: DetailPartContext = {
    product,
    images,
    currencySymbol: config.currencySymbol,
    tagSlugs,
    digitalFile: digitalFile ? { filename: digitalFile.filename, size: digitalFile.size } : null,
    bp,
    outOfStock,
    lowStock,
    hasWas,
    savePct,
  }
  const data = injectShopProductDetailEmbed(template, ctx)

  const { getModuleLayoutPuckRscConfig } = await import('@/lib/puck/config.rsc')
  return (
    <div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Render config={getModuleLayoutPuckRscConfig('shopProductDetail') as any} data={data as Data} />
    </div>
  )
}

const layoutField = {
  type: 'custom' as const,
  label: 'Layout',
  render: ({ value, onChange }: any) => <ShopLayoutPicker type="shopProductDetail" value={value} onChange={onChange} />,
}

export const shopProductDetailPuckComponent = {
  label: 'Shop: Product Detail [Anchor]',
  fields: {
    layoutRef: layoutField,
  },
  defaultProps: { layoutRef: null },
  permissions: { delete: false, duplicate: false },
  render: ShopProductDetail,
}

export const shopProductDetailPuckRscComponent = { ...shopProductDetailPuckComponent, render: ShopProductDetailRsc }
