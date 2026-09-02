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
  /** Everything from one supplier. Filled in for you on a supplier's own page
   *  (lib/inject-supplier-context.ts); typed by hand anywhere else. */
  supplierSlug?: string
  limit?: number
  columns?: number
  showFilters?: string
  sort?: string
  heading?: string
  subheading?: string
  emptyText?: string
  layoutRef?: LayoutRef | null
  // Paging. 'none' is what the grid did before this existed and stays the
  // default, so a layout saved earlier renders the same cards in the same order
  // with nothing added underneath them.
  //
  // Switched on, `limit` stops meaning "the most this grid will ever show" and
  // starts meaning "how many are on screen at once", with `total` fetched up to
  // maxPerPage. That re-reading only happens when the owner asks for it.
  paginate?: string
  pageSize?: number
  moreLabel?: string
  countTemplate?: string
  // Where the pages after the first come from. Blank or 'upfront' is what paging
  // has always done - every card rendered into the page, shown and hidden in the
  // browser. 'ondemand' renders the first page only and fetches the rest from
  // the server as the shopper reaches them. Only read when `paginate` is on.
  pageLoad?: string
  // Which page of the shelf to render. NOT a Puck field - it is per-request
  // context written into the block's props by the page route, the same way
  // categorySlug is, because a block cannot read the address it is served at.
  // 1 unless `?page=` says otherwise. See lib/page-href.ts for why the link a
  // crawler follows and the scroll a shopper does are the same control.
  page?: number
  // What to do with the products whose owner has ticked "keep this off the
  // featured shelves" on the product itself. Blank - which is every grid saved
  // before this existed - means leave them out, because that is the whole point
  // of the tick and nobody has ticked one on the day this ships. 'include' is
  // the escape hatch for a grid being used as a plain catalogue listing rather
  // than a showcase row.
  hiddenProducts?: string
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
    supplierSlug: { type: 'text' as const, label: 'Supplier slug (optional)' },
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
    // Kept because saved layouts carry it - removing a prop name blanks every
    // page using it - but relabelled to stop it promising something this block
    // has never done. Nothing in the RSC half has ever read it: filtering is the
    // Shop: Filters & Product Grid block's job, in filters-for-shop. The label
    // is not the prop, so renaming it moves no saved data.
    showFilters: { type: 'select' as const, label: 'Show filters (not used - swap in the Filters & Product Grid block instead)', options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }] },
    // Off by default. On, "Number of products" above becomes the page size and
    // the grid reaches for the whole list behind it - see ShopProductGrid.rsc.
    paginate: { type: 'select' as const, label: 'When there are more products than fit', options: [
      { value: 'none', label: 'Show only the first page (no paging)' },
      { value: 'scroll', label: 'Load more as the shopper scrolls' },
      { value: 'more', label: 'A "Show more" button' },
      { value: 'pages', label: 'Numbered pages' },
    ] },
    pageSize: { type: 'number' as const, label: 'Products per page (blank uses the number above)', min: 1, max: 100 },
    // The default is deliberately the old behaviour: a layout saved before this
    // existed keeps rendering every card into the page, because that is what its
    // owner has been looking at and nothing about it has stopped working.
    pageLoad: { type: 'select' as const, label: 'Where the later pages come from', options: [
      { value: 'ondemand', label: 'Fetched as the shopper reaches them - much lighter page' },
      { value: 'upfront', label: 'Sent with the page - instant to flick through, heavier to load' },
    ] },
    moreLabel: { type: 'text' as const, label: '"Show more" button label' },
    countTemplate: { type: 'text' as const, label: 'Count wording ({shown} and {total}, blank for none)' },
    hiddenProducts: { type: 'select' as const, label: 'Products kept off the featured shelves', options: [
      { value: 'exclude', label: 'Leave them out' },
      { value: 'include', label: 'Show them here anyway' },
    ] },
    emptyText: { type: 'text' as const, label: 'Wording when there are no products' },
    layoutRef: layoutField,
  },
  // `pageLoad: 'ondemand'` is deliberate: a NEW grid switched to paging fetches
  // its later pages rather than building them all in, so it is light without
  // anybody having to find the setting. `limit: 12` is the opening screenful for
  // the same reason. Neither touches a layout already saved - defaults apply to
  // a block being added, not to one already on a page.
  defaultProps: { heading: '', subheading: '', categorySlug: '', collectionSlug: '', tagSlug: '', supplierSlug: '', limit: 12, columns: 3, sort: 'newest', showFilters: 'no', paginate: 'none', pageSize: undefined, pageLoad: 'ondemand', moreLabel: 'Show more', countTemplate: 'Showing {shown} of {total}', hiddenProducts: 'exclude', emptyText: 'No products to show yet.', layoutRef: null },
  render: ShopProductGrid,
}
