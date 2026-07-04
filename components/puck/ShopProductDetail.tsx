import { connection } from 'next/server'
import { getProductBySlug, getProductMedia, getProductTagIds, getDigitalFileById } from '@/modules/shop/lib/db'
import { listTags } from '@/modules/shop/lib/db/catalogue'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import { DEFAULT_BREAKPOINTS, getShopBreakpoints, type Breakpoints } from '@/modules/shop/lib/breakpoints'
import { AddToCartButton } from '@/modules/shop/components/public/AddToCartButton'
import { ProductGallery, ProductTabs, type ProductTab } from '@/modules/shop/components/public/ProductDetailIslands'
import type { ShpProduct } from '@/modules/shop/lib/types'

// [ANCHOR] - add-to-cart button is a non-removable core field. productSlug is
// injected by the product detail page (lib/inject-product-context.ts) since
// this block has no product slug of its own (spec 12). The reassurance lines
// are editable so a site owner can set the trust signals shown under the buy
// button - they apply to every product (shared template), so keep them generic.
export type ShopProductDetailProps = {
  productSlug?: string
  reassure1?: string
  reassure2?: string
  reassure3?: string
}

// Two-column PDP: sticky image stage + buy column, then a tabbed detail area.
// Scoped CSS lives here inside the module (no core globals.css edit), class
// prefix `spd-` (shop product detail). Colours are tokens only. The PDP stacks
// to one column at the site's tablet breakpoint (Styles setting).
function spdCss({ tabletBp }: Breakpoints): string {
  return `
.spd-pdp{display:grid;grid-template-columns:1.05fr .95fr;gap:48px;align-items:start;padding:8px 0}
.spd-stage-col{position:sticky;top:96px}
.spd-stage{position:relative;border:1px solid var(--color-border);border-radius:16px;background:var(--color-bg-subtle);overflow:hidden;aspect-ratio:1/1;display:flex;align-items:center;justify-content:center}
.spd-stage-img{width:100%;height:100%;object-fit:cover;display:block}
.spd-thumbs{display:flex;gap:10px;margin-top:12px;flex-wrap:wrap}
.spd-thumb{width:64px;height:64px;border:1px solid var(--color-border);border-radius:8px;overflow:hidden;background:var(--color-bg-subtle);cursor:pointer;padding:0;transition:border-color .12s ease,box-shadow .12s ease}
.spd-thumb img{width:100%;height:100%;object-fit:cover;display:block}
.spd-thumb.on{border-color:var(--color-primary);box-shadow:0 0 0 1px var(--color-primary)}
.spd-thumb:hover{border-color:var(--color-primary)}
.spd-badges{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px}
.spd-badge{display:inline-block;font-size:12px;font-weight:600;padding:4px 9px;border-radius:6px;line-height:1.35}
.spd-badge-new{background:var(--color-primary);color:var(--color-on-primary)}
.spd-badge-trade{background:var(--color-fg);color:var(--color-bg)}
.spd-badge-stock{background:var(--color-success-subtle);color:var(--color-success)}
.spd-badge-low{background:var(--color-warning-subtle);color:var(--color-warning);border:1px solid var(--color-warning-border)}
.spd-badge-out{background:var(--color-surface);color:var(--color-text-muted);border:1px solid var(--color-border)}
.spd-title{font-family:var(--display-family,Georgia,serif);font-weight:600;font-size:34px;line-height:1.2;margin:6px 0;color:var(--color-fg)}
.spd-sku{font-size:13px;color:var(--color-text-muted)}
.spd-blurb{margin-top:14px;color:var(--color-text-muted);max-width:52ch}
.spd-price-block{margin:18px 0 4px;display:flex;align-items:baseline;gap:12px;flex-wrap:wrap}
.spd-price-now{font-family:var(--display-family,Georgia,serif);font-weight:600;font-size:34px;color:var(--color-primary)}
.spd-price-was{font-size:15px;color:var(--color-text-muted);text-decoration:line-through}
.spd-save{background:var(--color-success-subtle);color:var(--color-success);font-size:12px;font-weight:600;border-radius:9999px;padding:4px 11px}
.spd-preorder{margin-top:14px;background:var(--color-bg-subtle);border:1px solid var(--color-border);border-radius:8px;padding:10px 12px;font-size:14px;color:var(--color-fg)}
.spd-oos{margin-top:16px;color:var(--color-text-muted);font-weight:600}
.spd-buy-row{display:flex;gap:14px;align-items:center;margin-top:22px;flex-wrap:wrap}
.spd-stepper{display:inline-flex;align-items:center;border:1px solid var(--color-border);border-radius:9999px;height:52px;overflow:hidden;background:var(--color-surface)}
.spd-stepper button{width:46px;height:52px;border:none;background:transparent;color:var(--color-primary);font-size:20px;font-weight:600;cursor:pointer;transition:background .12s ease}
/* !important beats the site theme's own !important button:hover fill so the stepper stays a subtle teal control */
.spd-stepper button:hover:not(:disabled){background:var(--color-bg-subtle) !important;color:var(--color-primary) !important}
.spd-stepper button:disabled{color:var(--color-border);cursor:not-allowed}
.spd-stepper input{width:52px;border:none;text-align:center;font:inherit;font-weight:600;font-size:16px;background:transparent;color:var(--color-fg)}
.spd-stepper input:focus{outline:none}
/* Add-to-basket intentionally inherits the site's primary (mustard) button fill - matches the concept's CTA - so no background here */
.spd-add{flex:1;min-width:200px;height:52px;border:none;border-radius:9999px;font:inherit;font-weight:600;font-size:16px;cursor:pointer;transition:transform .06s ease}
.spd-add:active{transform:scale(.99)}
.spd-reassure{margin-top:18px;display:flex;gap:20px;flex-wrap:wrap;font-size:13px;color:var(--color-text-muted)}
.spd-reassure span{display:inline-flex;gap:7px;align-items:center}
.spd-reassure svg{color:var(--color-primary);flex:none}
.spd-tabs{border-top:1px solid var(--color-border);margin-top:40px}
.spd-tab-nav{display:flex;gap:6px;overflow-x:auto;padding:16px 0}
.spd-tab-btn{border:1px solid var(--color-border);background:var(--color-surface);border-radius:9999px;padding:9px 18px;font:inherit;font-size:14px;font-weight:600;color:var(--color-text-muted);cursor:pointer;white-space:nowrap;transition:background .12s ease,color .12s ease,border-color .12s ease}
/* !important on hover/active so the site theme's !important button fill can't turn tabs mustard */
.spd-tab-btn:hover{background:var(--color-surface) !important;border-color:var(--color-primary);color:var(--color-primary) !important}
.spd-tab-btn.on{background:var(--color-primary) !important;border-color:var(--color-primary);color:var(--color-on-primary) !important}
.spd-panel{padding:20px 0 8px;max-width:900px}
.spd-panel h3{font-family:var(--display-family,Georgia,serif);font-weight:600;font-size:24px;margin:0 0 14px;color:var(--color-fg)}
.spd-panel p{color:var(--color-text-muted);max-width:70ch;margin:0 0 14px;white-space:pre-wrap}
.spd-facts{width:100%;border-collapse:collapse;font-size:14px}
.spd-facts td{padding:11px 14px;border-bottom:1px solid var(--color-border);vertical-align:top}
.spd-facts td:first-child{color:var(--color-text-muted);width:38%}
.spd-facts td:last-child{color:var(--color-fg)}
.spd-dl{display:flex;align-items:center;gap:16px;border:1px solid var(--color-border);border-radius:10px;padding:16px 18px;color:var(--color-fg)}
.spd-dl .fico{width:42px;height:42px;border-radius:6px;background:var(--color-bg-subtle);color:var(--color-primary);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:600;flex:none}
.spd-dl b{font-size:15px;display:block}
.spd-dl small{font-size:12px;color:var(--color-text-muted)}
.spd-dl .get{margin-left:auto;color:var(--color-text-muted);font-weight:600;font-size:13px;white-space:nowrap}
@media (max-width:${tabletBp}){.spd-pdp{grid-template-columns:1fr;gap:28px}.spd-stage-col{position:static}}
`
}

