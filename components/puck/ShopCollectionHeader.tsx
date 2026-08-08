// [ANCHOR] - collectionSlug is injected by the collection page (lib/inject-collection-context.ts)
//
// EDITOR half only: placeholder + Puck field config. The server render lives in
// ShopCollectionHeader.rsc.tsx (wired by `rscImport` in the manifest) so
// next/server + db imports never land in the client editor bundle.
// Absent props = the historical look, so pre-settings layouts are unchanged.
export type ShopCollectionHeaderProps = { collectionSlug?: string; showBreadcrumbs?: string; showDescription?: string }

export function ShopCollectionHeader() {
  return (
    <div style={{ opacity: 0.6 }}>
      <div style={{ height: 14, width: '20%', background: 'var(--color-border)', borderRadius: 4, marginBottom: '0.75rem' }} />
      <div style={{ height: 32, width: '40%', background: 'var(--color-border)', borderRadius: 4, marginBottom: '0.5rem' }} />
      <div style={{ height: 18, width: '60%', background: 'var(--color-border)', borderRadius: 4 }} />
    </div>
  )
}

export const shopCollectionHeaderPuckComponent = {
  label: 'Shop: Collection Header [Anchor]',
  fields: {
    showBreadcrumbs: { type: 'select' as const, label: 'Show breadcrumb trail', options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }] },
    showDescription: { type: 'select' as const, label: 'Show the collection description', options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }] },
  },
  defaultProps: { showBreadcrumbs: 'yes', showDescription: 'yes' },
  permissions: { delete: false, duplicate: false },
  render: ShopCollectionHeader,
}
