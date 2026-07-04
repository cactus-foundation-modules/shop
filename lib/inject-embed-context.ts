import type { PuckData } from '@/modules/shop/lib/types'

// Maps the core "Embed Layout" block's option values onto the blocks inside a
// shopCategory layout when it's embedded on another page (e.g. the home info
// page). Mirrors inject-category-context.ts, but also carries the product
// `limit` option so the embed can show a fixed number of products.
//
// The core LayoutEmbed block is module-agnostic: it just hands us the option
// values it collected. All shop-specific "which prop goes where" knowledge
// stays here, in the shop module.
const CATEGORY_SLUG_BLOCKS = new Set(['ShopCategoryHeader', 'ShopProductGrid'])
const LIMIT_BLOCKS = new Set(['ShopProductGrid'])

type EmbedValues = { categorySlug?: string; limit?: number }

function injectBlocks(blocks: unknown[], values: EmbedValues): void {
  for (const item of blocks) {
    if (!item || typeof item !== 'object') continue
    const block = item as { type?: string; props?: Record<string, unknown> }
    if (block.type && block.props) {
      if (CATEGORY_SLUG_BLOCKS.has(block.type) && typeof values.categorySlug === 'string') {
        block.props.categorySlug = values.categorySlug
      }
      if (LIMIT_BLOCKS.has(block.type) && typeof values.limit === 'number') {
        block.props.limit = values.limit
      }
    }
    if (block.props) {
      for (const value of Object.values(block.props)) {
        if (Array.isArray(value)) injectBlocks(value, values)
      }
    }
  }
}

export function injectShopCategoryEmbed(data: PuckData, rawValues: Record<string, unknown>): PuckData {
  const values: EmbedValues = {
    categorySlug: typeof rawValues.categorySlug === 'string' ? rawValues.categorySlug : undefined,
    limit:
      typeof rawValues.limit === 'number'
        ? rawValues.limit
        : typeof rawValues.limit === 'string' && rawValues.limit.trim() !== ''
          ? Number(rawValues.limit)
          : undefined,
  }
  const cloned = JSON.parse(JSON.stringify(data)) as PuckData
  const content = Array.isArray(cloned.content) ? cloned.content : []
  const zoneBlocks = Object.values(cloned.zones ?? {}).flatMap((z) => (Array.isArray(z) ? z : []))
  injectBlocks([...content, ...zoneBlocks], values)
  return cloned
}