const TYPE_LABEL: Record<ShpProduct['type'], string> = {
  PHYSICAL: 'Physical product',
  DIGITAL: 'Digital download',
  SERVICE: 'Service',
}

function ReassureCheck() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function FactsTable({ rows }: { rows: Array<[string, string]> }) {
  return (
    <table className="spd-facts">
      <tbody>
        {rows.map(([label, value]) => (
          <tr key={label}>
            <td>{label}</td>
            <td>{value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// Editor canvas: static skeleton echoing the two-column stage/buy layout and
// the tab strip, so the canvas isn't misleading (Gazette pattern - real data
// only in the RSC render below).
export function ShopProductDetail(_props: ShopProductDetailProps) {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: spdCss(DEFAULT_BREAKPOINTS) }} />
      <div className="spd-pdp" style={{ opacity: 0.6 }}>
        <div className="spd-stage-col">
          <div className="spd-stage spd-stage-empty" />
          <div className="spd-thumbs">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="spd-thumb" />
            ))}
          </div>
        </div>
        <div>
          <div className="spd-badges">
            <span className="spd-badge spd-badge-new">New</span>
            <span className="spd-badge spd-badge-stock">In stock</span>
          </div>
          <div style={{ height: 30, width: '70%', background: 'var(--color-border)', borderRadius: 6, margin: '8px 0' }} />
          <div style={{ height: 13, width: '35%', background: 'var(--color-border)', borderRadius: 4 }} />
          <div className="spd-price-block">
            <div style={{ height: 30, width: 110, background: 'var(--color-border)', borderRadius: 6 }} />
          </div>
          <div className="spd-buy-row">
            <div className="spd-stepper" style={{ width: 148 }} />
            <div className="spd-add" style={{ maxWidth: 240 }} />
          </div>
        </div>
      </div>
      <div className="spd-tabs">
        <div className="spd-tab-nav">
          {['Description', 'Specification', 'Dimensions'].map((t, i) => (
            <span key={t} className={`spd-tab-btn${i === 0 ? ' on' : ''}`}>{t}</span>
          ))}
        </div>
      </div>
    </>
  )
}

