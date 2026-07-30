// [ANCHOR] - categorySlug is injected by the category page (lib/inject-category-context.ts)
//
// EDITOR half only: placeholder + Puck field config. The server render lives in
// ShopCategoryDescription.rsc.tsx (wired by `rscImport` in the manifest) so
// next/server + db imports never land in the client editor bundle.
export type ShopCategoryDescriptionProps = { categorySlug?: string }

export function ShopCategoryDescription() {
  return (
    <div style={{ opacity: 0.6, display: 'grid', gap: '0.5rem', maxWidth: '60ch' }}>
      <div style={{ height: 14, width: '100%', background: 'var(--color-border)', borderRadius: 4 }} />
      <div style={{ height: 14, width: '92%', background: 'var(--color-border)', borderRadius: 4 }} />
      <div style={{ height: 14, width: '74%', background: 'var(--color-border)', borderRadius: 4 }} />
    </div>
  )
}

export const shopCategoryDescriptionPuckComponent = {
  label: 'Shop: Category Description [Anchor]',
  fields: {},
  defaultProps: {},
  render: ShopCategoryDescription,
}
