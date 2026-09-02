import type { PuckData } from '@/modules/shop/lib/types'

// Every block in a 'shopSupplier' layout that needs to know which supplier is
// being shown. The grids all take a `supplierSlug` of their own for use elsewhere
// on the site; on this layout it is filled in for them, so one layout serves
// every supplier. The two filter grids belong to other modules and are named as
// strings, which is the only way a module may refer to another's block - shop
// does not import them and does not care whether they are installed.
const SUPPLIER_CONTEXT_BLOCKS = new Set([
  'ShopSupplierHeader',
  'ShopSupplierDescription',
  'ShopProductGrid',
  'ShopFilterGrid',
  'ShopAttributeFilterGrid',
])

type SupplierContext = {
  /** Which page of a paged grid to render, from `?page=` (1 unless asked). */
  page?: number
  supplierSlug: string
}

// Twin of inject-tag-context.ts beside it: the 'shopSupplier' layout's blocks
// have no per-instance supplier of their own (they are a shared template
// rendered for every supplier), so the supplier page injects the current
// supplier's slug into each of these block types' props right before rendering.
function injectBlocks(blocks: unknown[], ctx: SupplierContext): void {
  for (const item of blocks) {
    if (!item || typeof item !== 'object') continue
    const block = item as { type?: string; props?: Record<string, unknown> }
    if (block.type && SUPPLIER_CONTEXT_BLOCKS.has(block.type) && block.props) {
      block.props.supplierSlug = ctx.supplierSlug
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

export function injectSupplierContext(data: PuckData, ctx: SupplierContext): PuckData {
  const cloned = JSON.parse(JSON.stringify(data)) as PuckData
  const content = Array.isArray(cloned.content) ? cloned.content : []
  const zoneBlocks = Object.values(cloned.zones ?? {}).flatMap((z) => (Array.isArray(z) ? z : []))
  injectBlocks([...content, ...zoneBlocks], ctx)
  return cloned
}
