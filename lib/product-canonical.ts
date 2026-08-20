// Server-side resolver for the `shop.product-canonical-query` extension point.
//
// A product page's canonical is normally the bare product URL: option choices a
// shared link carries in the query string describe the same page, so folding
// them into one address is right, and was the whole point of the tag.
//
// It stops being right once a module can say "these parameters name a specific,
// buyable thing with its own picture and its own price, and I have published
// that address for indexing". This point lets it say so: given the product about
// to render and the query string this request arrived with (parked in
// lib/product-page-params.ts), a module may hand back the canonical query string
// for the configuration - normalised to its own spelling - or null to decline,
// in which case the bare product URL stands as before.
//
// Two things the answer has to be, and the variations provider is written to
// both: an address the page really does resolve to that configuration on, and
// the SAME address the module publishes in the sitemap. A canonical pointing at
// a URL nothing links to is worse than no canonical at all.
//
// Pattern-copy of lib/product-social-image.ts: providers are discovered through
// the active modules' manifests and the generated moduleExtensionPointComponents
// map, and `resolve` MUST be server-safe - it runs inside generateMetadata.
import { prisma } from '@/lib/db/prisma'
import { INSTALLED_MODULE_WHERE } from '@/lib/modules/live-status'
import { moduleExtensionPointComponents } from '@/lib/modules/extension-points'
import type { ShpProduct } from '@/modules/shop/lib/types'

export type ShopProductCanonicalQueryProvider = {
  // The canonical query string ('a=b&c=d', no leading '?') for the configuration
  // this request names, or null to decline - shop then keeps the bare product
  // URL as the canonical, exactly as it did before any of this existed.
  resolve: (product: ShpProduct) => Promise<string | null> | string | null
}

type ExtensionPointEntry = { point: string; id: string }

const POINT = 'shop.product-canonical-query'

export async function resolveProductCanonicalQuery(product: ShpProduct): Promise<string | null> {
  const providers = moduleExtensionPointComponents[POINT] ?? {}
  if (Object.keys(providers).length === 0) return null

  const modules = await prisma.module.findMany({
    where: { ...INSTALLED_MODULE_WHERE },
    select: { manifest: true },
  })

  for (const mod of modules) {
    const manifest = mod.manifest as { extensionPoints?: ExtensionPointEntry[] } | null
    if (!manifest?.extensionPoints) continue
    for (const entry of manifest.extensionPoints) {
      if (entry.point !== POINT) continue
      const provider = providers[entry.id] as ShopProductCanonicalQueryProvider | undefined
      if (!provider) continue
      const resolved = await provider.resolve(product)
      if (resolved) return resolved
    }
  }
  return null
}
