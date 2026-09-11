// [ANCHOR] - categorySlug / collectionSlug are injected by the page being
// rendered (lib/inject-category-context.ts, lib/inject-collection-context.ts)
//
// EDITOR half only: placeholder + Puck field config. The server render lives in
// ShopCategoryFaqs.rsc.tsx (wired by `rscImport` in the manifest) so next/server
// and the db imports never land in the client editor bundle.
//
// The block is offered on four layouts, and what it can print depends on which:
//
//   Category    - the category's own questions, or the whole inherited chain
//                 (category, its parents, then the shop) if asked.
//   Collection  - the collection's own questions, plus the shop-wide ones unless
//                 the collection says it does not inherit. A collection has no
//                 parent, so there is no chain: one rung, then the shop.
//   Shop Home   - neither carries a set of its own, so both print the shop-wide
//   Tag           questions whatever "Questions to show" says. Said plainly in
//                 the field hint, because a setting that does nothing on the page
//                 you are editing is worse than none.

export type ShopCategoryFaqsProps = {
  categorySlug?: string
  collectionSlug?: string
  scope?: string
  title?: string
  columns?: string
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
        { value: 'own', label: "This category's or collection's own questions" },
        { value: 'inherited', label: 'Those, plus the parent categories and the shop' },
      ],
    },
    // Two columns on a wide screen, one on a tablet or a phone whatever this
    // says - a two-column accordion on a 375px screen is two columns of nothing.
    columns: {
      type: 'select' as const,
      label: 'Columns on desktop',
      options: [
        { value: '2', label: 'Two' },
        { value: '1', label: 'One' },
      ],
    },
  },
  // 'own' by default: the shop-wide answers are already on every product page
  // underneath this one, and repeating them here puts the same FAQPage markup on
  // the category and on all four hundred things in it.
  defaultProps: { title: 'Frequently asked questions', scope: 'own', columns: '2' },
  render: ShopCategoryFaqs,
}
