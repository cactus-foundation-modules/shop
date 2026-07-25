// Server-side resolver for the `shop.product-card-prices` extension point. Shop
// stays generic: it knows nothing about variations, only that a companion module
// may price some products as a range and, given a batch of product ids, hand
// back the cheapest figure to show as "From £…" on the card.
//
// Precedent: shop.product-detail-parts -> lib/detail-slot.ts. Like that one, the
// provider is discovered through the active modules' manifests and stored in the
// generated moduleExtensionPointComponents map. Batched deliberately: a grid
// renders many cards at once, so a per-product call would be one query per card.
import { prisma } from '@/lib/db/prisma'
import { INSTALLED_MODULE_WHERE } from '@/lib/modules/live-status'
import { moduleExtensionPointComponents } from '@/lib/modules/extension-points'

export type ShopCardPriceProvider = {
  // Cheapest price per product, as a decimal-pound string, for the products this
  // provider prices as a range. A product it does not price is simply absent
  // from the map, and the card shows shop's own price for it.
  fromPrices: (productIds: string[]) => Promise<Record<string, string>>
}

const POINT = 'shop.product-card-prices'

type ExtensionPointEntry = { point: string; id: string }

// The "From £…" figure for each of the given products that a companion module
// prices as a range, keyed by product id. Empty on a shop-only site, and never
// runs a query there: no provider, no work. Every provider is asked and their
// answers merged; the first to price a product wins, so two never fight over it.
export async function resolveCardFromPrices(productIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (productIds.length === 0) return out

  const providers = moduleExtensionPointComponents[POINT] ?? {}
  if (Object.keys(providers).length === 0) return out

  const modules = await prisma.module.findMany({
    where: { ...INSTALLED_MODULE_WHERE },
    select: { manifest: true },
  })

  for (const mod of modules) {
    const manifest = mod.manifest as { extensionPoints?: ExtensionPointEntry[] } | null
    if (!manifest?.extensionPoints) continue
    for (const entry of manifest.extensionPoints) {
      if (entry.point !== POINT) continue
      const provider = providers[entry.id] as ShopCardPriceProvider | undefined
      if (!provider) continue
      try {
        const priced = await provider.fromPrices(productIds)
        for (const [id, price] of Object.entries(priced)) {
          if (!out.has(id)) out.set(id, price)
        }
      } catch {
        // A provider that throws must not blank a whole grid: its products just
        // fall back to shop's own price, exactly as on a shop-only site.
      }
    }
  }
  return out
}
