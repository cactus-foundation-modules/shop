import type { LayoutRef } from '@/lib/puck/LayoutPickerField'
import { ShopLayoutPicker } from '@/modules/shop/components/public/ShopLayoutPicker'

// Grid-level props (data source + layout) stay here; the card-internal design
// now comes entirely from the Product Card layout, stamped once per product.
//
// EDITOR half only: placeholder + Puck field config. The server render (db
// access and card rendering via lib/card-template, which dynamically pulls the
// next/headers-tainted RSC Puck config) lives in ShopProductGrid.rsc.tsx, wired
// by `rscImport` in the manifest so it never lands in the client editor bundle.
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
