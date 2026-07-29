import type { ReactNode } from 'react'
import type { Breakpoints } from '@/modules/shop/lib/breakpoints'
import type { ShopDetailSlot } from '@/modules/shop/lib/detail-slot'
import type { ShopDetailSpecExtra } from '@/modules/shop/lib/detail-spec'
import type { ShopDetailTabExtra } from '@/modules/shop/lib/detail-tabs'
import type { ShopGalleryExtra } from '@/modules/shop/lib/gallery-media'
import type { CardFact, CardOverlay } from '@/modules/shop/lib/card-media'
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

// `sourceId` is an opaque tag a companion module may attach to an image it
// contributes through `shop.card-media` - shop-variations sets it to the variation
// (child product) the photo belongs to. Shop passes it through untouched; the card
// island hands the current image's sourceId to the overlay controls, so the 3D
// overlay can show the model for the variation currently on screen. Absent on the
// product's own photos.
export type PartImage = { url: string; alt: string; sourceId?: string }

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
  // Text the shop appends to every price it prints ("inc. VAT"), or '' where it
  // has set none. The figures in `prices` are already converted to match it -
  // this is only the wording (Shop settings > Tax & shipping).
  priceSuffix: string
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
  // The Specification tab body a companion module has taken over for this product
  // through `shop.product-detail-spec` (see lib/detail-spec.ts) - a set of headed
  // attribute groups, say, in place of shop's own SKU/Type/Weight/Dimensions
  // facts. A single winner, not a list, because it REPLACES the tab body rather
  // than adding to it, so unlike `detailTabs` it is one or none. Null on a
  // shop-only site and for every product no provider claimed, where the tab
  // renders shop's own facts table unchanged. Resolved once here for the same
  // reason as the rest: buildDetailSections runs synchronously.
  specOverride: ShopDetailSpecExtra | null
  // The product's opt-in designed description, already rendered from its Puck
  // doc (shp_products.description_puck) by the RSC block. Null when the product
  // has no designed body, where the Description tab falls back to the plain-text
  // `description`. Built once here so the parts stay synchronous.
  descriptionBody?: ReactNode
}

// Injected onto every Product Card part-block, once per product, when a card
// template is stamped across a grid (or a single-product surface). `firstCard`
// lets the card CSS be emitted a single time per grid rather than once per card.
export type CardPartContext = {
  product: ShpProduct
  // The card's first image (primary, or first non-video media). Kept for the
  // simple single-image render path and so any not-yet-rebuilt surface still has
  // something to show. `images[0]` and this are the same picture.
  image: PartImage | null
  // Every picture the card can flick through, in order: the product's own media
  // first, then any a companion module folded in through `shop.card-media`
  // (shop-variations adds variation photos). One entry = the plain single image;
  // more than one lights up the carousel arrows. Resolved once per card.
  images: PartImage[]
  // Overlay controls a companion module pinned over the card image through
  // `shop.card-media` - today the product-3d-views "view in 3D" icon. Each carries
  // its own client component and an opaque payload. Empty on a shop-only site and
  // for every product no module has an overlay for.
  overlays: CardOverlay[]
  // Opaque payloads companion modules contributed through `shop.card-media`, each
  // tagged with the extension-point id that produced it. Shop renders none of
  // them: a module that contributes one also registers its own card part-block
  // against the `shopProductCard` layout type, and that block finds its own entry
  // here by id. Empty on a shop-only site and for any product no module had
  // anything to say about.
  facts: CardFact[]
  currencySymbol: string
  prices: PriceView
  // As DetailPartContext.priceSuffix - the wording only; `prices` and
  // `fromPrice` already carry the converted figures.
  priceSuffix: string
  showRetailPrice: boolean
  badge: CardBadge | null
  // Set when a companion module prices this product itself (shop-variations,
  // through `shop.product-card-prices`): the cheapest figure, as a decimal-pound
  // string, shown in place of the product's own price. Null on a shop-only site
  // and for every product with no such pricing, where the card shows `prices`
  // unchanged. Resolved once per grid, not per card.
  fromPrice: string | null
  // Whether that figure is the bottom of a real range. False when every choice
  // costs the same, in which case the price part drops the "From £…" prefix:
  // there is nothing to count up from.
  fromPriceVaries: boolean
}
