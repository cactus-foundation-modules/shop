import { connection } from 'next/server'
import { getProductBySlug, getProductMedia } from '@/modules/shop/lib/db'
import { resolveRelatedProducts } from '@/modules/shop/lib/db/recommendations'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import { productCardCss } from '@/modules/shop/components/public/product-card-css'
import { DEFAULT_BREAKPOINTS, getShopBreakpoints } from '@/modules/shop/lib/breakpoints'

// productSlug is injected by the product detail page (lib/inject-product-context.ts).
export type ShopRelatedProductsProps = { productSlug?: string; heading?: string; subheading?: string; layout?: string }

function ViewArrow() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// Editor canvas: static card-grid skeleton (Gazette pattern).
export function ShopRelatedProducts(props: ShopRelatedProductsProps) {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: productCardCss(DEFAULT_BREAKPOINTS) }} />
      <div className="spc-head">
        <h2>{props.heading || 'Completes the setup'}</h2>
        {props.subheading && <span>{props.subheading}</span>}
      </div>
      <div className="spc-grid" style={{ opacity: 0.6 }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="spc-card">
            <div className="spc-img" />
            <div className="spc-body">
              <div style={{ height: 14, width: '70%', background: 'var(--color-border)', borderRadius: 4 }} />
              <div style={{ height: 14, width: '35%', background: 'var(--color-border)', borderRadius: 4 }} />
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

export async function ShopRelatedProductsRsc(props: ShopRelatedProductsProps) {
  await connection()
  if (!props.productSlug) return null
  const product = await getProductBySlug(props.productSlug)
  if (!product) return null
  const related = await resolveRelatedProducts(product)
  if (related.length === 0) return null
  const [config, bp, withMedia] = await Promise.all([
    getShopConfigCached(),
    getShopBreakpoints(),
    Promise.all(related.map(async (p) => ({ p, media: await getProductMedia(p.id) }))),
  ])

  return (
    <section>
      <style dangerouslySetInnerHTML={{ __html: productCardCss(bp) }} />
      <div className="spc-head">
        <h2>{props.heading || 'Completes the setup'}</h2>
        {props.subheading && <span>{props.subheading}</span>}
      </div>
      <div className="spc-grid">
        {withMedia.map(({ p, media }) => {
          const primary = media.find((m) => m.isPrimary) ?? media[0]
          return (
            <a key={p.id} href={`/shop/products/${p.slug}`} className="spc-card">
              <div className="spc-img">
                {primary && primary.type !== 'VIDEO_URL' && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={primary.url} alt={primary.altText ?? p.name} />
                )}
              </div>
              <div className="spc-body">
                <h3 className="spc-name">{p.name}</h3>
                <div className="spc-pricerow">
                  <span className="spc-price">
                    {config.currencySymbol}
                    {p.price}
                  </span>
                  {p.compareAtPrice && (
                    <span className="spc-compare">
                      {config.currencySymbol}
                      {p.compareAtPrice}
                    </span>
                  )}
                </div>
                <span className="spc-view">
                  View
                  <ViewArrow />
                </span>
              </div>
            </a>
          )
        })}
      </div>
    </section>
  )
}

export const shopRelatedProductsPuckComponent = {
  label: 'Shop: Related Products',
  fields: {
    heading: { type: 'text' as const, label: 'Heading' },
    subheading: { type: 'text' as const, label: 'Subheading (optional)' },
    layout: { type: 'select' as const, label: 'Layout', options: [{ value: 'Grid', label: 'Grid' }] },
  },
  defaultProps: { heading: 'Completes the setup', subheading: 'Frequently bought together', layout: 'Grid' },
  render: ShopRelatedProducts,
}

export const shopRelatedProductsPuckRscComponent = { ...shopRelatedProductsPuckComponent, render: ShopRelatedProductsRsc }
