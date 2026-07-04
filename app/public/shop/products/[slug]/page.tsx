import { notFound } from 'next/navigation'
import { Render } from '@puckeditor/core/rsc'
import type { Data } from '@puckeditor/core'
import { puckRscConfig } from '@/lib/puck/config'
import { getPageLayout } from '@/modules/shop/lib/db/page-layouts'
import { getProductBySlug } from '@/modules/shop/lib/db/products'
import { injectProductContext } from '@/modules/shop/lib/inject-product-context'

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
  if (!product || product.status !== 'ACTIVE') notFound()

  const layout = await getPageLayout('product')
  if (!layout) notFound()

  const inStock = !product.trackInventory || (product.stockCount ?? 0) > 0 || product.outOfStockBehaviour === 'BACKORDER' || product.isPreOrder
  const data = injectProductContext(layout.builderData, slug, product.id, inStock)

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '2rem 1.5rem' }}>
      <Render config={puckRscConfig as any} data={data as Data} />
    </div>
  )
}
