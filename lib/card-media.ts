// Server-side resolver for the `shop.card-media` extension point. A companion
// module may add to a product CARD (the tile in a grid) three things:
//   - extra images, folded into the card's own image carousel so the shopper can
//     flick through them with the arrows (shop-variations contributes a product's
//     variation photos this way);
//   - an overlay, a small client control pinned over the image that does something
//     when tapped (product-3d-views contributes the "view in 3D" icon that swaps
//     the picture for a live model);
//   - facts, an opaque per-product payload that the module's OWN card part-block
//     renders wherever the owner drags it into the Product Card layout
//     (shop-variations summarises a product's colours and sizes this way).
//
// The point is named for the first two because they came first; it is really the
// one seam for everything a module pins to a card, which is why the resolved shape
// below is `ShopCardExtra` rather than anything media-shaped. Everything that
// arrives here reaches every card surface at once, so a module contributing facts
// needs no separate wiring per grid.
//
// Shop learns nothing about what any of it is. It supplies the carousel, the overlay
// slot and the class names; the provider fills them. This is the card-grid twin of
// `shop.gallery-media` (which does the same job on the product DETAIL page), and it
// is resolved in one batched pass per grid exactly like `shop.product-card-prices`
// (lib/card-price.ts) - a grid renders many cards at once, so a per-product call
// would be one query per card.
//
// Additive by construction: nothing here replaces a part of shop's card, so several
// modules contributing at once simply means more images in the cycle and/or more
// overlay icons. Every provider is asked and their answers merged.
import type { ComponentType } from 'react'
import { getInstalledManifests } from '@/lib/modules/live-status'
import { modulePublicExtensionPointComponents as moduleExtensionPointComponents } from '@/lib/modules/extension-points.public'
import type { PartImage } from '@/modules/shop/components/puck/parts/part-context'

// What a mounted overlay is handed. `payload` is whatever the provider's `load`
// returned for this product, passed back untouched - shop treats it as opaque, so
// it crosses the RSC boundary and must be JSON-serialisable. `productId` is the
// product the card is for. `activeSourceId` is the `sourceId` of the image the
// carousel is currently showing (see PartImage) - null on the product's own photos,
// the variation's child-product id on a contributed variation photo - so an overlay
// can react to which picture the shopper is looking at (the 3D overlay uses it to
// show that variation's model).
export type CardOverlayProps = { payload: unknown; productId: string; activeSourceId?: string }

// What a provider returns per product from `load`. Both fields are optional: a
// provider that only adds images (variation photos) omits `overlay`, and one that
// only adds an overlay (3D) omits `images`. A product the provider has nothing for
// is simply absent from the map, which is the common case and costs no markup.
export type ShopCardMediaPayload = {
  // Each may carry a `position` - its index in the FINISHED carousel, the
  // product's own photographs counted in - and lands there rather than behind
  // them all. That is how a card ends up in the same order as the product page's
  // gallery, which the owner arranges for both at once on the Images tab. No
  // position means "after the product's own", which is right for a supplementary
  // colour and is what every contribution did before positions existed.
  images?: PartImage[]
  // The older way of saying "in front of the product's own photographs": these
  // lead the carousel, and the product's own follow. Superseded by `position` on
  // an image above, which can say the same thing (slot 0) and much else besides,
  // but kept working - a provider built against the previous contract leads
  // exactly as it did, because images here with no position of their own claim
  // slots 0..n. Still additive either way: nothing of the product's is dropped.
  leadImages?: PartImage[]
  overlay?: unknown
  // An opaque blob for the provider's own card part-block to render. Unlike
  // `overlay` it needs no component here: the block is registered against the
  // `shopProductCard` layout type in the module's own manifest, finds its payload
  // in the injected card context by this provider's extension-point id, and draws
  // it. Shop never looks inside. Must be JSON-serialisable - it crosses the RSC
  // boundary as a Puck block prop.
  facts?: unknown
}

// The shape a module registers at this point.
//
// `load` runs server-side only (prisma etc.) and is never passed anywhere - a
// function cannot cross the RSC boundary. `Overlay` MUST carry its own 'use client'
// boundary: shop passes it down to the card's client island as a prop, and a server
// component cannot travel that way - the same bargain `shop.gallery-media` strikes
// with its Thumbs/Stage. A provider that only contributes images omits Overlay.
export type ShopCardMediaProvider = {
  load: (productIds: string[]) => Promise<Map<string, ShopCardMediaPayload>>
  Overlay?: ComponentType<CardOverlayProps>
}

// One resolved overlay, ready for the card island to mount.
export type CardOverlay = { id: string; Overlay: ComponentType<CardOverlayProps>; payload: unknown }

// One provider's opaque payload, tagged with the extension-point id that produced
// it so the matching card block can pick its own out of the list.
export type CardFact = { id: string; payload: unknown }

// Everything the providers contributed for one product, merged.
export type ShopCardExtra = {
  images: PartImage[]
  leadImages: PartImage[]
  overlays: CardOverlay[]
  facts: CardFact[]
}

const POINT = 'shop.card-media'

type ExtensionPointEntry = { point: string; id: string }

// Resolved once per grid, keyed by product id. Returns an empty map on a shop-only
// site and never runs a query there: no provider, no work. Every provider is asked
// and their contributions merged - a provider whose `load` throws is dropped and
// logged rather than blanking a whole grid, exactly as the two precedents do: an
// extra image or a 3D icon is a bonus, and a page that still sells the product
// beats a 500.
export async function resolveShopCardExtras(productIds: string[]): Promise<Map<string, ShopCardExtra>> {
  const out = new Map<string, ShopCardExtra>()
  if (productIds.length === 0) return out

  const providers = moduleExtensionPointComponents[POINT] ?? {}
  if (Object.keys(providers).length === 0) return out

  const modules = await getInstalledManifests()

  for (const mod of modules) {
    const manifest = mod.manifest as { extensionPoints?: ExtensionPointEntry[] } | null
    if (!manifest?.extensionPoints) continue
    for (const entry of manifest.extensionPoints) {
      if (entry.point !== POINT) continue
      const provider = providers[entry.id] as ShopCardMediaProvider | undefined
      if (!provider) continue
      try {
        const loaded = await provider.load(productIds)
        for (const [productId, payload] of loaded) {
          if (!payload) continue
          const extra = out.get(productId) ?? { images: [], leadImages: [], overlays: [], facts: [] }
          if (payload.images?.length) extra.images.push(...payload.images)
          if (payload.leadImages?.length) extra.leadImages.push(...payload.leadImages)
          if (payload.facts != null) extra.facts.push({ id: entry.id, payload: payload.facts })
          // An overlay needs both a payload to render and a client component to
          // render it in - a provider that returned an overlay payload but shipped
          // no Overlay component has nothing to mount, so it is skipped.
          if (payload.overlay != null && provider.Overlay) {
            extra.overlays.push({ id: entry.id, Overlay: provider.Overlay, payload: payload.overlay })
          }
          out.set(productId, extra)
        }
      } catch (error) {
        console.error(`[shop] card-media provider "${entry.id}" failed to load:`, error)
      }
    }
  }
  return out
}
