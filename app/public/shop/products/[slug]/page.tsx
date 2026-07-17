import { cache } from 'react'
import { notFound } from 'next/navigation'
import { Render } from '@puckeditor/core/rsc'
import type { Data } from '@puckeditor/core'
import { getModuleLayoutPuckRscConfig } from '@/lib/puck/config.rsc'
import { resolveThemeLayout } from '@/lib/layout/resolveThemeLayout'
import { getProductBySlug } from '@/modules/shop/lib/db/products'
import { getShopGate } from '@/modules/shop/lib/access'
import { ShopClosedNotice, ShopStaffPreviewBanner } from '@/modules/shop/components/public/ShopClosedNotice'
import { injectProductContext } from '@/modules/shop/lib/inject-product-context'
import type { PuckData } from '@/modules/shop/lib/types'

// generateMetadata and the render below both need the same row. Behind React
// cache() that is one query per request instead of two. Wrapped here rather
// than in the db layer: other callers there read back rows they have just
// written, and a request-scoped memo would hand them the pre-write row.
const getProduct = cache(getProductBySlug)

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  // A closed shop must not publish its product names either, so the title is
  // withheld from anyone the page itself would turn away.
  if ((await getShopGate()).blocked) return {}
  const product = await getProduct(slug)
  // Mirrors the page's visibility gate below. Next currently discards this
  // metadata once the page calls notFound(), but only while no
  // global-not-found convention exists - adding one flips metadata resolution
  // back to the page and would publish a hidden product's name.
  if (!product || product.status !== 'ACTIVE' || product.catalogueHidden) return {}
  return {
    title: product.metaTitle || product.name,
    description: product.metaDescription || product.shortDescription || undefined,
  }
}

export default async function ShopProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const gate = await getShopGate()
  if (gate.blocked) return <ShopClosedNotice message={gate.message} />

  const product = await getProduct(slug)
  // Catalogue-hidden rows (variant children) are reached only through their
  // parent's selector, never on their own URL.
  if (!product || product.status !== 'ACTIVE' || product.catalogueHidden) notFound()

  const layout = await resolveThemeLayout('shopProduct', { moduleName: 'shop', slug })
  if (!layout?.builderData) notFound()

  const inStock = !product.trackInventory || (product.stockCount ?? 0) > 0 || product.outOfStockBehaviour === 'BACKORDER' || product.isPreOrder
  const data = injectProductContext(layout.builderData as PuckData, slug, product.id, inStock)

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '2rem 1.5rem' }}>
      {gate.staffPreview && <ShopStaffPreviewBanner />}
      <Render config={getModuleLayoutPuckRscConfig('shopProduct') as any} data={data as Data} />
    </div>
  )
}
