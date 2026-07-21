import type { Breakpoints } from '@/modules/shop/lib/breakpoints'
import type { ShopDetailSlot } from '@/modules/shop/lib/detail-slot'
import type { ShopDetailTabExtra } from '@/modules/shop/lib/detail-tabs'
import type { ShopGalleryExtra } from '@/modules/shop/lib/gallery-media'
import type { PriceView } from '@/modules/shop/lib/pricing'
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
// renders. Derived values (outOfStock/lowStock/prices) are precomputed
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
  // Which figure is charged, which is struck through and what the saving is,
  // worked out once from the product's price types (lib/pricing.ts). Parts read
  // this rather than product.price, so a product on offer never shows one price
  // on the card and charges another at the till.
  prices: PriceView
  // Whether the shop puts its RRP in front of shoppers. The figure itself is on
  // `prices.rrp`, and is null unless it sits above what is being charged.
  showRetailPrice: boolean
  // What to call the supplier on the storefront, or null when the shop either
  // does not record one or keeps it to itself (shop settings > General >
  // Suppliers). Parts read this rather than the config, so the two switches are
  // resolved once per page rather than once per part.
  supplierLabel: string | null
  // Set by the injector when a companion module claims this product through the
  // `shop.product-detail-parts` point (see lib/detail-slot.ts). Null on a
  // shop-only site and for every unclaimed product, where the parts below render
  // shop's own markup unchanged. Resolved once per page, not once per part.
  slot: ShopDetailSlot | null
  // Every block type in the layout being rendered, passed through to any slot
  // component so a provider can stand down a piece the author has already placed
  // as a block of its own. See SlotBase in lib/detail-slot.ts.
  layoutBlockTypes: string[]
  // Extra gallery items contributed through `shop.gallery-media` (see
  // lib/gallery-media.ts) - additive thumbnails, not a replacement for a part of
  // ours, so unlike `slot` this is a list rather than a single winner. Empty on a
  // shop-only site and for any product no module has extra media for. Resolved
  // here, with the rest of the context, because a part's render must stay
  // synchronous - see ShopDetailGalleryRsc.
  galleryExtras: ShopGalleryExtra[]
  // Extra tabs contributed through `shop.product-detail-tabs` (see
  // lib/detail-tabs.ts), already loaded and ordered. Additive like
  // `galleryExtras`, and resolved here for the same reason: ShopDetailTabsRsc
  // renders synchronously and cannot await a provider itself. Empty on a
  // shop-only site.
  detailTabs: ShopDetailTabExtra[]
}

// Injected onto every Product Card part-block, once per product, when a card
// template is stamped across a grid (or a single-product surface). `firstCard`
// lets the card CSS be emitted a single time per grid rather than once per card.
export type CardPartContext = {
  product: ShpProduct
  image: PartImage | null
  currencySymbol: string
  prices: PriceView
  showRetailPrice: boolean
  badge: CardBadge | null
}
