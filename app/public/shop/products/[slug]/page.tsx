import { notFound } from 'next/navigation'
import { Render } from '@puckeditor/core/rsc'
import type { Data } from '@puckeditor/core'
import { getModuleLayoutPuckRscConfig } from '@/lib/puck/config.rsc'
import { resolveThemeLayout } from '@/lib/layout/resolveThemeLayout'
import { getProductBySlug } from '@/modules/shop/lib/db/products'
import { injectProductContext } from '@/modules/shop/lib/inject-product-context'
import type { PuckData } from '@/modules/shop/lib/types'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const product = await getProductBySlug(slug)
  if (!product) return {}
  return {
    title: product.metaTitle || product.name,
    description: product.metaDescription || product.shortDescription || undefined,
  }
}

export default async function ShopProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const product = await getProductBySlug(slug)
  // Catalogue-hidden rows (variant children) are reached only through their
  // parent's selector, never on their own URL.
  if (!product || product.status !== 'ACTIVE' || product.catalogueHidden) notFound()

  const layout = await resolveThemeLayout('shopProduct', { moduleName: 'shop', slug })
  if (!layout?.builderData) notFound()

  const inStock = !product.trackInventory || (product.stockCount ?? 0) > 0 || product.outOfStockBehaviour === 'BACKORDER' || product.isPreOrder
  const data = injectProductContext(layout.builderData as PuckData, slug, product.id, inStock)

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '2rem 1.5rem' }}>
      <Render config={getModuleLayoutPuckRscConfig('shopProduct') as any} data={data as Data} />
    </div>
  )
}
