// Server-side resolver for the `shop.product-selected-variation` extension
// point: which one buyable combination, if any, the option parameters on this
// request name - and what it costs, whether it is on the shelf, and where it
// lives.
//
// Why shop asks at all. A listing with variations has no single price, so its
// structured data quotes an AggregateOffer spanning the cheapest and dearest
// choices. That is the honest answer for the bare listing and the wrong one the
// moment a shopper (or a product feed, or a crawler following one) arrives on a
// URL that names a specific combination: the page then shows one chair at one
// price, the canonical tag already says so (lib/product-canonical.ts), and the
// markup carrying on about a range of forty is what a shopping channel reads as
// a mismatch against the row it was sent.
//
// What comes back is deliberately thin: money, stock, pictures and an address.
// The combination's brand, barcode and part number are NOT here - those come
// back through `shop.product-merchant-facts` keyed on the `productId` below, so
// the rule that decides them lives in one place whether the asker is a product
// page or a feed.
//
// Prices are in the shop's own stored terms - the same side of tax as
// shp_products - because the caller is the one that knows which side it wants to
// print and which side it must publish. Converting here would settle that
// question in the wrong file.
//
// Pattern-copy of lib/product-canonical.ts: providers are discovered through the
// active modules' manifests and the generated moduleExtensionPointComponents
// map, and `resolve` MUST be server-safe.
import { getInstalledManifests } from '@/lib/modules/live-status'
import type { ShpProduct } from '@/modules/shop/lib/types'

export type ShopSelectedVariation = {
  /** The child product row this combination is. The id to ask every other seam
   *  about - identifiers above all. */
  productId: string
  /** The canonical query string for it ('a=b&c=d', no leading '?'), or null
   *  where the module publishes no address of its own for this one. The SAME
   *  string `shop.product-canonical-query` answers with, so the markup's `url`
   *  and the canonical tag cannot name two different pages. */
  canonicalQuery: string | null
  /** What this combination is actually charged, sale price included where the
   *  shop has sale prices switched on. Stored terms. */
  price: number
  /** Its own normal price, where it is currently reduced. Null when it is not,
   *  so there is nothing to strike through. Stored terms. */
  compareAtPrice: number | null
  /** Its recommended retail price, where the shop shows one. Null otherwise.
   *  Stored terms. */
  retailPrice: number | null
  /** Whether this combination can be bought right now. */
  inStock: boolean
  /** Its own photographs, in gallery order, primary first. Possibly relative -
   *  absolutising is the caller's job, as it is everywhere else media travels. */
  imageUrls: string[]
}

export type ShopSelectedVariationProvider = {
  /** The combination this request names, or null to decline - a product with no
   *  variations, a URL carrying no option parameters, and a half-made selection
   *  all decline, and shop then describes the listing exactly as it did before
   *  this point existed. */
  resolve: (product: ShpProduct) => Promise<ShopSelectedVariation | null> | ShopSelectedVariation | null
}

type ExtensionPointEntry = { point: string; id: string }

const POINT = 'shop.product-selected-variation'

/**
 * The combination this request names, or null.
 *
 * First answer wins, the same rule every other multi-provider point here
 * follows: two modules must not fight over what the shopper picked, and the tie
 * has to break identically on every render or the markup would change between
 * two identical requests.
 *
 * A provider that throws is skipped rather than taken seriously. A product page
 * describing the listing beats a 500, and the listing was the answer on every
 * shop until this shipped.
 */
export async function resolveSelectedVariation(product: ShpProduct): Promise<ShopSelectedVariation | null> {
  // Dynamic on purpose, as everywhere else in this module that reads the
  // registry: a static edge from here closes an import cycle through the
  // registry's own contributed components. See scripts/check-import-cycles.mjs.
  const { modulePublicExtensionPointComponents: moduleExtensionPointComponents } =
    await import('@/lib/modules/extension-points.public')
  const providers = moduleExtensionPointComponents[POINT] ?? {}
  if (Object.keys(providers).length === 0) return null

  const modules = await getInstalledManifests()

  for (const mod of modules) {
    const manifest = mod.manifest as { extensionPoints?: ExtensionPointEntry[] } | null
    if (!manifest?.extensionPoints) continue
    for (const entry of manifest.extensionPoints) {
      if (entry.point !== POINT) continue
      const provider = providers[entry.id] as ShopSelectedVariationProvider | undefined
      if (!provider) continue
      try {
        const resolved = await provider.resolve(product)
        if (resolved) return resolved
      } catch (error) {
        console.error(`[shop] selected-variation provider "${entry.id}" failed:`, error)
      }
    }
  }
  return null
}
