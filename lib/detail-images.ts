// Server-side resolver for the `shop.product-detail-images` extension point. A
// companion module that hangs further photographs off a product - the variations
// module's promoted variations, today - contributes them here as plain URLs, so a
// view that draws a bare strip of pictures rather than the full gallery shows the
// same set the product's own page does.
//
// Why not `shop.gallery-media`. That point hands over COMPONENTS: a thumbnail
// strip and a stage, rendered into an interactive gallery that tracks what the
// shopper has picked. The details-only view (see the /details route) has no
// gallery, no stage and no selection - it is a strip of <img>s inside someone
// else's modal - so there is nothing for those components to render into. This
// point asks for data instead, which is the one thing a static view can use.
//
// Additive and order-aware: a provider says where its pictures belong among the
// product's own, because that is the owner's arrangement on the product's Images
// tab and shop has no way to know it.
import { getInstalledManifests } from '@/lib/modules/live-status'
import { modulePublicExtensionPointComponents as moduleExtensionPointComponents } from '@/lib/modules/extension-points.public'
import type { ShopDetailSlotImage } from '@/modules/shop/lib/detail-slot'

// A contributed picture, and where it sits in the finished strip: `position` is
// its index in that strip, the product's own photographs and every contributed
// one counted together - the same ordinal space the Images tab drags them around
// in (see product-editor/gallery-extras.tsx). Absent means "after the product's
// own", which is where a newly contributed picture starts.
export type ShopExtraDetailImage = ShopDetailSlotImage & { position?: number | null }

export type ShopExtraDetailImages = {
  images: ShopExtraDetailImage[]
  // The older, whole-set form: 'before' puts every one of them in front of the
  // product's own photographs, 'after' behind. Read only where no image carries
  // a `position` of its own, so a module built against the previous contract
  // still places its pictures the way it asked to.
  placement?: 'before' | 'after'
}

export type ShopDetailImagesProvider = {
  // Everything this provider has for the product, or null for "nothing here" -
  // the common case, so it costs one cheap query on a product with no variations.
  load: (productId: string) => Promise<ShopExtraDetailImages | null>
}

type ExtensionPointEntry = { point: string; id: string }

const POINT = 'shop.product-detail-images'

// The product's own pictures with every provider's folded in around them, in the
// order each asked for. Returns `own` unchanged on a shop-only site and for any
// product no provider has extras for.
//
// A provider that throws is dropped rather than taking the page with it: an extra
// photograph is a bonus, and a view that still describes the product beats a 500.
export async function resolveShopDetailImages(
  productId: string,
  own: ShopDetailSlotImage[],
): Promise<ShopDetailSlotImage[]> {
  const providers = moduleExtensionPointComponents[POINT] ?? {}
  if (Object.keys(providers).length === 0) return own

  const modules = await getInstalledManifests()

  const contributed: ShopExtraDetailImage[] = []
  for (const mod of modules) {
    const manifest = mod.manifest as { extensionPoints?: ExtensionPointEntry[] } | null
    if (!manifest?.extensionPoints) continue
    for (const entry of manifest.extensionPoints) {
      if (entry.point !== POINT) continue
      const provider = providers[entry.id] as ShopDetailImagesProvider | undefined
      if (!provider) continue
      try {
        const extra = await provider.load(productId)
        if (!extra || extra.images.length === 0) continue
        // The older contract, translated into the newer one: 'before' is
        // simply every picture claiming a slot at the front, in the order it
        // listed them, and 'after' is the absent position they already get.
        const placed = extra.images.some((img) => img.position != null)
        if (!placed && extra.placement === 'before') {
          contributed.push(...extra.images.map((img, i) => ({ ...img, position: i })))
        } else {
          contributed.push(...extra.images)
        }
      } catch (error) {
        console.error(`[shop] detail-images provider "${entry.id}" failed for product ${productId}:`, error)
      }
    }
  }
  if (contributed.length === 0) return own

  // Lay the product's own out in order and drop each contributed picture into the
  // slot it asked for. Forgiving on purpose: one that asked for a slot past the
  // end simply lands at the end, which is what happens when the product loses a
  // photograph after the gallery was arranged.
  const placed = [...contributed]
    .map((image, index) => ({ image, index }))
    .sort((a, b) => (a.image.position ?? Number.POSITIVE_INFINITY) - (b.image.position ?? Number.POSITIVE_INFINITY) || a.index - b.index)
  const merged: ShopDetailSlotImage[] = []
  let next = 0
  for (const { image } of placed) {
    const target = image.position ?? Number.POSITIVE_INFINITY
    while (next < own.length && merged.length < target) merged.push(own[next++]!)
    merged.push({ url: image.url, alt: image.alt })
  }
  while (next < own.length) merged.push(own[next++]!)

  // Same picture twice reads as a mistake in a strip this short: a variation
  // promoted for a photograph the parent also carries would otherwise appear
  // alongside itself. First occurrence wins, so the requested order stands.
  const seen = new Set<string>()
  return merged.filter((img) => {
    if (seen.has(img.url)) return false
    seen.add(img.url)
    return true
  })
}
