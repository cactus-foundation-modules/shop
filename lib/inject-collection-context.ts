import type { PuckData } from '@/modules/shop/lib/types'

const COLLECTION_CONTEXT_BLOCKS = new Set(['ShopCollectionHeader', 'ShopProductGrid'])

type CollectionContext = { collectionSlug: string }

// The 'shopCollection' layout's blocks have no per-instance collection slug
// of their own (they're a shared template rendered for every collection) -
// the collection page injects the current collection's slug into each of
// these block types' props right before rendering, mirroring Directory's
// inject-category-context.ts.
function injectBlocks(blocks: unknown[], ctx: CollectionContext): void {
  for (const item of blocks) {
    if (!item || typeof item !== 'object') continue
    const block = item as { type?: string; props?: Record<string, unknown> }
    if (block.type && COLLECTION_CONTEXT_BLOCKS.has(block.type) && block.props) {
      block.props.collectionSlug = ctx.collectionSlug
    }
    if (block.props) {
      for (const value of Object.values(block.props)) {
        if (Array.isArray(value)) injectBlocks(value, ctx)
      }
    }
  }
}

export function injectCollectionContext(data: PuckData, ctx: CollectionContext): PuckData {
  const cloned = JSON.parse(JSON.stringify(data)) as PuckData
  const content = Array.isArray(cloned.content) ? cloned.content : []
  const zoneBlocks = Object.values(cloned.zones ?? {}).flatMap((z) => (Array.isArray(z) ? z : []))
  injectBlocks([...content, ...zoneBlocks], ctx)
  return cloned
}
