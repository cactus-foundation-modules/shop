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
  sort?: string
  heading?: string
  subheading?: string
  emptyText?: string
  layoutRef?: LayoutRef | null
}

// Section heading above the grid - shared by both halves so the editor canvas
// and the storefront print the same markup. Nothing at all when no heading is
// set, which is the default and the pre-setting behaviour.
export function GridSectionHead({ heading, subheading }: { heading?: string; subheading?: string }) {
  if (!heading) return null
  return (
    <div className="shop-sec-head">
      <h2>{heading}</h2>
      {subheading && <span>{subheading}</span>}
    </div>
  )
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
// The heading is real text, so it renders here too - through the same classes
// the storefront uses, with the section-head rules inlined because the editor
// half never emits the full card stylesheet.
export function ShopProductGrid(props: ShopProductGridProps) {
  return (
    <>
      {props.heading && (
        <style dangerouslySetInnerHTML={{ __html: '.shop-sec-head{display:flex;align-items:baseline;gap:16px;margin:8px 0 20px;flex-wrap:wrap}.shop-sec-head h2{font-family:var(--display-family,Georgia,serif);font-weight:600;font-size:26px;margin:0;color:var(--color-fg);line-height:1.2}.shop-sec-head span{font-size:13px;color:var(--color-text-muted)}' }} />
      )}
      <GridSectionHead heading={props.heading} subheading={props.subheading} />
      <GridSkeleton columns={props.columns ?? 3} />
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
    heading: { type: 'text' as const, label: 'Heading above the grid (blank for none)' },
    subheading: { type: 'text' as const, label: 'Line beside the heading (blank for none)' },
    categorySlug: { type: 'text' as const, label: 'Category slug (optional)' },
    collectionSlug: { type: 'text' as const, label: 'Collection slug (optional)' },
    tagSlug: { type: 'text' as const, label: 'Tag slug (optional)' },
    limit: { type: 'number' as const, label: 'Number of products' },
    columns: { type: 'number' as const, label: 'Columns' },
    // Order the shelf is stacked in. 'Newest first' is what the grid always did.
    sort: { type: 'select' as const, label: 'Order products by', options: [
      { value: 'newest', label: 'Newest first' },
      { value: 'popular', label: 'Best sellers first' },
      { value: 'price-asc', label: 'Price - low to high' },
      { value: 'price-desc', label: 'Price - high to low' },
      { value: 'name-asc', label: 'Name - A to Z' },
      { value: 'name-desc', label: 'Name - Z to A' },
    ] },
    showFilters: { type: 'select' as const, label: 'Show filters', options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }] },
    emptyText: { type: 'text' as const, label: 'Wording when there are no products' },
    layoutRef: layoutField,
  },
  defaultProps: { heading: '', subheading: '', categorySlug: '', collectionSlug: '', tagSlug: '', limit: 12, columns: 3, sort: 'newest', showFilters: 'no', emptyText: 'No products to show yet.', layoutRef: null },
  render: ShopProductGrid,
}
