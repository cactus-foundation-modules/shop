import { connection } from 'next/server'
import { listProducts, getProductMedia } from '@/modules/shop/lib/db'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import type { ShpProduct } from '@/modules/shop/lib/types'

export type ShopProductGridProps = {
  categorySlug?: string
  collectionSlug?: string
  tagSlug?: string
  limit?: number
  columns?: number
  showFilters?: string
}

function GridSkeleton({ columns }: { columns: number }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: '1rem', opacity: 0.6 }}>
      {Array.from({ length: columns * 2 }).map((_, i) => (
        <div key={i} style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: '0.75rem' }}>
          <div style={{ aspectRatio: '1/1', background: 'var(--color-border)', borderRadius: 6, marginBottom: '0.5rem' }} />
          <div style={{ height: 12, width: '70%', background: 'var(--color-border)', borderRadius: 4, marginBottom: '0.375rem' }} />
          <div style={{ height: 12, width: '40%', background: 'var(--color-border)', borderRadius: 4 }} />
        </div>
      ))}
    </div>
  )
}

// Editor canvas: static skeleton, no fetch during render (Gazette pattern).
export function ShopProductGrid(props: ShopProductGridProps) {
  return <GridSkeleton columns={props.columns ?? 3} />
}

async function ProductCard({ product, currencySymbol }: { product: ShpProduct; currencySymbol: string }) {
  const media = await getProductMedia(product.id)
  const primary = media.find((m) => m.isPrimary) ?? media[0]
  const outOfStock = product.trackInventory && (product.stockCount ?? 0) <= 0 && product.outOfStockBehaviour === 'BLOCK' && !product.isPreOrder

  return (
    <a
      href={`/shop/products/${product.slug}`}
      style={{ textDecoration: 'none', color: 'inherit', border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden', display: 'block' }}
    >
      <div style={{ aspectRatio: '1/1', background: 'var(--color-surface-muted)', position: 'relative' }}>
        {primary && primary.type !== 'VIDEO_URL' && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={primary.url} alt={primary.altText ?? product.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        )}
        {product.isPreOrder && (
          <span style={{ position: 'absolute', top: 8, left: 8, background: 'var(--color-primary)', color: 'var(--color-primary-contrast, #fff)', fontSize: '0.6875rem', padding: '0.125rem 0.5rem', borderRadius: 999 }}>
            Pre-order
          </span>
        )}
        {outOfStock && (
          <span style={{ position: 'absolute', top: 8, right: 8, background: 'var(--color-surface)', color: 'var(--color-text-muted)', fontSize: '0.6875rem', padding: '0.125rem 0.5rem', borderRadius: 999, border: '1px solid var(--color-border)' }}>
            Out of stock
          </span>
        )}
      </div>
      <div style={{ padding: '0.75rem' }}>
        <h3 style={{ margin: '0 0 0.25rem', fontSize: '0.9375rem' }}>{product.name}</h3>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'baseline' }}>
          <span style={{ fontWeight: 600 }}>{currencySymbol}{product.price}</span>
          {product.compareAtPrice && (
            <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', textDecoration: 'line-through' }}>
              {currencySymbol}{product.compareAtPrice}
            </span>
          )}
        </div>
      </div>
    </a>
  )
}

// RSC: real products, per-request via connection() (stock/pricing must never be stale-cached).
export async function ShopProductGridRsc(props: ShopProductGridProps) {
  await connection()
  const columns = props.columns ?? 3
  const config = await getShopConfigCached()
  const { products } = await listProducts({
    status: 'ACTIVE',
    categorySlug: props.categorySlug || undefined,
    collectionSlug: props.collectionSlug || undefined,
    tagSlug: props.tagSlug || undefined,
    perPage: props.limit ?? 12,
  })

  if (products.length === 0) {
    return <p style={{ color: 'var(--color-text-muted)' }}>No products to show yet.</p>
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: '1rem' }}>
      {products.map((p) => (
        <ProductCard key={p.id} product={p} currencySymbol={config.currencySymbol} />
      ))}
    </div>
  )
}

export const shopProductGridPuckComponent = {
  label: 'Shop: Product Grid',
  fields: {
    categorySlug: { type: 'text' as const, label: 'Category slug (optional)' },
    collectionSlug: { type: 'text' as const, label: 'Collection slug (optional)' },
    tagSlug: { type: 'text' as const, label: 'Tag slug (optional)' },
    limit: { type: 'number' as const, label: 'Number of products' },
    columns: { type: 'number' as const, label: 'Columns' },
    showFilters: { type: 'select' as const, label: 'Show filters', options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }] },
  },
  defaultProps: { categorySlug: '', collectionSlug: '', tagSlug: '', limit: 12, columns: 3, showFilters: 'no' },
  render: ShopProductGrid,
}

export const shopProductGridPuckRscComponent = {
  ...shopProductGridPuckComponent,
  render: ShopProductGridRsc,
}