export async function ShopProductDetailRsc(props: ShopProductDetailProps) {
  await connection()
  if (!props.productSlug) return null
  const product = await getProductBySlug(props.productSlug)
  if (!product) return null

  const [media, config, bp, tags, tagIds] = await Promise.all([
    getProductMedia(product.id),
    getShopConfigCached(),
    getShopBreakpoints(),
    listTags(),
    getProductTagIds(product.id),
  ])
  const tagById = new Map(tags.map((t) => [t.id, t.slug]))
  const tagSlugs = tagIds.map((id) => tagById.get(id)).filter((s): s is string => Boolean(s))

  const digitalFile =
    product.type === 'DIGITAL' && product.digitalFileId ? await getDigitalFileById(product.digitalFileId) : null

  const images = media
    .filter((m) => m.type !== 'VIDEO_URL')
    .map((m) => ({ url: m.url, alt: m.altText ?? product.name }))

  const outOfStock =
    product.trackInventory && (product.stockCount ?? 0) <= 0 && product.outOfStockBehaviour === 'BLOCK' && !product.isPreOrder
  const lowStock =
    !!product.trackInventory &&
    product.stockCount != null &&
    product.stockCount > 0 &&
    product.lowStockThreshold != null &&
    product.stockCount <= product.lowStockThreshold

  const priceNum = Number(product.price)
  const compareNum = product.compareAtPrice ? Number(product.compareAtPrice) : null
  const hasWas = compareNum != null && compareNum > priceNum
  const savePct = hasWas ? Math.round((1 - priceNum / (compareNum as number)) * 100) : null

  const reassure = [props.reassure1, props.reassure2, props.reassure3].filter(
    (s): s is string => Boolean(s && s.trim()),
  )

  // Facts shared by Specification / Dimensions - real fields only.
  const weightStr = product.weight ? `${product.weight}${product.weightUnit ? ` ${product.weightUnit}` : ''}` : null
  const dimUnit = product.dimensionUnit ? ` ${product.dimensionUnit}` : ''
  const dimsCombined =
    product.dimensionL && product.dimensionW && product.dimensionH
      ? `${product.dimensionL} × ${product.dimensionW} × ${product.dimensionH}${dimUnit}`
      : null

  const specRows: Array<[string, string]> = []
  if (product.sku) specRows.push(['SKU', product.sku])
  specRows.push(['Type', TYPE_LABEL[product.type]])
  if (weightStr) specRows.push(['Weight', weightStr])
  if (dimsCombined) specRows.push(['Dimensions (L × W × H)', dimsCombined])

  const dimRows: Array<[string, string]> = []
  if (weightStr) dimRows.push(['Weight', weightStr])
  if (product.dimensionL) dimRows.push(['Length', `${product.dimensionL}${dimUnit}`])
  if (product.dimensionW) dimRows.push(['Width', `${product.dimensionW}${dimUnit}`])
  if (product.dimensionH) dimRows.push(['Height', `${product.dimensionH}${dimUnit}`])

  const tabs: ProductTab[] = []
  if (product.description) {
    tabs.push({ id: 'desc', label: 'Description', content: <p>{product.description}</p> })
  }
  tabs.push({ id: 'spec', label: 'Specification', content: <FactsTable rows={specRows} /> })
  if (dimRows.length > 0) {
    tabs.push({ id: 'dims', label: 'Dimensions', content: <FactsTable rows={dimRows} /> })
  }
  if (digitalFile) {
    const ext = (digitalFile.filename.split('.').pop() ?? 'FILE').toUpperCase().slice(0, 4)
    const sizeMb = `${(digitalFile.size / 1048576).toFixed(1)}MB`
    tabs.push({
      id: 'downloads',
      label: 'Downloads',
      content: (
        <div className="spd-dl">
          <span className="fico">{ext}</span>
          <span>
            <b>{digitalFile.filename}</b>
            <small>{sizeMb}</small>
          </span>
          <span className="get">Available after purchase</span>
        </div>
      ),
    })
  }

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
        : outOfStock
          ? 'https://schema.org/OutOfStock'
          : 'https://schema.org/InStock',
    },
  }

  return (
    <div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <style dangerouslySetInnerHTML={{ __html: spdCss(bp) }} />
      <div className="spd-pdp">
        <ProductGallery images={images} productName={product.name} />
        <div>
          <div className="spd-badges">
            {tagSlugs.includes('new') && <span className="spd-badge spd-badge-new">New</span>}
            {tagSlugs.includes('trade') && <span className="spd-badge spd-badge-trade">Trade price</span>}
            {outOfStock ? (
              <span className="spd-badge spd-badge-out">Out of stock</span>
            ) : product.isPreOrder ? (
              <span className="spd-badge spd-badge-new">Pre-order</span>
            ) : lowStock ? (
              <span className="spd-badge spd-badge-low">Low stock</span>
            ) : (
              <span className="spd-badge spd-badge-stock">In stock</span>
            )}
          </div>

          <h1 className="spd-title">{product.name}</h1>
          {product.sku && <div className="spd-sku">SKU {product.sku}</div>}

          <div className="spd-price-block">
            <span className="spd-price-now">
              {config.currencySymbol}
              {product.price}
            </span>
            {hasWas && (
              <span className="spd-price-was">
                {config.currencySymbol}
                {product.compareAtPrice}
              </span>
            )}
            {savePct != null && savePct > 0 && <span className="spd-save">Save {savePct}%</span>}
          </div>

          {product.shortDescription && <p className="spd-blurb">{product.shortDescription}</p>}

          {product.isPreOrder && (
            <p className="spd-preorder">
              Pre-order
              {product.preOrderDispatchDate
                ? ` - expected dispatch ${new Date(product.preOrderDispatchDate).toLocaleDateString('en-GB')}`
                : ''}
              {product.preOrderNote ? `. ${product.preOrderNote}` : ''}
            </p>
          )}

          {outOfStock ? (
            <p className="spd-oos">Out of stock</p>
          ) : (
            <AddToCartButton productId={product.id} label={product.isPreOrder ? 'Pre-order now' : 'Add to basket'} />
          )}

          {reassure.length > 0 && (
            <div className="spd-reassure">
              {reassure.map((r, i) => (
                <span key={i}>
                  <ReassureCheck />
                  {r}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {tabs.length > 0 && <ProductTabs tabs={tabs} />}
    </div>
  )
}

export const shopProductDetailPuckComponent = {
  label: 'Shop: Product Detail [Anchor]',
  fields: {
    reassure1: { type: 'text' as const, label: 'Reassurance line 1 (optional)' },
    reassure2: { type: 'text' as const, label: 'Reassurance line 2 (optional)' },
    reassure3: { type: 'text' as const, label: 'Reassurance line 3 (optional)' },
  },
  defaultProps: { reassure1: '', reassure2: '', reassure3: '' },
  permissions: { delete: false, duplicate: false },
  render: ShopProductDetail,
}

export const shopProductDetailPuckRscComponent = { ...shopProductDetailPuckComponent, render: ShopProductDetailRsc }
