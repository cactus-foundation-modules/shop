import { connection } from 'next/server'
import { listProducts, getProductMedia, getProductTagIds } from '@/modules/shop/lib/db'
import { listTags } from '@/modules/shop/lib/db/catalogue'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import { getShopBreakpoints, type Breakpoints } from '@/modules/shop/lib/breakpoints'
import type { ShpProduct } from '@/modules/shop/lib/types'

export type ShopProductGridProps = {
  categorySlug?: string
  collectionSlug?: string
  tagSlug?: string
  limit?: number
  columns?: number
  showFilters?: string
}

// RANGE-style card grid. Scoped CSS (hover lift, image shimmer, badge
// variants, responsive collapse) lives here inside the module - no core
// globals.css edit. Class prefix `sr-` (shop range). Breakpoints come from the
// site's Styles setting (default 3 cols -> 2 at tablet -> 1 at mobile).
function rangeCss({ tabletBp, mobileBp }: Breakpoints): string {
  return `
.sr-grid{display:grid;grid-template-columns:repeat(var(--sr-cols,3),minmax(0,1fr));gap:24px;margin-top:8px}
.sr-card{position:relative;display:flex;flex-direction:column;background:var(--color-surface);border:1px solid var(--color-border);border-radius:12px;overflow:hidden;text-decoration:none;color:inherit;box-shadow:0 1px 3px rgba(0,0,0,.06);transition:box-shadow .25s ease,transform .25s ease}
.sr-card:hover{transform:translateY(-4px);box-shadow:0 8px 30px rgba(0,0,0,.10)}
.sr-img{position:relative;aspect-ratio:4/3;background:var(--color-bg-subtle);overflow:hidden}
.sr-img img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .4s ease}
.sr-card:hover .sr-img img{transform:scale(1.03)}
.sr-img::after{content:"";position:absolute;inset:0;transform:translateX(-120%);background:linear-gradient(100deg,transparent 30%,rgba(255,255,255,.35) 50%,transparent 70%);transition:transform .7s ease;pointer-events:none}
.sr-card:hover .sr-img::after{transform:translateX(120%)}
.sr-badge{position:absolute;top:10px;left:10px;z-index:1;font-size:12px;font-weight:600;line-height:1;padding:5px 9px;border-radius:6px}
.sr-badge-new{background:var(--color-primary);color:var(--color-on-primary)}
.sr-badge-low{background:var(--color-warning-subtle);color:var(--color-warning);border:1px solid var(--color-warning-border)}
.sr-badge-trade{background:var(--color-fg);color:var(--color-bg)}
.sr-badge-muted{background:var(--color-surface);color:var(--color-text-muted);border:1px solid var(--color-border)}
.sr-body{display:flex;flex-direction:column;gap:8px;padding:18px;flex:1}
.sr-name{margin:0;font-size:17px;font-weight:600;color:var(--color-fg);line-height:1.3}
.sr-pricerow{display:flex;gap:8px;align-items:baseline}
.sr-price{font-size:17px;font-weight:600;color:var(--color-primary)}
.sr-compare{font-size:13px;color:var(--color-text-muted);text-decoration:line-through}
.sr-unit{font-size:12px;color:var(--color-text-muted);line-height:1.4}
.sr-foot{margin-top:auto;padding-top:10px}
.sr-spec{display:inline-flex;align-items:center;gap:4px;font-size:13px;font-weight:600;color:var(--color-primary)}
.sr-card:hover .sr-spec svg{transform:translateX(3px)}
.sr-spec svg{transition:transform .2s ease}
@media (max-width:${tabletBp}){.sr-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:${mobileBp}){.sr-grid{grid-template-columns:1fr}}
`
}

