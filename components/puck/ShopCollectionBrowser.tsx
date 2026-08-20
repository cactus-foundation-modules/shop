import { shopCategoryPillsCss } from '@/modules/shop/components/public/ShopCategoryPills.shared'
import { DEFAULT_BREAKPOINTS } from '@/modules/shop/lib/breakpoints-shared'

// EDITOR half only: placeholder + Puck field config. The server render lives in
// ShopCollectionBrowser.rsc.tsx (wired by `rscImport` in the manifest) so
// next/server + db imports never land in the client editor bundle.
//
// Unlike the Category Browser this takes no "which one" field: the point of an
// index is that it lists every collection with products in it, and keeps doing
// so when a new collection is added. Nothing to maintain by hand.
//
// The pill strip borrows the category pills' stylesheet and classes rather than
// growing a second one - a shopper meets both on the same site, and restyling
// one chip should restyle the other.

export type ShopCollectionBrowserProps = {
  display?: string
  columns?: number
  ctaLabel?: string
  showBlurb?: string
  showCount?: string
  limit?: number
}

export function ShopCollectionBrowser(props: ShopCollectionBrowserProps) {
  const columns = props.columns ?? 4
  if (props.display === 'pills') {
    // Sampled through the real classes and stylesheet, so the canvas shows the
    // chrome the live page will print - only the names are stand-ins, since the
    // editor half cannot fetch.
    return (
      <>
        <style dangerouslySetInnerHTML={{ __html: shopCategoryPillsCss(DEFAULT_BREAKPOINTS) }} />
        <nav className="shop-cat-pills" aria-label="Collections" style={{ opacity: 0.6, pointerEvents: 'none' }}>
          {['A collection', 'Another one', 'A third', 'One more'].map((name) => (
            <a key={name} className="shop-cat-pill" href="#">{name}</a>
          ))}
        </nav>
      </>
    )
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: '1rem', opacity: 0.6 }}>
      {Array.from({ length: columns }).map((_, i) => (
        <div key={i} style={{ border: '1px solid var(--color-border)', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ aspectRatio: '1/1', background: 'var(--color-border)' }} />
          <div style={{ padding: '0.875rem 1rem 1rem', display: 'grid', gap: '0.5rem' }}>
            <div style={{ height: 12, width: '65%', background: 'var(--color-border)', borderRadius: 4 }} />
            <div style={{ height: 9, width: '90%', background: 'var(--color-border)', borderRadius: 4 }} />
          </div>
        </div>
      ))}
    </div>
  )
}

export const shopCollectionBrowserPuckComponent = {
  label: 'Shop: Collection Browser',
  fields: {
    display: {
      type: 'select' as const,
      label: 'Show as',
      options: [
        { value: 'cards', label: 'Cards' },
        { value: 'pills', label: 'Pills' },
      ],
    },
    columns: { type: 'number' as const, label: 'Columns (cards only)' },
    ctaLabel: { type: 'text' as const, label: 'Link wording (cards only)' },
    showBlurb: { type: 'select' as const, label: 'Show collection descriptions (cards only)', options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }] },
    showCount: { type: 'select' as const, label: 'Show how many products (cards only)', options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }] },
    limit: { type: 'number' as const, label: 'Most it will show (blank for all)' },
  },
  defaultProps: { display: 'cards', columns: 4, ctaLabel: 'Browse', showBlurb: 'yes', showCount: 'yes' },
}
