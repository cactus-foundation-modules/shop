// Server-side resolver for the `shop.gallery-media` extension point. A companion
// module may contribute extra items to a product's gallery - a 3D model, say -
// which appear as further thumbnails in the strip and take over the stage when
// picked. Shop learns nothing about what they are: it supplies the strip, the
// stage and the class names, and the provider fills them.
//
// Why this is not `shop.product-detail-parts`. That point hands the WHOLE gallery
// to one provider, and the first claimer wins, so a product with options is
// already spoken for by shop-variations. Extra gallery media has to work on that
// product too, which means a second, additive point rather than a second claimant.
// Both galleries - shop's own ProductGallery and a slot provider's replacement -
// render whatever this resolves, so the contributed thumbnails turn up either way.
//
// Additive by construction: nothing here replaces a part of shop's, so unlike the
// detail-parts point there is no two-prices-on-one-page failure to design around.
// Several modules contributing at once simply means several extra thumbnails, so
// every provider is resolved rather than only the first.
import type { ComponentType } from 'react'
import { prisma } from '@/lib/db/prisma'
import { INSTALLED_MODULE_WHERE } from '@/lib/modules/live-status'
import { moduleExtensionPointComponents } from '@/lib/modules/extension-points'

// What the host gallery hands the provider's thumbnail strip.
//
// The provider renders its own <button>s into the host's strip using the class
// names below, so a contributed thumbnail is styled by the layout it sits in
// rather than by the module that supplied it - the same bargain the detail-parts
// slot strikes.
export type ShopGalleryExtraThumbsProps = {
  // Whatever the provider's `load` returned, passed back untouched. Shop treats
  // it as opaque: it crosses the RSC boundary, so it must be JSON-serialisable,
  // and that is the only thing shop asks of it.
  payload: unknown
  // The product the shopper is actually buying right now: a variant child's id
  // where a companion module has resolved one, otherwise null. Shop's own
  // gallery always passes null - it has no notion of a chosen combination - and
  // a variant-aware gallery passes the chosen child. A provider uses it to show
  // only the items belonging to the current choice.
  activeProductId: string | null
  // Which contributed item the host currently has on the stage, by the provider's
  // own key, or null when a plain image is showing.
  activeKey: string | null
  // Put an item on the stage, or hand the stage back to the images with null. A
  // provider MUST call this with null when the active item stops being one it
  // would render (a variant change that drops it, say), or the stage would be
  // left showing something the strip no longer offers.
  onPick: (key: string | null) => void
  thumbClass: string
  thumbOnClass: string
}

// What the host hands the provider's stage. Rendered in place of the <img>, inside
// the host's own stage box, so the provider owns the picture and nothing else.
export type ShopGalleryExtraStageProps = {
  payload: unknown
  itemKey: string
  activeProductId: string | null
}

// The shape a module registers at this point.
//
// `Thumbs` and `Stage` are handed down through the RSC boundary as props, so both
// MUST carry their own 'use client' boundary: a server component cannot be passed
// that way, and the host galleries are client islands. `load` runs server-side
// only and is never passed anywhere - a function cannot cross that boundary,
// which is also why the filtering by `activeProductId` is the provider's job in
// its own client half rather than a callback shop calls into.
export type ShopGalleryMediaProvider = {
  // Everything this provider holds for the product, resolved while the page
  // renders so contributed thumbnails are in the first HTML rather than a fetch
  // behind it. `productId` is always the parent product being viewed; a provider
  // that also has items for variant children resolves those itself.
  //
  // The return value crosses to the browser, so it must be JSON-serialisable.
  load: (productId: string) => Promise<unknown>
  Thumbs: ComponentType<ShopGalleryExtraThumbsProps>
  Stage: ComponentType<ShopGalleryExtraStageProps>
}

// One resolved provider plus its payload, ready for a host gallery to render.
export type ShopGalleryExtra = {
  id: string
  payload: unknown
  Thumbs: ComponentType<ShopGalleryExtraThumbsProps>
  Stage: ComponentType<ShopGalleryExtraStageProps>
}

type ExtensionPointEntry = { point: string; id: string }

const POINT = 'shop.gallery-media'

// Resolved once per product page, in shop's Gallery part, and passed to whichever
// gallery ends up rendering. Returns [] on a shop-only site and for any product
// no provider has media for, where the galleries below render exactly as before.
//
// A provider whose `load` throws is dropped rather than taking the product page
// down with it: an extra thumbnail is a bonus, and a page that still sells the
// product beats a 500. The failure is logged so it is not silent.
export async function resolveShopGalleryExtras(productId: string): Promise<ShopGalleryExtra[]> {
  const providers = moduleExtensionPointComponents[POINT] ?? {}
  if (Object.keys(providers).length === 0) return []

  const modules = await prisma.module.findMany({
    where: { ...INSTALLED_MODULE_WHERE },
    select: { manifest: true },
  })

  const resolved: ShopGalleryExtra[] = []
  for (const mod of modules) {
    const manifest = mod.manifest as { extensionPoints?: ExtensionPointEntry[] } | null
    if (!manifest?.extensionPoints) continue
    for (const entry of manifest.extensionPoints) {
      if (entry.point !== POINT) continue
      const provider = providers[entry.id] as ShopGalleryMediaProvider | undefined
      if (!provider) continue
      try {
        const payload = await provider.load(productId)
        // Null/undefined means "nothing for this product" - the common case on a
        // site where only some products carry extra media, so it costs no markup.
        if (payload == null) continue
        resolved.push({ id: entry.id, payload, Thumbs: provider.Thumbs, Stage: provider.Stage })
      } catch (error) {
        console.error(`[shop] gallery-media provider "${entry.id}" failed to load for product ${productId}:`, error)
      }
    }
  }
  return resolved
}
