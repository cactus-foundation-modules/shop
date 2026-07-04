import type { PuckData } from '@/modules/shop/lib/types'

const PRODUCT_CONTEXT_BLOCKS = new Set(['ShopProductDetail', 'ShopRelatedProducts', 'ShopUpsellProducts', 'ShopBackInStockForm'])

// The 'product' page layout's blocks have no per-instance product slug of
// their own (they're a shared template rendered for every product) - the
// product detail page injects the current slug into each of these block
// types' props right before rendering, mirroring core's resolveTemplateData
// context-injection pattern (lib/puck/resolveTemplateData.ts) for MenuBlock etc.
function injectBlocks(blocks: unknown[], productSlug: string, productId: string, inStock: boolean): void {
  for (const item of blocks) {
    if (!item || typeof item !== 'object') continue
    const block = item as { type?: string; props?: Record<string, unknown> }
    if (block.type && PRODUCT_CONTEXT_BLOCKS.has(block.type) && block.props) {
      block.props.productSlug = productSlug
      block.props.productId = productId
      block.props.inStock = inStock
    }
    if (block.props) {
      for (const value of Object.values(block.props)) {
        if (Array.isArray(value)) injectBlocks(value, productSlug, productId, inStock)
      }
    }
  }
}

export function injectProductContext(data: PuckData, productSlug: string, productId: string, inStock: boolean): PuckData {
  const cloned = JSON.parse(JSON.stringify(data)) as PuckData
  const content = Array.isArray(cloned.content) ? cloned.content : []
  const zoneBlocks = Object.values(cloned.zones ?? {}).flatMap((z) => (Array.isArray(z) ? z : []))
  injectBlocks([...content, ...zoneBlocks], productSlug, productId, inStock)
  return cloned
}
