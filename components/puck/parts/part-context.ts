import type { Breakpoints } from '@/modules/shop/lib/breakpoints'
import type { ShpProduct } from '@/modules/shop/lib/types'

// Shared context passed to the shop's part-blocks (the small draggable pieces
// that make up a Product Detail or Product Card layout). Each part reads its own
// slice; in the layout editor canvas `_ctx` is undefined and the part renders a
// labelled skeleton instead (the canvas has no product - same as the shop's
// other Puck blocks). The context is attached by the injectors
// (inject-product-detail-context.ts / inject-product-card-context.ts) onto a
// clone of the saved template just before it renders, so nothing is re-fetched
// per part.

export type PartImage = { url: string; alt: string }

export type CardBadge = { label: string; variant: 'new' | 'low' | 'trade' | 'muted' }

// Injected onto every Product Detail part-block before the detail template
// renders. Derived values (outOfStock/lowStock/hasWas/savePct) are precomputed
// once by the injector so each part stays a dumb view of already-loaded data.
export type DetailPartContext = {
  product: ShpProduct
  images: PartImage[]
  currencySymbol: string
  tagSlugs: string[]
  digitalFile: { filename: string; size: number } | null
  bp: Breakpoints
  outOfStock: boolean
  lowStock: boolean
  hasWas: boolean
  savePct: number | null
}

// Injected onto every Product Card part-block, once per product, when a card
// template is stamped across a grid (or a single-product surface). `firstCard`
// lets the card CSS be emitted a single time per grid rather than once per card.
export type CardPartContext = {
  product: ShpProduct
  image: PartImage | null
  currencySymbol: string
  badge: CardBadge | null
}
