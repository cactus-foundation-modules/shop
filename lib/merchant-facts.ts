// Server-side resolver for the `shop.product-merchant-facts` extension point:
// the make, the barcode, the part number, the condition and the country the
// shop delivers to.
//
// None of it is shop's own. A shop knows what it sells and what it charges; who
// made the thing and what its GTIN is are facts an owner types in for somebody
// else's benefit - a product feed, normally - and the module that asked for them
// is the module that keeps them. Reading them back through a point rather than
// out of that module's tables is what lets the product page publish them without
// shop becoming a dependent of an optional module.
//
// Nothing here is required. A shop with no provider installed publishes a Product
// block with a name, a price, photographs and its own SKU, exactly as it did
// before this file existed.
import { getInstalledManifests } from '@/lib/modules/live-status'
import type { ShopProductIdentifiers } from '@/modules/shop/lib/product-jsonld'

export type ShopMerchantFactsProvider = {
  /**
   * Facts that are the same for every product: today, the country the shop's
   * delivery services cover. Asked once per page, not once per product.
   *
   * Returning null - or a provider that has none - simply omits them.
   */
  shopFacts?: () => Promise<{ shippingCountry?: string | null } | null>
  /**
   * Identifiers for the products asked about, keyed by product id. A product the
   * provider knows nothing about is absent from the map rather than present and
   * empty, so a second provider can still answer for it.
   */
  identifiers?: (productIds: string[]) => Promise<Record<string, ShopProductIdentifiers>>
}

export type ShopMerchantFacts = {
  identifiers: Map<string, ShopProductIdentifiers>
  shippingCountry: string | null
}

const EMPTY: ShopMerchantFacts = { identifiers: new Map(), shippingCountry: null }

const POINT = 'shop.product-merchant-facts'

type ExtensionPointEntry = { point: string; id: string }

/**
 * Every merchant fact available for the given products, in one pass.
 *
 * Every provider is asked and their answers merged, first answer winning, the
 * same rule `shop.product-card-prices` follows - two providers must not fight
 * over a product's brand, and the tie has to break the same way on every render
 * or the page's markup would change between two identical requests.
 *
 * A provider that throws is skipped rather than taken seriously: a product page
 * that sells the product without a brand on it beats a 500.
 */
export async function resolveMerchantFacts(productIds: string[]): Promise<ShopMerchantFacts> {
  if (productIds.length === 0) return EMPTY

  // Dynamic on purpose, as everywhere else in this module that reads the
  // registry: a static edge from here closes an import cycle through the
  // registry's own contributed components. See scripts/check-import-cycles.mjs.
  const { modulePublicExtensionPointComponents: moduleExtensionPointComponents } =
    await import('@/lib/modules/extension-points.public')
  const providers = moduleExtensionPointComponents[POINT] ?? {}
  if (Object.keys(providers).length === 0) return EMPTY

  const modules = await getInstalledManifests()
  const identifiers = new Map<string, ShopProductIdentifiers>()
  let shippingCountry: string | null = null

  for (const mod of modules) {
    const manifest = mod.manifest as { extensionPoints?: ExtensionPointEntry[] } | null
    if (!manifest?.extensionPoints) continue
    for (const entry of manifest.extensionPoints) {
      if (entry.point !== POINT) continue
      const provider = providers[entry.id] as ShopMerchantFactsProvider | undefined
      if (!provider) continue
      try {
        if (provider.identifiers) {
          const found = await provider.identifiers(productIds)
          for (const [id, row] of Object.entries(found)) {
            if (!identifiers.has(id)) identifiers.set(id, row)
          }
        }
        if (shippingCountry === null && provider.shopFacts) {
          const facts = await provider.shopFacts()
          const country = facts?.shippingCountry?.trim().toUpperCase()
          if (country) shippingCountry = country
        }
      } catch (error) {
        console.error(`[shop] merchant-facts provider "${entry.id}" failed:`, error)
      }
    }
  }

  return { identifiers, shippingCountry }
}
