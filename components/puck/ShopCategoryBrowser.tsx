// EDITOR half only: placeholder + Puck field config. The server render lives in
// ShopCategoryBrowser.rsc.tsx (wired by `rscImport` in the manifest) so
// next/server + db imports never land in the client editor bundle.
//
// On a Category layout `parentCategorySlug` is injected with the category being
// viewed (lib/inject-category-context.ts), so the block lists that category's
// sub-categories without the owner naming one - one layout serves every category
// page. On the Shop Home layout it is a real, editable field.
export type ShopCategoryBrowserProps = { parentCategorySlug?: string; columns?: number; ctaLabel?: string }

export function ShopCategoryBrowser(props: ShopCategoryBrowserProps) {
  const columns = props.columns ?? 4
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

export const shopCategoryBrowserPuckComponent = {
  label: 'Shop: Category Browser',
  fields: {
    parentCategorySlug: { type: 'text' as const, label: 'Parent category slug (ignored on a category page)' },
    columns: { type: 'number' as const, label: 'Columns' },
    ctaLabel: { type: 'text' as const, label: 'Link wording' },
  },
  defaultProps: { parentCategorySlug: '', columns: 4, ctaLabel: 'Browse' },
  render: ShopCategoryBrowser,
}
