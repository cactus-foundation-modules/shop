// [ANCHOR] - categorySlug is injected by the category page (lib/inject-category-context.ts)
//
// EDITOR half only: placeholder + Puck field config. The server render lives in
// ShopCategoryHeader.rsc.tsx (wired by `rscImport` in the manifest) so
// next/server + db imports never land in the client editor bundle.
export type ShopCategoryHeaderProps = { categorySlug?: string }

export function ShopCategoryHeader() {
  return (
    <div style={{ opacity: 0.6 }}>
      <div style={{ height: 12, width: '18%', background: 'var(--color-border)', borderRadius: 4, marginBottom: '0.75rem' }} />
      <div style={{ height: 40, width: '55%', background: 'var(--color-border)', borderRadius: 4, marginBottom: '0.5rem' }} />
      <div style={{ height: 16, width: '60%', background: 'var(--color-border)', borderRadius: 4 }} />
    </div>
  )
}

export const shopCategoryHeaderPuckComponent = {
  label: 'Shop: Category Header [Anchor]',
  fields: {},
  defaultProps: {},
  permissions: { delete: false, duplicate: false },
  render: ShopCategoryHeader,
}
