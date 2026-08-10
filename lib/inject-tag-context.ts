import type { PuckData } from '@/modules/shop/lib/types'

// Every block in a 'shopTag' layout that needs to know which tag is being shown.
// The grids all take a `tagSlug` of their own for use elsewhere on the site; on
// this layout it is filled in for them, so one layout serves every tag. The two
// filter grids belong to other modules and are named as strings, which is the
// only way a module may refer to another's block - shop does not import them and
// does not care whether they are installed.
const TAG_CONTEXT_BLOCKS = new Set([
  'ShopTagHeader',
  'ShopProductGrid',
  'ShopFilterGrid',
  'ShopAttributeFilterGrid',
])

type TagContext = { tagSlug: string }

// The 'shopTag' layout's blocks have no per-instance tag of their own (they're a
// shared template rendered for every tag) - the tag page injects the current
// tag's slug into each of these block types' props right before rendering,
// mirroring inject-collection-context.ts beside it.
function injectBlocks(blocks: unknown[], ctx: TagContext): void {
  for (const item of blocks) {
    if (!item || typeof item !== 'object') continue
    const block = item as { type?: string; props?: Record<string, unknown> }
    if (block.type && TAG_CONTEXT_BLOCKS.has(block.type) && block.props) {
      block.props.tagSlug = ctx.tagSlug
    }
    if (block.props) {
      for (const value of Object.values(block.props)) {
        if (Array.isArray(value)) injectBlocks(value, ctx)
      }
    }
  }
}

export function injectTagContext(data: PuckData, ctx: TagContext): PuckData {
  const cloned = JSON.parse(JSON.stringify(data)) as PuckData
  const content = Array.isArray(cloned.content) ? cloned.content : []
  const zoneBlocks = Object.values(cloned.zones ?? {}).flatMap((z) => (Array.isArray(z) ? z : []))
  injectBlocks([...content, ...zoneBlocks], ctx)
  return cloned
}
