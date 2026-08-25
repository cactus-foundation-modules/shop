// Server-side resolver for the `shop.product-card-prices` extension point. Shop
// stays generic: it knows nothing about variations, only that a companion module
// may price some products as a range and, given a batch of product ids, hand
// back the cheapest figure to show as "From £…" on the card.
//
// Precedent: shop.product-detail-parts -> lib/detail-slot.ts. Like that one, the
// provider is discovered through the active modules' manifests and stored in the
// generated moduleExtensionPointComponents map. Batched deliberately: a grid
// renders many cards at once, so a per-product call would be one query per card.
import { getInstalledManifests } from '@/lib/modules/live-status'
import { modulePublicExtensionPointComponents as moduleExtensionPointComponents } from '@/lib/modules/extension-points.public'

// What a companion module says a product costs when it, not shop, owns the
// pricing. `varies` is the difference between a range and a set of equally
// priced choices: only a genuine range earns the "From £…" prefix, because a
// product whose every variation costs the same has exactly one price and saying
// "From" about it just makes the shopper wonder what the catch is.
export type ShopCardFromPrice = {
  // The cheapest a shopper could pay, as a decimal-pound string.
  price: string
  // Whether anything dearer is on offer under the same product.
  varies: boolean
  // Whether any of the choices under this product is actually reduced, which is
  // what puts the listing in the automatic "On Sale" tag. Optional: a provider
  // built before that tag existed simply says nothing, and the listing falls
  // back to shop's own sale columns - which for a variations listing means it is
  // never counted, exactly as it was not before.
  onSale?: boolean
  // The lowest RRP among the choices that carry one above their own price, as a
  // decimal-pound string - the "from" figure's opposite number, so a card
  // showing "From £92.00" can sit an RRP beside it exactly as a single-priced
  // card does. Null where no choice has a retail price worth quoting. Optional
  // for the same reason as `onSale`: a provider built before this simply says
  // nothing and the card carries on printing the "from" price on its own.
  rrp?: string | null
}

export type ShopCardPriceProvider = {
  // Cheapest price per product for the products this provider prices itself. A
  // product it does not price is simply absent from the map, and the card shows
  // shop's own price for it.
  fromPrices: (productIds: string[]) => Promise<Record<string, ShopCardFromPrice>>
}

const POINT = 'shop.product-card-prices'

type ExtensionPointEntry = { point: string; id: string }

// The figure to show for each of the given products that a companion module
// prices itself, keyed by product id. Empty on a shop-only site, and never
// runs a query there: no provider, no work. Every provider is asked and their
// answers merged; the first to price a product wins, so two never fight over it.
export async function resolveCardFromPrices(productIds: string[]): Promise<Map<string, ShopCardFromPrice>> {
  const out = new Map<string, ShopCardFromPrice>()
  if (productIds.length === 0) return out

  const providers = moduleExtensionPointComponents[POINT] ?? {}
  if (Object.keys(providers).length === 0) return out

  const modules = await getInstalledManifests()

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
