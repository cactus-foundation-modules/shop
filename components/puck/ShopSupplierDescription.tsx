// [ANCHOR] - supplierSlug is injected by the supplier page
//
// EDITOR half only: placeholder + Puck field config. The server render lives in
// ShopSupplierDescription.rsc.tsx (wired by `rscImport` in the manifest) so
// next/server + db imports never land in the client editor bundle. Twin of the
// Collection Description block beside it.
export type ShopSupplierDescriptionProps = { supplierSlug?: string }

export function ShopSupplierDescription() {
  return (
    <div style={{ opacity: 0.6, display: 'grid', gap: '0.5rem', maxWidth: '60ch' }}>
      <div style={{ height: 14, width: '100%', background: 'var(--color-border)', borderRadius: 4 }} />
      <div style={{ height: 14, width: '92%', background: 'var(--color-border)', borderRadius: 4 }} />
      <div style={{ height: 14, width: '74%', background: 'var(--color-border)', borderRadius: 4 }} />
    </div>
  )
}

export const shopSupplierDescriptionPuckComponent = {
  label: 'Shop: Supplier Description [Anchor]',
  fields: {},
  defaultProps: {},
  render: ShopSupplierDescription,
}
