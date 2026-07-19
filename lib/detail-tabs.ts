// Server-side resolver for the `shop.product-detail-tabs` extension point. A
// companion module may contribute a tab to the product page's tab strip - a list
// of downloadable manuals, say - which then sits beside Description and
// Specification rather than in a panel of its own further down the page.
//
// Shop learns nothing about what a tab holds: it supplies the strip, the panel
// and the styling, and the provider fills them. Same bargain as gallery-media.
//
// Additive, like `shop.gallery-media` and unlike `shop.product-detail-parts`.
// Nothing here replaces a tab of shop's, so there is no two-answers-to-one-
// question failure to design around: several modules contributing at once simply
// means several more tabs, and every provider is resolved rather than only the
// first.
import type { ComponentType } from 'react'
import { prisma } from '@/lib/db/prisma'
import { INSTALLED_MODULE_WHERE } from '@/lib/modules/live-status'
import { moduleExtensionPointComponents } from '@/lib/modules/extension-points'

// What the strip hands the provider's panel. Rendered inside shop's own
// `.spd-panel`, so a contributed tab is dressed by the layout it sits in rather
// than by the module that supplied it.
export type ShopDetailTabPanelProps = {
  // Whatever the provider's `load` returned, passed back untouched. Shop treats
  // it as opaque: it crosses the RSC boundary, so it must be JSON-serialisable,
  // and that is the only thing shop asks of it.
  payload: unknown
}

// The shape a module registers at this point.
//
// `Panel` is handed down through the RSC boundary as a prop, so it MUST carry its
// own 'use client' boundary: a server component cannot be passed that way, and
// the tab strip is a client island. `load` runs server-side only and is never
// passed anywhere - a function cannot cross that boundary.
export type ShopDetailTabProvider = {
  // The tab's name in the strip.
  //
  // Declared here in code rather than in the manifest, unlike the product
  // editor's tabs, and for a reason worth writing down: the manifest's `label` is
  // stripped by the install-time schema and only restored on the next deploy, so
  // a manifest-labelled tab spends its first week named after its own id. A
  // provider object is always fully present, so its label always is too.
  //
  // Shop's own tabs are Description, Specification, Dimensions and - on digital
  // products - Downloads. A provider choosing one of those names leaves the
  // shopper with two tabs called the same thing, so pick another.
  label: string
  // Where the tab sits. Shop's own run 10 (Description), 20 (Specification),
  // 30 (Dimensions) and 40 (Downloads); a provider that says nothing lands after
  // the lot.
  order?: number
  // Everything this provider holds for the product, resolved while the page
  // renders so a contributed tab is in the first HTML rather than in a fetch
  // behind it.
  //
  // Return null for "nothing for this product" and no tab appears at all - the
  // common case on a site where only some products carry extras, so it costs no
  // markup. The return value crosses to the browser, so it must be
  // JSON-serialisable.
  load: (productId: string) => Promise<unknown>
  Panel: ComponentType<ShopDetailTabPanelProps>
}

// One resolved provider plus its payload, ready for the tabs part to render.
export type ShopDetailTabExtra = {
  id: string
  label: string
  order: number
  payload: unknown
  Panel: ComponentType<ShopDetailTabPanelProps>
}

type ExtensionPointEntry = { point: string; id: string }

const POINT = 'shop.product-detail-tabs'

// Where a contributed tab lands when its provider does not say: after every tab
// of shop's own. A module's tab is an addition to the page the shopper came for,
// not a replacement for the description of it.
const DEFAULT_ORDER = 50

/**
 * Resolved once per product page, in ShopProductDetail.rsc.tsx, and carried to
 * the tabs part on the injected context - the parts render synchronously, so
 * this cannot happen inside one. Returns [] on a shop-only site and for any
 * product no provider has anything for, where the strip renders exactly as
 * before.
 *
 * A provider whose `load` throws is dropped rather than taking the product page
 * down with it: an extra tab is a bonus, and a page that still sells the product
 * beats a 500. The failure is logged so it is not silent.
 */
export async function resolveShopDetailTabs(productId: string): Promise<ShopDetailTabExtra[]> {
  const providers = moduleExtensionPointComponents[POINT] ?? {}
  if (Object.keys(providers).length === 0) return []

  const modules = await prisma.module.findMany({
    where: { ...INSTALLED_MODULE_WHERE },
    select: { manifest: true },
  })

  const resolved: ShopDetailTabExtra[] = []
  for (const mod of modules) {
    const manifest = mod.manifest as { extensionPoints?: ExtensionPointEntry[] } | null
    if (!manifest?.extensionPoints) continue
    for (const entry of manifest.extensionPoints) {
      if (entry.point !== POINT) continue
      const provider = providers[entry.id] as ShopDetailTabProvider | undefined
      if (!provider) continue
      try {
        const payload = await provider.load(productId)
        if (payload == null) continue
        resolved.push({
          id: entry.id,
          label: provider.label,
          order: provider.order ?? DEFAULT_ORDER,
          payload,
          Panel: provider.Panel,
        })
      } catch (error) {
        console.error(`[shop] product-detail-tabs provider "${entry.id}" failed to load for product ${productId}:`, error)
      }
    }
  }
  return resolved
}
