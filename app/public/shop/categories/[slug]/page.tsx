import { notFound } from 'next/navigation'
import { Render } from '@puckeditor/core/rsc'
import { getCategoryBySlug } from '@/modules/shop/lib/db/catalogue'
import { listProducts } from '@/modules/shop/lib/db/products'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import { resolveThemeLayout } from '@/lib/layout/resolveThemeLayout'
import { getModuleLayoutPuckRscConfig } from '@/lib/puck/config.rsc'
import { injectCategoryContext } from '@/modules/shop/lib/inject-category-context'
import type { PuckData } from '@/modules/shop/lib/types'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const category = await getCategoryBySlug(slug)
  if (!category) return {}
  return { title: category.metaTitle || category.name, description: category.metaDescription || category.description || undefined }
}

export default async function ShopCategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const category = await getCategoryBySlug(slug)
  if (!category) notFound()

  const layout = await resolveThemeLayout('shopCategory', { moduleName: 'shop', slug: category.slug })
  if (layout?.builderData) {
    const data = injectCategoryContext(layout.builderData as PuckData, { categorySlug: category.slug })
    return <Render config={getModuleLayoutPuckRscConfig('shopCategory') as any} data={data as any} />
  }

  const [{ products }, config] = await Promise.all([
    listProducts({ status: 'ACTIVE', categorySlug: slug, perPage: 60 }),
    getShopConfigCached(),
  ])

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '2rem 1.5rem' }}>
      <h1 style={{ fontSize: '1.75rem' }}>{category.name}</h1>
      {category.description && <p style={{ color: 'var(--color-text-muted)' }}>{category.description}</p>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginTop: '1.5rem' }}>
        {products.map((p) => (
          <a key={p.id} href={`/shop/products/${p.slug}`} style={{ textDecoration: 'none', color: 'inherit', border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden', display: 'block' }}>
            <div style={{ aspectRatio: '1/1', background: 'var(--color-surface-muted)' }} />
            <div style={{ padding: '0.75rem' }}>
              <h3 style={{ margin: '0 0 0.25rem', fontSize: '0.9375rem' }}>{p.name}</h3>
              <span style={{ fontWeight: 600 }}>{config.currencySymbol}{p.price}</span>
            </div>
          </a>
        ))}
      </div>
      {products.length === 0 && <p style={{ color: 'var(--color-text-muted)' }}>No products in this category yet.</p>}
    </div>
  )
}
