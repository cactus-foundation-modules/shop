// productSlug is injected by the product detail page (lib/inject-product-context.ts).
// The cards are stamped from the shared Product Card layout, same as the grid.
//
// EDITOR half only: placeholder + Puck field config. The server render lives in
// ShopRelatedProducts.rsc.tsx (wired by `rscImport` in the manifest) so its
// lib/card-template dependency - which dynamically pulls the next/headers-tainted
// RSC Puck config - never lands in the client editor bundle.
export type ShopRelatedProductsProps = { productSlug?: string; heading?: string; subheading?: string; layout?: string }

// Editor canvas: static card-grid skeleton (Gazette pattern).
export function ShopRelatedProducts(props: ShopRelatedProductsProps) {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: '.shop-sec-head{display:flex;align-items:baseline;gap:16px;margin:8px 0 20px;flex-wrap:wrap}.shop-sec-head h2{font-family:var(--display-family,Georgia,serif);font-weight:600;font-size:26px;margin:0;color:var(--color-fg)}' }} />
      <div className="shop-sec-head">
        <h2>{props.heading || 'Completes the setup'}</h2>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 20, opacity: 0.6 }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} style={{ border: '1px solid var(--color-border)', borderRadius: 12, overflow: 'hidden', background: 'var(--color-surface)' }}>
            <div style={{ aspectRatio: '4/3', background: 'var(--color-bg-subtle)' }} />
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ height: 14, width: '70%', background: 'var(--color-border)', borderRadius: 4 }} />
              <div style={{ height: 14, width: '35%', background: 'var(--color-border)', borderRadius: 4 }} />
            </div>
          </div>
        ))}
      </div>
    </>
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
