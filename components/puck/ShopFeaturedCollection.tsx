// EDITOR half only: placeholder + Puck field config. The server render lives in
// ShopFeaturedCollection.rsc.tsx (wired by `rscImport` in the manifest) so its
// lib/card-template dependency - which dynamically pulls the next/headers-tainted
// RSC Puck config - never lands in the client editor bundle.
export type ShopFeaturedCollectionProps = {
  collectionSlug?: string
  layout?: string
  limit?: number
  heading?: string
  subheading?: string
  sort?: string
  showViewAll?: string
  viewAllLabel?: string
}

export function ShopFeaturedCollection(props: ShopFeaturedCollectionProps) {
  const limit = props.limit ?? 4
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(limit, 4)}, 1fr)`, gap: '1rem', opacity: 0.6 }}>
      {Array.from({ length: Math.min(limit, 4) }).map((_, i) => (
        <div key={i} style={{ aspectRatio: '4/3', background: 'var(--color-border)', borderRadius: 8 }} />
      ))}
    </div>
  )
}

export const shopFeaturedCollectionPuckComponent = {
  label: 'Shop: Featured Collection',
  fields: {
    collectionSlug: { type: 'text' as const, label: 'Collection slug' },
    heading: { type: 'text' as const, label: 'Heading (blank = the collection’s name)' },
    subheading: { type: 'text' as const, label: 'Line beside the heading (blank for none)' },
    layout: { type: 'select' as const, label: 'Layout', options: [{ value: 'Grid', label: 'Grid' }, { value: 'Carousel', label: 'Carousel' }] },
    limit: { type: 'number' as const, label: 'Number of products' },
    sort: { type: 'select' as const, label: 'Order products by', options: [
      { value: 'newest', label: 'Newest first' },
      { value: 'popular', label: 'Best sellers first' },
      { value: 'price-asc', label: 'Price - low to high' },
      { value: 'price-desc', label: 'Price - high to low' },
      { value: 'name-asc', label: 'Name - A to Z' },
    ] },
    showViewAll: { type: 'select' as const, label: 'Link to the full collection', options: [{ value: 'no', label: 'No' }, { value: 'yes', label: 'Yes' }] },
    viewAllLabel: { type: 'text' as const, label: 'Link wording' },
  },
  defaultProps: { collectionSlug: '', heading: '', subheading: '', layout: 'Grid', limit: 4, sort: 'newest', showViewAll: 'no', viewAllLabel: 'View all' },
  render: ShopFeaturedCollection,
}
