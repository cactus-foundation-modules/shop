import { connection } from 'next/server'
import { getProductBySlug, getProductMedia } from '@/modules/shop/lib/db'
import { getShopConfigCached } from '@/modules/shop/lib/config'

export type ShopProductCardProps = { productSlug?: string }

export function ShopProductCard(_props: ShopProductCardProps) {
  return (
    <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: '0.75rem', opacity: 0.6, maxWidth: 240 }}>
      <div style={{ aspectRatio: '1/1', background: 'var(--color-border)', borderRadius: 6, marginBottom: '0.5rem' }} />
      <div style={{ height: 12, width: '70%', background: 'var(--color-border)', borderRadius: 4 }} />
    </div>
  )
}

export async function ShopProductCardRsc(props: ShopProductCardProps) {
  await connection()
  if (!props.productSlug) return null
  const product = await getProductBySlug(props.productSlug)
  if (!product || product.status !== 'ACTIVE') return null
  const media = await getProductMedia(product.id)
  const primary = media.find((m) => m.isPrimary) ?? media[0]
  const config = await getShopConfigCached()

  return (
    <a href={`/shop/products/${product.slug}`} style={{ textDecoration: 'none', color: 'inherit', border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden', display: 'block', maxWidth: 240 }}>
      <div style={{ aspectRatio: '1/1', background: 'var(--color-surface-muted)' }}>
        {primary && primary.type !== 'VIDEO_URL' && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={primary.url} alt={primary.altText ?? product.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        )}
      </div>
      <div style={{ padding: '0.75rem' }}>
        <h3 style={{ margin: '0 0 0.25rem', fontSize: '0.9375rem' }}>{product.name}</h3>
        <span style={{ fontWeight: 600 }}>{config.currencySymbol}{product.price}</span>
      </div>
    </a>
  )
}

export const shopProductCardPuckComponent = {
  label: 'Shop: Single Product',
  fields: { productSlug: { type: 'text' as const, label: 'Product slug' } },
  defaultProps: { productSlug: '' },
  render: ShopProductCard,
}

export const shopProductCardPuckRscComponent = { ...shopProductCardPuckComponent, render: ShopProductCardRsc }
