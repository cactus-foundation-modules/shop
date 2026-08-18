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
// Additive and order-aware: a provider says whether its pictures belong in front
// of the product's own or behind them, because that is the owner's setting on the
// product and shop has no way to know it.
import { prisma } from '@/lib/db/prisma'
import { INSTALLED_MODULE_WHERE } from '@/lib/modules/live-status'
import { moduleExtensionPointComponents } from '@/lib/modules/extension-points'
import type { ShopDetailSlotImage } from '@/modules/shop/lib/detail-slot'

export type ShopExtraDetailImages = {
  images: ShopDetailSlotImage[]
  // 'before' puts them in front of the product's own photographs, 'after' behind
  // them. The provider owns this because it owns the setting behind it.
  placement: 'before' | 'after'
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

  const modules = await prisma.module.findMany({
    where: { ...INSTALLED_MODULE_WHERE },
    select: { manifest: true },
  })

  const before: ShopDetailSlotImage[] = []
  const after: ShopDetailSlotImage[] = []
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
        ;(extra.placement === 'before' ? before : after).push(...extra.images)
      } catch (error) {
        console.error(`[shop] detail-images provider "${entry.id}" failed for product ${productId}:`, error)
      }
    }
  }
  if (before.length === 0 && after.length === 0) return own

  // Same picture twice reads as a mistake in a strip this short: a variation
  // promoted for a photograph the parent also carries would otherwise appear
  // alongside itself. First occurrence wins, so the requested order stands.
  const seen = new Set<string>()
  return [...before, ...own, ...after].filter((img) => {
    if (seen.has(img.url)) return false
    seen.add(img.url)
    return true
  })
}
