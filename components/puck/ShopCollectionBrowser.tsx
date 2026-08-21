import { shopCategoryPillsCss } from '@/modules/shop/components/public/ShopCategoryPills.shared'
import { DEFAULT_BREAKPOINTS } from '@/modules/shop/lib/breakpoints-shared'
import { collectionIndexSourceProp } from '@/modules/shop/lib/collection-index-sources-shared'

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
  // One `include_<source id>` key per module that has registered a
  // `shop.collection-index-sources` provider, added to the sidebar by
  // resolveFields below and read back by the RSC half. Loose on purpose: the
  // keys are not known until an install says which modules it has.
  [key: string]: string | number | undefined
}

// Which extra sources this install has, asked once per editing session. Same
// shape as the search blocks' probe: a failure leaves the sidebar exactly as it
// was rather than throwing inside a field resolver.
type SourceProbe = Array<{ id: string; label: string }>
let _sourceCache: { data: SourceProbe; expires: number } | null = null

async function fetchSources(): Promise<SourceProbe> {
  const now = Date.now()
  if (_sourceCache && now < _sourceCache.expires) return _sourceCache.data
  try {
    const res = await fetch('/api/m/shop/public/collection-index-sources')
    if (!res.ok) return _sourceCache?.data ?? []
    const data = (await res.json()) as { sources?: SourceProbe }
    _sourceCache = { data: data.sources ?? [], expires: now + 60_000 }
    return _sourceCache.data
  } catch {
    return _sourceCache?.data ?? []
  }
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
  // The editor's canvas render. Every other block wires this and this one never
  // did, which made the block unopenable rather than merely unpainted: Puck calls
  // `config.components[type].render(props)` unconditionally, so an absent render
  // threw "e is not a function" and took the whole page builder down with it - any
  // page carrying a Collection Browser could not be edited at all. The storefront
  // was fine throughout, the RSC half below having always had its own render,
  // which is why nothing looked wrong from the outside.
  render: ShopCollectionBrowser,
  // The sidebar grows one Yes/No per companion module that has pages of its own
  // worth listing here - today that is the filters module's filter collections.
  // An install with no such module gets the field list exactly as written above,
  // which is the whole point of asking rather than hard-coding the option.
  async resolveFields(_data: { props: ShopCollectionBrowserProps }, { fields }: { fields: Record<string, unknown> }) {
    const next = { ...fields }
    for (const source of await fetchSources()) {
      next[collectionIndexSourceProp(source.id)] = {
        type: 'select' as const,
        label: `Include ${source.label}`,
        options: [{ value: 'no', label: 'No' }, { value: 'yes', label: 'Yes' }],
      }
    }
    return next
  },
}
