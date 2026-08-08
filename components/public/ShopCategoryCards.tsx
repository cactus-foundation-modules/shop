import type { Breakpoints } from '@/modules/shop/lib/breakpoints-shared'
import { shopCardCss } from '@/modules/shop/components/puck/parts/card-parts'

// The category card grid: the tiles a category page prints across the top so a
// shopper can drop straight into a sub-category rather than wading through the
// whole rolled-up product list first.
//
// It deliberately reuses the product card's own stylesheet and class names
// (`shop-grid`, `shop-card`, `shop-card-img`, `shop-card-name`,
// `shop-card-blurb`, `shop-card-cta`) rather than inventing a second card look.
// A shopper meets both on the same page, so the two have to sit together, and
// borrowing the classes means restyling the card chrome restyles both at once.
// What it does NOT do is stamp the Product Card layout: that template is built
// out of parts that read a product's context (price, stock, badges, 3D), none of
// which a category has.

// The nudge on the tile. A category card has no price or stock to fill the space
// a product card's price row does, and without something in that slot the tiles
// read as unfinished next to the product cards beside them.
function Arrow() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  )
}

export type ShopCategoryCardItem = {
  id: string
  name: string
  slug: string
  shortDescription: string | null
  description: string | null
  imageUrl: string | null
}

export function ShopCategoryCards({ categories, columns, breakpoints, ctaLabel = 'Browse', showBlurb = true }: {
  categories: ShopCategoryCardItem[]
  columns: number
  breakpoints: Breakpoints
  ctaLabel?: string
  // Whether the tile prints the category's short description under its name.
  // On (the historical look) unless the block turns it off for a tighter grid.
  showBlurb?: boolean
}) {
  if (categories.length === 0) return null

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: shopCardCss(breakpoints) }} />
      <div className="shop-grid" style={{ ['--shop-cols' as string]: String(columns) } as React.CSSProperties}>
        {categories.map((c) => {
          // The short one if there is one, else the opening of the long one -
          // better a trimmed paragraph than a blank tile, and the card is the one
          // place the full thing would never fit anyway.
          const blurb = showBlurb ? c.shortDescription || c.description : null
          return (
            <a key={c.id} className="shop-card" href={`/shop/categories/${c.slug}`}>
              <div className="shop-card-img">
                {c.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.imageUrl} alt="" loading="lazy" />
                )}
              </div>
              <h3 className="shop-card-name">{c.name}</h3>
              {blurb && <p className="shop-card-blurb">{blurb}</p>}
              <span className="shop-card-cta">{ctaLabel}<Arrow /></span>
            </a>
          )
        })}
      </div>
    </>
  )
}
