// Server-side resolver for the `shop.product-detail-spec` extension point. A
// companion module may take over the body of the product page's Specification
// tab for a product - swapping shop's own facts table (SKU, Type, Weight,
// Dimensions) for content of its own, a set of headed attribute groups say.
//
// Shop learns nothing about what fills the tab: it still owns the tab itself -
// its place in the strip, its name, its panel and styling - and only hands the
// body over. Same bargain as gallery-media and detail-tabs.
//
// Replacing, not additive, and so unlike `shop.product-detail-tabs`: two modules
// both claiming the one Specification tab would mean two answers to "what is the
// spec", so the FIRST provider with something to show wins and the rest stand
// down - the same single-winner rule `shop.product-detail-parts` follows, and for
// the same reason. A product no provider has anything for keeps shop's own facts
// table untouched, which is what makes installing a provider module change
// nothing until an attribute is actually put on the page.
import type { ComponentType } from 'react'
import { getInstalledManifests } from '@/lib/modules/live-status'
import { modulePublicExtensionPointComponents as moduleExtensionPointComponents } from '@/lib/modules/extension-points.public'

// What shop hands the provider's panel. Rendered inside shop's own Specification
// panel, so a replaced body is dressed by the layout it sits in rather than by
// the module that supplied it.
export type ShopDetailSpecPanelProps = {
  // Whatever the provider's `load` returned, passed back untouched. Shop treats
  // it as opaque: it crosses the RSC boundary, so it must be JSON-serialisable,
  // and that is the only thing shop asks of it.
  payload: unknown
  // Layout hint from the block the panel renders inside (the Sections block's
  // "Auto-sort specification groups" field): true asks the provider to order
  // its groups for the tightest column fill rather than the author's order.
  // A hint, not a contract - a provider with no notion of groups ignores it.
  autoSort?: boolean
}

// The shape a module registers at this point.
//
// `Panel` is handed down through the RSC boundary as a prop, so it MUST carry its
// own 'use client' boundary: a server component cannot be passed that way, and
// the tab strip is a client island. `load` runs server-side only and is never
// passed anywhere - a function cannot cross that boundary.
export type ShopDetailSpecProvider = {
  // Everything this provider holds for the product, resolved while the page
  // renders so a replaced Specification is in the first HTML rather than in a
  // fetch behind it.
  //
  // Return null for "nothing for this product" and shop keeps its own facts
  // table - the common case on a site where only some products carry spec
  // content, so it costs no takeover. The return value crosses to the browser,
  // so it must be JSON-serialisable.
  load: (productId: string) => Promise<unknown>
  Panel: ComponentType<ShopDetailSpecPanelProps>
}

// One resolved provider plus its payload, ready for the Specification tab to
// render. Null on a shop-only site and for any product no provider claimed,
// where the tab renders shop's own facts table exactly as before.
export type ShopDetailSpecExtra = {
  id: string
  payload: unknown
  Panel: ComponentType<ShopDetailSpecPanelProps>
}

type ExtensionPointEntry = { point: string; id: string }

const POINT = 'shop.product-detail-spec'

/**
 * Resolved once per product page, in ShopProductDetail.rsc.tsx, and carried to
 * the detail parts on the injected context - the parts render synchronously, so
 * this cannot happen inside one. Returns null on a shop-only site and for any
 * product no provider has anything for, where the Specification tab renders
 * shop's own facts table.
 *
 * First provider with a non-null payload wins; the rest are not consulted. A
 * provider whose `load` throws is dropped rather than taking the product page
 * down with it - a page that still sells the product beats a 500 over a spec
 * table - and the failure is logged so it is not silent.
 */
export async function resolveShopDetailSpec(productId: string): Promise<ShopDetailSpecExtra | null> {
  const providers = moduleExtensionPointComponents[POINT] ?? {}
  if (Object.keys(providers).length === 0) return null

  const modules = await getInstalledManifests()

  for (const mod of modules) {
    const manifest = mod.manifest as { extensionPoints?: ExtensionPointEntry[] } | null
    if (!manifest?.extensionPoints) continue
    for (const entry of manifest.extensionPoints) {
      if (entry.point !== POINT) continue
      const provider = providers[entry.id] as ShopDetailSpecProvider | undefined
      if (!provider) continue
      try {
        const payload = await provider.load(productId)
        if (payload == null) continue
        return { id: entry.id, payload, Panel: provider.Panel }
      } catch (error) {
        console.error(`[shop] product-detail-spec provider "${entry.id}" failed to load for product ${productId}:`, error)
      }
    }
  }
  return null
}
