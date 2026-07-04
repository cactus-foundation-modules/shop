import { connection } from 'next/server'
import { getCollectionBySlug, listProducts } from '@/modules/shop/lib/db'
import { getShopConfigCached } from '@/modules/shop/lib/config'

export type ShopFeaturedCollectionProps = { collectionSlug?: string; layout?: string; limit?: number }

export function ShopFeaturedCollection(props: ShopFeaturedCollectionProps) {
  const limit = props.limit ?? 4
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(limit, 4)}, 1fr)`, gap: '1rem', opacity: 0.6 }}>
      {Array.from({ length: Math.min(limit, 4) }).map((_, i) => (
        <div key={i} style={{ aspectRatio: '1/1', background: 'var(--color-border)', borderRadius: 8 }} />
      ))}
    </div>
  )
}

export async function ShopFeaturedCollectionRsc(props: ShopFeaturedCollectionProps) {
  await connection()
  if (!props.collectionSlug) return null
  const collection = await getCollectionBySlug(props.collectionSlug)
  if (!collection) return null
  const config = await getShopConfigCached()
  const { products } = await listProducts({ status: 'ACTIVE', collectionSlug: props.collectionSlug, perPage: props.limit ?? 4 })
  if (products.length === 0) return null

  const layout = props.layout ?? 'Grid'
  return (
    <section>
      <h2 style={{ fontSize: '1.25rem', margin: '0 0 1rem' }}>{collection.name}</h2>
      <div style={{
        display: layout === 'Carousel' ? 'flex' : 'grid',
        gridTemplateColumns: layout === 'Carousel' ? undefined : `repeat(${Math.min(products.length, 4)}, 1fr)`,
        gap: '1rem', overflowX: layout === 'Carousel' ? 'auto' : undefined,
      }}>
        {products.map((p) => (
          <a key={p.id} href={`/shop/products/${p.slug}`} style={{ textDecoration: 'none', color: 'inherit', minWidth: layout === 'Carousel' ? 200 : undefined, border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden', display: 'block' }}>
            <div style={{ aspectRatio: '1/1', background: 'var(--color-bg-subtle)' }} />
            <div style={{ padding: '0.75rem' }}>
              <h3 style={{ margin: '0 0 0.25rem', fontSize: '0.9375rem' }}>{p.name}</h3>
              <span style={{ fontWeight: 600 }}>{config.currencySymbol}{p.price}</span>
            </div>
          </a>
        ))}
      </div>
    </section>
  )
}

export const shopFeaturedCollectionPuckComponent = {
  label: 'Shop: Featured Collection',
  fields: {
    collectionSlug: { type: 'text' as const, label: 'Collection slug' },
    layout: { type: 'select' as const, label: 'Layout', options: [{ value: 'Grid', label: 'Grid' }, { value: 'Carousel', label: 'Carousel' }] },
    limit: { type: 'number' as const, label: 'Number of products' },
  },
  defaultProps: { collectionSlug: '', layout: 'Grid', limit: 4 },
  render: ShopFeaturedCollection,
}

export const shopFeaturedCollectionPuckRscComponent = { ...shopFeaturedCollectionPuckComponent, render: ShopFeaturedCollectionRsc }
