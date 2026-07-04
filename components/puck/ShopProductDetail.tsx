import { connection } from 'next/server'
import { getProductBySlug, getProductMedia } from '@/modules/shop/lib/db'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import { AddToCartButton } from '@/modules/shop/components/public/AddToCartButton'

// [ANCHOR] - add-to-cart button is a non-removable core field. productSlug is
// injected by the product detail page (lib/inject-product-context.ts) since
// this block has no configurable Puck fields of its own (spec 12).
export type ShopProductDetailProps = { productSlug?: string }

export function ShopProductDetail(_props: ShopProductDetailProps) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', opacity: 0.6 }}>
      <div style={{ aspectRatio: '1/1', background: 'var(--color-border)', borderRadius: 8 }} />
      <div style={{ display: 'grid', gap: '0.75rem', alignContent: 'start' }}>
        <div style={{ height: 24, width: '60%', background: 'var(--color-border)', borderRadius: 4 }} />
        <div style={{ height: 20, width: '30%', background: 'var(--color-border)', borderRadius: 4 }} />
      </div>
    </div>
  )
}

export async function ShopProductDetailRsc(props: ShopProductDetailProps) {
  await connection()
  if (!props.productSlug) return null
  const product = await getProductBySlug(props.productSlug)
  if (!product) return null

  const [media, config] = await Promise.all([
    getProductMedia(product.id), getShopConfigCached(),
  ])
  const primary = media.find((m) => m.isPrimary) ?? media[0]

  const outOfStock = product.trackInventory && (product.stockCount ?? 0) <= 0 && product.outOfStockBehaviour === 'BLOCK' && !product.isPreOrder
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
        : outOfStock ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock',
    },
  }

  return (
    <div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
        <div style={{ aspectRatio: '1/1', background: 'var(--color-surface-muted)', borderRadius: 8, overflow: 'hidden' }}>
          {primary && primary.type !== 'VIDEO_URL' && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={primary.url} alt={primary.altText ?? product.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          )}
        </div>
        <div style={{ display: 'grid', gap: '0.75rem', alignContent: 'start' }}>
          <h1 style={{ fontSize: '1.75rem', margin: 0 }}>{product.name}</h1>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'baseline' }}>
            <span style={{ fontSize: '1.375rem', fontWeight: 600 }}>{config.currencySymbol}{product.price}</span>
            {product.compareAtPrice && <span style={{ textDecoration: 'line-through', color: 'var(--color-text-muted)' }}>{config.currencySymbol}{product.compareAtPrice}</span>}
          </div>
          {product.isPreOrder && (
            <p style={{ background: 'var(--color-surface-muted)', borderRadius: 6, padding: '0.5rem 0.75rem', fontSize: '0.875rem' }}>
              Pre-order{product.preOrderDispatchDate ? ` - expected dispatch ${new Date(product.preOrderDispatchDate).toLocaleDateString('en-GB')}` : ''}
              {product.preOrderNote ? `. ${product.preOrderNote}` : ''}
            </p>
          )}
          {product.shortDescription && <p style={{ color: 'var(--color-text-muted)' }}>{product.shortDescription}</p>}

          {outOfStock ? (
            <p style={{ color: 'var(--color-text-muted)' }}>Out of stock</p>
          ) : (
            <AddToCartButton productId={product.id} />
          )}
        </div>
      </div>

      {product.description && (
        <div style={{ marginTop: '2rem', maxWidth: 700 }}>
          <h2 style={{ fontSize: '1.125rem' }}>Description</h2>
          <p style={{ whiteSpace: 'pre-wrap' }}>{product.description}</p>
        </div>
      )}
    </div>
  )
}

export const shopProductDetailPuckComponent = {
  label: 'Shop: Product Detail [Anchor]',
  fields: {},
  defaultProps: {},
  permissions: { delete: false, duplicate: false },
  render: ShopProductDetail,
}

export const shopProductDetailPuckRscComponent = { ...shopProductDetailPuckComponent, render: ShopProductDetailRsc }
