// Server-side resolver for the `shop.product-social-image` extension point.
//
// The product page's social preview image (og:image) is the picture the page
// itself leads with. On a plain product that is its first photograph, which
// shop resolves on its own. But a module may be about to open the page on a
// particular configuration - a variation deep link, or option choices carried
// in the URL - whose gallery leads with a different picture. This point lets
// such a module say so: given the product about to render, hand back the
// absolute-or-site-relative image URL the page will actually open on, or null
// to decline. First non-null answer wins, in active-modules order.
//
// Pattern-copy of lib/product-page-resolver.ts (shop.product-page-resolver):
// providers are discovered through the active modules' manifests and the
// generated moduleExtensionPointComponents map, and `resolve` MUST be
// server-safe - it runs inside generateMetadata. A provider that needs the
// request's query string reads it from lib/product-page-params.ts.
import { getInstalledManifests } from '@/lib/modules/live-status'
import { moduleExtensionPointComponents } from '@/lib/modules/extension-points'
import type { ShpProduct } from '@/modules/shop/lib/types'

export type ShopProductSocialImageProvider = {
  // The image URL the product page will open on for this request, or null to
  // decline (shop then falls back to the product's own first photograph).
  resolve: (product: ShpProduct) => Promise<string | null> | string | null
}

type ExtensionPointEntry = { point: string; id: string }

const POINT = 'shop.product-social-image'

export async function resolveProductSocialImage(product: ShpProduct): Promise<string | null> {
  const providers = moduleExtensionPointComponents[POINT] ?? {}
  if (Object.keys(providers).length === 0) return null

  const modules = await getInstalledManifests()

  for (const mod of modules) {
    const manifest = mod.manifest as { extensionPoints?: ExtensionPointEntry[] } | null
    if (!manifest?.extensionPoints) continue
    for (const entry of manifest.extensionPoints) {
      if (entry.point !== POINT) continue
      const provider = providers[entry.id] as ShopProductSocialImageProvider | undefined
      if (!provider) continue
      const resolved = await provider.resolve(product)
      if (resolved) return resolved
    }
  }
  return null
}
