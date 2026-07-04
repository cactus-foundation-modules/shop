import { connection } from 'next/server'
import { getProductBySlug } from '@/modules/shop/lib/db'
import { resolveRelatedProducts } from '@/modules/shop/lib/db/recommendations'
import { getShopConfigCached } from '@/modules/shop/lib/config'

// productSlug is injected by the product detail page (lib/inject-product-context.ts).
export type ShopRelatedProductsProps = { productSlug?: string; heading?: string; layout?: string }

export function ShopRelatedProducts(props: ShopRelatedProductsProps) {
  return (
    <div style={{ opacity: 0.6 }}>
      <h2 style={{ fontSize: '1.125rem' }}>{props.heading || 'Related products'}</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
        {Array.from({ length: 4 }).map((_, i) => <div key={i} style={{ aspectRatio: '1/1', background: 'var(--color-border)', borderRadius: 8 }} />)}
      </div>
    </div>
  )
}

export async function ShopRelatedProductsRsc(props: ShopRelatedProductsProps) {
  await connection()
  if (!props.productSlug) return null
  const product = await getProductBySlug(props.productSlug)
  if (!product) return null
  const related = await resolveRelatedProducts(product)
  if (related.length === 0) return null
  const config = await getShopConfigCached()

  return (
    <section>
      <h2 style={{ fontSize: '1.125rem' }}>{props.heading || 'Related products'}</h2>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(related.length, 4)}, 1fr)`, gap: '1rem' }}>
        {related.map((p) => (
          <a key={p.id} href={`/shop/products/${p.slug}`} style={{ textDecoration: 'none', color: 'inherit', border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden', display: 'block' }}>
            <div style={{ aspectRatio: '1/1', background: 'var(--color-surface-muted)' }} />
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

export const shopRelatedProductsPuckComponent = {
  label: 'Shop: Related Products',
  fields: { heading: { type: 'text' as const, label: 'Heading' }, layout: { type: 'select' as const, label: 'Layout', options: [{ value: 'Grid', label: 'Grid' }] } },
  defaultProps: { heading: 'Related products', layout: 'Grid' },
  render: ShopRelatedProducts,
}

export const shopRelatedProductsPuckRscComponent = { ...shopRelatedProductsPuckComponent, render: ShopRelatedProductsRsc }
