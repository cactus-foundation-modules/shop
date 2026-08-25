import type { PuckData } from '@/modules/shop/lib/types'

// Every block in a 'shopCollection' layout that needs to know which collection
// is being shown. The two filter grids belong to other modules and are named as
// strings, which is the only way a module may refer to another's block - shop
// does not import them and does not care whether they are installed. Same
// arrangement as inject-tag-context.ts beside it.
const COLLECTION_CONTEXT_BLOCKS = new Set([
  'ShopCollectionHeader',
  'ShopCollectionDescription',
  'ShopProductGrid',
  'ShopFilterGrid',
  'ShopAttributeFilterGrid',
])

type CollectionContext = {
  /** Which page of a paged grid to render, from `?page=` (1 unless asked). */
  page?: number
  collectionSlug: string }

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
    if ((block.type === 'ShopProductGrid' || block.type === 'ShopFilterGrid') && block.props && ctx.page != null) {
      block.props.page = ctx.page
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
