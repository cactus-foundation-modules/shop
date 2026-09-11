// [ANCHOR] - categorySlug is injected by the category page (lib/inject-category-context.ts)
//
// EDITOR half only: placeholder + Puck field config. The server render lives in
// ShopCategoryFaqs.rsc.tsx (wired by `rscImport` in the manifest) so next/server
// and the db imports never land in the client editor bundle.
//
// The block is offered on three layouts, and only one of them has a category:
//
//   Category    - prints the category's own questions, or the whole inherited
//                 chain if the author asks for it.
//   Collection  - neither carries a set of its own, so both print the shop-wide
//   Tag           questions regardless of the "Questions to show" setting. Said
//                 plainly in the field hint, because a setting that does nothing
//                 on the page you are editing is worse than no setting.

export type ShopCategoryFaqsProps = {
  categorySlug?: string
  scope?: string
  title?: string
}

export function ShopCategoryFaqs() {
  return (
    <div style={{ opacity: 0.6, display: 'grid', gap: '0.75rem', maxWidth: '60ch' }}>
      <div style={{ height: 20, width: '42%', background: 'var(--color-border)', borderRadius: 4 }} />
      {[0, 1, 2].map((i) => (
        <div key={i} style={{ display: 'grid', gap: '0.375rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.625rem' }}>
          <div style={{ height: 14, width: `${72 - i * 9}%`, background: 'var(--color-border)', borderRadius: 4 }} />
        </div>
      ))}
    </div>
  )
}

export const shopCategoryFaqsPuckComponent = {
  label: 'Shop: FAQs [Anchor]',
  fields: {
    title: { type: 'text' as const, label: 'Heading (blank hides it)' },
    scope: {
      type: 'select' as const,
      label: 'Questions to show',
      options: [
        { value: 'own', label: "This category's own questions" },
        { value: 'inherited', label: 'Those, plus the parent categories and the shop' },
      ],
    },
  },
  // 'own' by default: the shop-wide answers are already on every product page
  // underneath this one, and repeating them here puts the same FAQPage markup on
  // the category and on all four hundred things in it.
  defaultProps: { title: 'Frequently asked questions', scope: 'own' },
  render: ShopCategoryFaqs,
}