function GridSkeleton({ columns }: { columns: number }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, minmax(0,1fr))`, gap: 24, opacity: 0.6 }}>
      {Array.from({ length: columns * 2 }).map((_, i) => (
        <div key={i} style={{ border: '1px solid var(--color-border)', borderRadius: 12, overflow: 'hidden', background: 'var(--color-surface)' }}>
          <div style={{ aspectRatio: '4/3', background: 'var(--color-bg-subtle)' }} />
          <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ height: 14, width: '70%', background: 'var(--color-border)', borderRadius: 4 }} />
            <div style={{ height: 14, width: '35%', background: 'var(--color-border)', borderRadius: 4 }} />
            <div style={{ height: 11, width: '80%', background: 'var(--color-border)', borderRadius: 4 }} />
          </div>
        </div>
      ))}
    </div>
  )
}

// Editor canvas: static skeleton, no fetch during render (Gazette pattern).
export function ShopProductGrid(props: ShopProductGridProps) {
  return <GridSkeleton columns={props.columns ?? 3} />
}

type Badge = { label: string; variant: 'new' | 'low' | 'trade' | 'muted' }

function badgeFor(product: ShpProduct, tagSlugs: string[], outOfStock: boolean): Badge | null {
  if (outOfStock) return { label: 'Out of stock', variant: 'muted' }
  if (product.isPreOrder) return { label: 'Pre-order', variant: 'new' }
  if (tagSlugs.includes('new')) return { label: 'New', variant: 'new' }
  const lowStock =
    product.trackInventory &&
    product.stockCount != null &&
    product.stockCount > 0 &&
    product.lowStockThreshold != null &&
    product.stockCount <= product.lowStockThreshold
  if (lowStock) return { label: 'Low stock', variant: 'low' }
  if (tagSlugs.includes('trade')) return { label: 'Trade price', variant: 'trade' }
  return null
}

async function ProductCard({
  product,
  currencySymbol,
  tagById,
}: {
  product: ShpProduct
  currencySymbol: string
  tagById: Map<string, string>
}) {
  const [media, tagIds] = await Promise.all([getProductMedia(product.id), getProductTagIds(product.id)])
  const primary = media.find((m) => m.isPrimary) ?? media[0]
  const tagSlugs = tagIds.map((id) => tagById.get(id)).filter((s): s is string => Boolean(s))
  const outOfStock =
    !!product.trackInventory &&
    (product.stockCount ?? 0) <= 0 &&
    product.outOfStockBehaviour === 'BLOCK' &&
    !product.isPreOrder
  const badge = badgeFor(product, tagSlugs, outOfStock)

  return (
    <a href={`/shop/products/${product.slug}`} className="sr-card">
      <div className="sr-img">
        {primary && primary.type !== 'VIDEO_URL' && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={primary.url} alt={primary.altText ?? product.name} />
        )}
        {badge && <span className={`sr-badge sr-badge-${badge.variant}`}>{badge.label}</span>}
      </div>
      <div className="sr-body">
        <h3 className="sr-name">{product.name}</h3>
        <div className="sr-pricerow">
          <span className="sr-price">{currencySymbol}{product.price}</span>
          {product.compareAtPrice && (
            <span className="sr-compare">{currencySymbol}{product.compareAtPrice}</span>
          )}
        </div>
        {product.shortDescription && <p className="sr-unit">{product.shortDescription}</p>}
        <div className="sr-foot">
          <span className="sr-spec">
            Full spec
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </div>
      </div>
    </a>
  )
}

// RSC: real products, per-request via connection() (stock/pricing must never be stale-cached).
export async function ShopProductGridRsc(props: ShopProductGridProps) {
  await connection()
  const columns = props.columns ?? 3
  const [config, bp, tags, listed] = await Promise.all([
    getShopConfigCached(),
    getShopBreakpoints(),
    listTags(),
    listProducts({
      status: 'ACTIVE',
      categorySlug: props.categorySlug || undefined,
      collectionSlug: props.collectionSlug || undefined,
      tagSlug: props.tagSlug || undefined,
      perPage: props.limit ?? 12,
    }),
  ])
  const { products } = listed
  const tagById = new Map(tags.map((t) => [t.id, t.slug]))

  if (products.length === 0) {
    return <p style={{ color: 'var(--color-text-muted)' }}>No products to show yet.</p>
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: rangeCss(bp) }} />
      <div className="sr-grid" style={{ ['--sr-cols' as string]: String(columns) } as React.CSSProperties}>
        {products.map((p) => (
          <ProductCard key={p.id} product={p} currencySymbol={config.currencySymbol} tagById={tagById} />
        ))}
      </div>
    </>
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
