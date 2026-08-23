import type { ShopCategoryCardItem } from '@/modules/shop/components/public/ShopCategoryCards'
import type { Breakpoints } from '@/modules/shop/lib/breakpoints-shared'
import { shopCategoryPillsCss, splitPillsByPopularity } from '@/modules/shop/components/public/ShopCategoryPills.shared'
import { ShopCategoryPillsScroller } from '@/modules/shop/components/public/ShopCategoryPillsScroller'

// The pill strip: the compact alternative to the category card grid. Same data,
// a fraction of the height - a row of wrapping link chips instead of image
// tiles. A page whose sub-categories are navigation shortcuts rather than the
// main event (a filtered category page, say) wants the strip, not a second
// grid competing with the product cards below it.
//
// `limit` caps how many print up front: the busiest that many by product count,
// the rest folded behind a "more" toggle. Every link is in the markup either
// way - the fold is CSS, not a shorter render - so nothing disappears from the
// page a crawler reads. 0 shows the lot, which is what every existing page does.
//
// Markup and stylesheet live here once and are shared verbatim by the editor
// placeholder (ShopCategoryBrowser.tsx renders sample pills through the same
// classes), so the editor canvas and the live page stay pixel-identical.

export function ShopCategoryPills({ categories, breakpoints, counts, limit = 0 }: {
  categories: ShopCategoryCardItem[]
  breakpoints: Breakpoints
  counts?: Record<string, number>
  limit?: number
}) {
  if (categories.length === 0) return null
  const { shown, hidden } = splitPillsByPopularity(categories, counts ?? {}, limit)
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: shopCategoryPillsCss(breakpoints) }} />
      <ShopCategoryPillsScroller>
        <nav className={hidden.length > 0 ? 'shop-cat-pills shop-cat-pills-limited' : 'shop-cat-pills'} aria-label="Sub-categories">
          {shown.map((c) => (
            <a key={c.id} className="shop-cat-pill" href={`/shop/categories/${c.slug}`}>{c.name}</a>
          ))}
          {hidden.length > 0 && (
            <label className="shop-cat-pill shop-cat-more">
              <input type="checkbox" className="shop-cat-more-input" />
              <span className="shop-cat-more-open">{hidden.length} more</span>
              <span className="shop-cat-more-close">Show fewer</span>
            </label>
          )}
          {hidden.map((c) => (
            <a key={c.id} className="shop-cat-pill shop-cat-pill-extra" href={`/shop/categories/${c.slug}`}>{c.name}</a>
          ))}
        </nav>
      </ShopCategoryPillsScroller>
    </>
  )
}
