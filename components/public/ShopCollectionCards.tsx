import type { Breakpoints } from '@/modules/shop/lib/breakpoints-shared'
import { shopCardCss } from '@/modules/shop/components/puck/parts/card-parts'

// The collection card grid, as printed by the Collection Browser block.
//
// Same deal as ShopCategoryCards: it borrows the product card's stylesheet and
// class names rather than inventing a third card look, so a page carrying
// collections, categories and products does not read as three different sites.
// The cover picture comes from the collection's first member (see
// listCollectionsForIndex), because the collection table's own image column has
// never been rendered anywhere.

function Arrow() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  )
}

export type ShopCollectionCardItem = {
  id: string
  name: string
  slug: string
  description: string | null
  productCount: number
  coverUrl: string | null
}

export function ShopCollectionCards({ collections, columns, breakpoints, ctaLabel = 'Browse', showBlurb = true, showCount = true }: {
  collections: ShopCollectionCardItem[]
  columns: number
  breakpoints: Breakpoints
  ctaLabel?: string
  // Whether the tile prints the collection's description under its name.
  showBlurb?: boolean
  // The count sits in the slot a product card gives the price, so the tiles do
  // not read as unfinished next to product cards.
  showCount?: boolean
}) {
  if (collections.length === 0) return null

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: shopCardCss(breakpoints) }} />
      <div className="shop-grid" style={{ ['--shop-cols' as string]: String(columns) } as React.CSSProperties}>
        {collections.map((c) => (
          <a key={c.id} className="shop-card" href={`/shop/collections/${c.slug}`}>
            <div className="shop-card-img">
              {c.coverUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.coverUrl} alt="" loading="lazy" />
              )}
            </div>
            <h3 className="shop-card-name">{c.name}</h3>
            {showBlurb && c.description && <p className="shop-card-blurb">{c.description}</p>}
            {showCount && (
              <span className="shop-card-blurb" style={{ opacity: 0.75 }}>
                {c.productCount} {c.productCount === 1 ? 'product' : 'products'}
              </span>
            )}
            <span className="shop-card-cta">{ctaLabel}<Arrow /></span>
          </a>
        ))}
      </div>
    </>
  )
}
