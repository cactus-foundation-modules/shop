import { getInstalledManifests } from '@/lib/modules/live-status'
import { modulePublicExtensionPointComponents as moduleExtensionPointComponents } from '@/lib/modules/extension-points.public'
import type { ShopCollectionIndexSource } from '@/modules/shop/lib/collection-index-sources-shared'

// A generic way for another module to fold its own collection-shaped pages into
// the Collection Browser's list, so an index of "everything to browse by" can
// carry more than the shop's own collections.
//
// Nothing here knows what those pages are. A provider hands back finished card
// items - name, blurb, cover, and the address to send a shopper to - and the
// block prints them beside its own with the same card. The block grows one
// Yes/No field per registered provider, so an install with no such module sees
// exactly the sidebar it saw before: see resolveFields in
// components/puck/ShopCollectionBrowser.tsx.

export const COLLECTION_INDEX_SOURCE_POINT = 'shop.collection-index-sources'

export type { ShopCollectionIndexItem, ShopCollectionIndexSource } from '@/modules/shop/lib/collection-index-sources-shared'
export { collectionIndexSourceProp } from '@/modules/shop/lib/collection-index-sources-shared'

type ManifestEntry = { point: string; id: string; label?: string }

/**
 * Sources registered by active modules, in registry order. Resolved from the
 * stored manifests rather than the generated map alone, so a module present on
 * disk but not installed contributes nothing - the same shape
 * resolveProductFieldProviders uses.
 */
export async function resolveCollectionIndexSources(): Promise<Array<{
  id: string
  label: string
  source: ShopCollectionIndexSource
}>> {
  const modules = await getInstalledManifests()
  const components = moduleExtensionPointComponents[COLLECTION_INDEX_SOURCE_POINT] ?? {}
  const out: Array<{ id: string; label: string; source: ShopCollectionIndexSource }> = []
  const seen = new Set<string>()
  for (const mod of modules) {
    const manifest = mod.manifest as { extensionPoints?: ManifestEntry[] } | null
    for (const entry of manifest?.extensionPoints ?? []) {
      if (entry.point !== COLLECTION_INDEX_SOURCE_POINT || seen.has(entry.id)) continue
      const source = components[entry.id] as ShopCollectionIndexSource | undefined
      if (source) {
        out.push({ id: entry.id, label: entry.label || entry.id, source })
        seen.add(entry.id)
      }
    }
  }
  return out
}
