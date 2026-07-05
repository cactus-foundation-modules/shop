// EDITOR half only: placeholder + Puck field config. The server render lives in
// ShopFeaturedCollection.rsc.tsx (wired by `rscImport` in the manifest) so its
// lib/card-template dependency - which dynamically pulls the next/headers-tainted
// RSC Puck config - never lands in the client editor bundle.
export type ShopFeaturedCollectionProps = { collectionSlug?: string; layout?: string; limit?: number }

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
    layout: { type: 'select' as const, label: 'Layout', options: [{ value: 'Grid', label: 'Grid' }, { value: 'Carousel', label: 'Carousel' }] },
    limit: { type: 'number' as const, label: 'Number of products' },
  },
  defaultProps: { collectionSlug: '', layout: 'Grid', limit: 4 },
  render: ShopFeaturedCollection,
}
