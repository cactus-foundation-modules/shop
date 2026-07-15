import { notFound } from 'next/navigation'
import { Render } from '@puckeditor/core/rsc'
import { getCollectionBySlug } from '@/modules/shop/lib/db/catalogue'
import { listProducts } from '@/modules/shop/lib/db/products'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import { resolveThemeLayout } from '@/lib/layout/resolveThemeLayout'
import { getModuleLayoutPuckRscConfig } from '@/lib/puck/config.rsc'
import { injectCollectionContext } from '@/modules/shop/lib/inject-collection-context'
import type { PuckData } from '@/modules/shop/lib/types'
import { formatMoney } from '@/modules/shop/lib/money'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const collection = await getCollectionBySlug(slug)
  if (!collection) return {}
  return { title: collection.metaTitle || collection.name, description: collection.metaDescription || collection.description || undefined }
}

export default async function ShopCollectionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const collection = await getCollectionBySlug(slug)
  if (!collection) notFound()

  const layout = await resolveThemeLayout('shopCollection', { moduleName: 'shop', slug: collection.slug })
  if (layout?.builderData) {
    const data = injectCollectionContext(layout.builderData as PuckData, { collectionSlug: collection.slug })
    return <Render config={getModuleLayoutPuckRscConfig('shopCollection') as any} data={data as any} />
  }

  const [{ products }, config] = await Promise.all([
    listProducts({ status: 'ACTIVE', collectionSlug: slug, perPage: 60, excludeHidden: true }),
    getShopConfigCached(),
  ])

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '2rem 1.5rem' }}>
      <h1 style={{ fontSize: '1.75rem' }}>{collection.name}</h1>
      {collection.description && <p style={{ color: 'var(--color-text-muted)' }}>{collection.description}</p>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginTop: '1.5rem' }}>
        {products.map((p) => (
          <a key={p.id} href={`/shop/products/${p.slug}`} style={{ textDecoration: 'none', color: 'inherit', border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden', display: 'block' }}>
            <div style={{ aspectRatio: '1/1', background: 'var(--color-surface-muted)' }} />
            <div style={{ padding: '0.75rem' }}>
              <h3 style={{ margin: '0 0 0.25rem', fontSize: '0.9375rem' }}>{p.name}</h3>
              <span style={{ fontWeight: 600 }}>{formatMoney(p.price, config.currencySymbol)}</span>
            </div>
          </a>
        ))}
      </div>
      {products.length === 0 && <p style={{ color: 'var(--color-text-muted)' }}>No products in this collection yet.</p>}
    </div>
  )
}
