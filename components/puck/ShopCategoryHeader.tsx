// [ANCHOR] - categorySlug is injected by the category page (lib/inject-category-context.ts)
//
// EDITOR half only: placeholder + Puck field config. The server render lives in
// ShopCategoryHeader.rsc.tsx (wired by `rscImport` in the manifest) so
// next/server + db imports never land in the client editor bundle.
//
// A layout saved before these settings existed passes nothing; the RSC half
// falls back to the historical look (breadcrumbs and the blurb both on), so
// nothing changes until a setting is changed. The one exception is the small
// line above the name, which used to default to "The range" and now defaults to
// blank - a category page is entitled to open with its own name.
export type ShopCategoryHeaderProps = { categorySlug?: string; eyebrow?: string; showBreadcrumbs?: string; showBlurb?: string }

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
  fields: {
    eyebrow: { type: 'text' as const, label: 'Small line above the name (blank hides it)' },
    showBreadcrumbs: { type: 'select' as const, label: 'Show breadcrumb trail', options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }] },
    showBlurb: { type: 'select' as const, label: 'Show the category description', options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }] },
  },
  defaultProps: { eyebrow: '', showBreadcrumbs: 'yes', showBlurb: 'yes' },
  permissions: { delete: false, duplicate: false },
  render: ShopCategoryHeader,
}
