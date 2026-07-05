import { connection } from 'next/server'
import { listProducts, getProductMedia, getProductTagIds } from '@/modules/shop/lib/db'
import { listTags } from '@/modules/shop/lib/db/catalogue'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import { getShopBreakpoints } from '@/modules/shop/lib/breakpoints'
import type { LayoutRef } from '@/lib/puck/LayoutPickerField'
import { ShopLayoutPicker } from '@/modules/shop/components/public/ShopLayoutPicker'
import { resolveCardTemplate, buildCardContext, renderCards, MinimalCard, type CardItem } from '@/modules/shop/lib/card-template'
import { shopCardCss } from '@/modules/shop/components/puck/parts/card-parts'

// Grid-level props (data source + layout) stay here; the card-internal design
// now comes entirely from the Product Card layout, stamped once per product.
export type ShopProductGridProps = {
  categorySlug?: string
  collectionSlug?: string
  tagSlug?: string
  limit?: number
  columns?: number
  showFilters?: string
  layoutRef?: LayoutRef | null
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

// RSC: real products, per-request via connection() (stock/pricing must never be stale-cached).
export async function ShopProductGridRsc(props: ShopProductGridProps) {
  await connection()
  const columns = props.columns ?? 3
  const [config, bp, tags, listed, template] = await Promise.all([
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
    resolveCardTemplate(props.layoutRef),
  ])
  const { products } = listed
  const tagById = new Map(tags.map((t) => [t.id, t.slug]))

  if (products.length === 0) {
    return <p style={{ color: 'var(--color-text-muted)' }}>No products to show yet.</p>
  }

  // Load each product's media + tags once, up front - the injected context
  // carries them into the card so no part re-queries.
  const items: CardItem[] = await Promise.all(
    products.map(async (product) => {
      const [media, tagIds] = await Promise.all([getProductMedia(product.id), getProductTagIds(product.id)])
      return { product, ctx: buildCardContext(product, media, tagById, tagIds, config.currencySymbol) }
    }),
  )

  const cards = template ? await renderCards(template, items) : items.map((item) => <MinimalCard key={item.product.id} {...item} />)

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: shopCardCss(bp) }} />
      <div className="shop-grid" style={{ ['--shop-cols' as string]: String(columns) } as React.CSSProperties}>
        {cards}
      </div>
    </>
  )
}

const layoutField = {
  type: 'custom' as const,
  label: 'Card layout',
  render: ({ value, onChange }: any) => <ShopLayoutPicker type="shopProductCard" value={value} onChange={onChange} />,
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
    layoutRef: layoutField,
  },
  defaultProps: { categorySlug: '', collectionSlug: '', tagSlug: '', limit: 12, columns: 3, showFilters: 'no', layoutRef: null },
  render: ShopProductGrid,
}

export const shopProductGridPuckRscComponent = {
  ...shopProductGridPuckComponent,
  render: ShopProductGridRsc,
}
