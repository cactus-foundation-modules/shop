import { shopCategoryPillsCss } from '@/modules/shop/components/public/ShopCategoryPills.shared'
import { DEFAULT_BREAKPOINTS } from '@/modules/shop/lib/breakpoints-shared'

// EDITOR half only: placeholder + Puck field config. The server render lives in
// ShopCategoryBrowser.rsc.tsx (wired by `rscImport` in the manifest) so
// next/server + db imports never land in the client editor bundle.
//
// On a Category layout `parentCategorySlug` is injected with the category being
// viewed (lib/inject-category-context.ts), so the block lists that category's
// sub-categories without the owner naming one - one layout serves every category
// page. On the Shop Home layout it is a real, editable field.
export type ShopCategoryBrowserProps = { parentCategorySlug?: string; columns?: number; ctaLabel?: string; display?: string; showBlurb?: string; pillLimit?: number }

export function ShopCategoryBrowser(props: ShopCategoryBrowserProps) {
  const columns = props.columns ?? 4
  if (props.display === 'pills') {
    // Sample pills through the real classes and stylesheet, so the canvas
    // shows exactly the chrome the live page will print - only the names are
    // stand-ins, since the editor half cannot fetch. A cap set on the block
    // shows here too, folded exactly as the live strip folds it, so the owner
    // can see what "show the busiest four" actually leaves on the page.
    const limit = Math.max(0, Math.floor(Number(props.pillLimit)) || 0)
    const names = ['Sub-category', 'Another one', 'A third', 'One more', 'A fifth', 'A sixth']
    const shown = limit > 0 && limit < names.length ? names.slice(0, limit) : names
    const hidden = limit > 0 && limit < names.length ? names.slice(limit) : []
    return (
      <>
        <style dangerouslySetInnerHTML={{ __html: shopCategoryPillsCss(DEFAULT_BREAKPOINTS) }} />
        <nav
          className={hidden.length > 0 ? 'shop-cat-pills shop-cat-pills-limited' : 'shop-cat-pills'}
          aria-label="Sub-categories"
          style={{ opacity: 0.6, pointerEvents: 'none' }}
        >
          {shown.map((name) => (
            <a key={name} className="shop-cat-pill" href="#">{name}</a>
          ))}
          {hidden.length > 0 && (
            <label className="shop-cat-pill shop-cat-more">
              <input type="checkbox" className="shop-cat-more-input" readOnly />
              <span className="shop-cat-more-open">{hidden.length} more</span>
              <span className="shop-cat-more-close">Show fewer</span>
            </label>
          )}
          {hidden.map((name) => (
            <a key={name} className="shop-cat-pill shop-cat-pill-extra" href="#">{name}</a>
          ))}
        </nav>
      </>
    )
  }
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
    display: {
      type: 'select' as const,
      label: 'Show as',
      options: [
        { value: 'cards', label: 'Cards' },
        { value: 'pills', label: 'Pills' },
      ],
    },
    pillLimit: { type: 'number' as const, label: 'Pills: show only this many, busiest first (0 shows all)' },
    columns: { type: 'number' as const, label: 'Columns (cards only)' },
    ctaLabel: { type: 'text' as const, label: 'Link wording (cards only)' },
    showBlurb: { type: 'select' as const, label: 'Show category descriptions (cards only)', options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }] },
  },
  defaultProps: { parentCategorySlug: '', display: 'cards', pillLimit: 0, columns: 4, ctaLabel: 'Browse', showBlurb: 'yes' },
  render: ShopCategoryBrowser,
}
