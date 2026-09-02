// [ANCHOR] - supplierSlug is injected by the supplier page (lib/inject-supplier-context.ts)
//
// EDITOR half only: placeholder + Puck field config. The server render lives in
// ShopSupplierHeader.rsc.tsx (wired by `rscImport` in the manifest) so
// next/server + db imports never land in the client editor bundle. Same shape as
// the Tag Header beside it - one layout stands in for every supplier, so there is
// no per-instance slug field to fill in.
export type ShopSupplierHeaderProps = { supplierSlug?: string; showBreadcrumbs?: string; showDescription?: string }

export function ShopSupplierHeader() {
  return (
    <div style={{ opacity: 0.6 }}>
      <div style={{ height: 14, width: '20%', background: 'var(--color-border)', borderRadius: 4, marginBottom: '0.75rem' }} />
      <div style={{ height: 32, width: '35%', background: 'var(--color-border)', borderRadius: 4, marginBottom: '0.5rem' }} />
      <div style={{ height: 18, width: '55%', background: 'var(--color-border)', borderRadius: 4 }} />
    </div>
  )
}

export const shopSupplierHeaderPuckComponent = {
  label: 'Shop: Supplier Header [Anchor]',
  fields: {
    showBreadcrumbs: { type: 'select' as const, label: 'Show breadcrumb trail', options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }] },
    showDescription: { type: 'select' as const, label: 'Show the one-line description', options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }] },
  },
  defaultProps: { showBreadcrumbs: 'yes', showDescription: 'yes' },
  permissions: { delete: false, duplicate: false },
  render: ShopSupplierHeader,
}
