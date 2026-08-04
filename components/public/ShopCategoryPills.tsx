import type { ShopCategoryCardItem } from '@/modules/shop/components/public/ShopCategoryCards'
import { shopCategoryPillsCss } from '@/modules/shop/components/public/ShopCategoryPills.shared'

// The pill strip: the compact alternative to the category card grid. Same data,
// a fraction of the height - a row of wrapping link chips instead of image
// tiles. A page whose sub-categories are navigation shortcuts rather than the
// main event (a filtered category page, say) wants the strip, not a second
// grid competing with the product cards below it.
//
// Markup and stylesheet live here once and are shared verbatim by the editor
// placeholder (ShopCategoryBrowser.tsx renders sample pills through the same
// classes), so the editor canvas and the live page stay pixel-identical.

export function ShopCategoryPills({ categories }: { categories: ShopCategoryCardItem[] }) {
  if (categories.length === 0) return null
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: shopCategoryPillsCss }} />
      <nav className="shop-cat-pills" aria-label="Sub-categories">
        {categories.map((c) => (
          <a key={c.id} className="shop-cat-pill" href={`/shop/categories/${c.slug}`}>{c.name}</a>
        ))}
      </nav>
    </>
  )
}
