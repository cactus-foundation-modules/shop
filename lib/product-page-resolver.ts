// Server-side resolver for the `shop.product-page-resolver` extension point.
//
// A product-page URL whose slug shop itself will not show - a catalogue-hidden
// row, most obviously - is offered to each installed module's resolver before
// the page 404s. A resolver may hand back the product whose page should render
// under that URL instead, keeping the address bar as it was. Shop stays generic:
// it learns only "some other module may alias this slug to a real product", never
// why one slug stands in for another.
//
// The motivating case is a variation deep link. A variant is a catalogue-hidden
// child product with its own slug (the link the cart builds and shoppers share);
// shop-variations' resolver maps that slug back to the variant's parent, so the
// parent's page renders with the variant already chosen. See
// modules/shop-variations/lib/product-page-resolver.ts.
//
// Precedent, and the pattern this mirrors: shop.product-detail-parts ->
// lib/detail-slot.ts. Like that one, the provider is discovered through the
// active modules' manifests and stored in the generated
// moduleExtensionPointComponents map, and `resolve` MUST be server-safe (it runs
// inside the Product page's server component).
import { getInstalledManifests } from '@/lib/modules/live-status'
import { moduleExtensionPointComponents } from '@/lib/modules/extension-points'
import type { ShpProduct } from '@/modules/shop/lib/types'

export type ShopProductPageResolver = {
  // Given the requested slug and the product shop found for it (a catalogue-hidden
  // row, or null when the slug matched nothing), return the product whose page
  // should render under this URL, or null to decline. A resolver may also record
  // request-scoped state of its own as a side effect - the variations one stashes
  // which combination to open the selector on - exactly as the detail-parts
  // provider's `claimsProduct` records the product slug.
  resolve: (slug: string, found: ShpProduct | null) => Promise<ShpProduct | null> | ShpProduct | null
}

type ExtensionPointEntry = { point: string; id: string }

const POINT = 'shop.product-page-resolver'

// First resolver to claim the slug wins, in active-modules order - the same
// tie-break resolveShopDetailProvider uses, for the same reason: two modules
// aliasing one URL to two different products would need an arbiter, and the query
// order is as good as any and stable.
export async function resolveAliasedProduct(slug: string, found: ShpProduct | null): Promise<ShpProduct | null> {
  const providers = moduleExtensionPointComponents[POINT] ?? {}
  if (Object.keys(providers).length === 0) return null

  const modules = await getInstalledManifests()

  for (const mod of modules) {
    const manifest = mod.manifest as { extensionPoints?: ExtensionPointEntry[] } | null
    if (!manifest?.extensionPoints) continue
    for (const entry of manifest.extensionPoints) {
      if (entry.point !== POINT) continue
      const provider = providers[entry.id] as ShopProductPageResolver | undefined
      if (!provider) continue
      const resolved = await provider.resolve(slug, found)
      if (resolved) return resolved
    }
  }
  return null
}
