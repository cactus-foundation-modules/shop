// EDITOR half only: placeholder + Puck field config. The server render lives in
// ShopCategoryBrowser.rsc.tsx (wired by `rscImport` in the manifest) so
// next/server + db imports never land in the client editor bundle.
export type ShopCategoryBrowserProps = { parentCategorySlug?: string; columns?: number }

export function ShopCategoryBrowser(props: ShopCategoryBrowserProps) {
  const columns = props.columns ?? 4
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: '1rem', opacity: 0.6 }}>
      {Array.from({ length: columns }).map((_, i) => (
        <div key={i} style={{ aspectRatio: '1/1', background: 'var(--color-border)', borderRadius: 8 }} />
      ))}
    </div>
  )
}

export const shopCategoryBrowserPuckComponent = {
  label: 'Shop: Category Browser',
  fields: {
    parentCategorySlug: { type: 'text' as const, label: 'Parent category slug (optional)' },
    columns: { type: 'number' as const, label: 'Columns' },
  },
  defaultProps: { parentCategorySlug: '', columns: 4 },
  render: ShopCategoryBrowser,
}
