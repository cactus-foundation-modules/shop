import type { PuckData } from '@/modules/shop/lib/types'
import type { DetailPartContext, CardPartContext } from '@/modules/shop/components/puck/parts/part-context'

// Attaches already-loaded product context onto the part-blocks inside a saved
// Product Detail / Product Card template, so each part renders its slice with no
// per-part re-fetch. Mirrors inject-product-context.ts (the page-level product
// injector), but writes a single `_ctx` object rather than a slug the block then
// re-queries. The template is cloned first (pure JSON), then `_ctx` is attached
// by reference - keeping Date fields on the product intact (JSON.stringify would
// otherwise flatten them) and sharing one context object across every part.

const DETAIL_PART_TYPES = new Set([
  'ShopDetailGallery',
  'ShopDetailBadges',
  'ShopDetailTitle',
  'ShopDetailSku',
  'ShopDetailPrice',
  'ShopDetailBlurb',
  'ShopDetailPreorder',
  'ShopDetailAddToCart',
  'ShopDetailReassure',
  'ShopDetailTabs',
  'ShopDetailSections',
  'ShopDetailSectionNav',
])

const CARD_PART_TYPES = new Set([
  'ShopCardImage',
  'ShopCardBadge',
  'ShopCardName',
  'ShopCardPrice',
  'ShopCardBlurb',
  'ShopCardCta',
])

function attach(blocks: unknown[], partTypes: Set<string>, ctx: unknown): void {
  for (const item of blocks) {
    if (!item || typeof item !== 'object') continue
    const block = item as { type?: string; props?: Record<string, unknown> }
    if (block.type && block.props && partTypes.has(block.type)) {
      block.props._ctx = ctx
    }
    if (block.props) {
      for (const [key, value] of Object.entries(block.props)) {
        // Recurse into nested slot arrays (Split/Section/Group/Grid zones), but
        // never into the injected context we just attached.
        if (key !== '_ctx' && Array.isArray(value)) attach(value, partTypes, ctx)
      }
    }
  }
}

function inject(data: PuckData, partTypes: Set<string>, ctx: unknown): PuckData {
  const cloned = JSON.parse(JSON.stringify(data)) as PuckData
  const content = Array.isArray(cloned.content) ? cloned.content : []
  const zoneBlocks = Object.values(cloned.zones ?? {}).flatMap((z) => (Array.isArray(z) ? z : []))
  attach([...content, ...zoneBlocks], partTypes, ctx)
  return cloned
}

export function injectShopProductDetailEmbed(data: PuckData, ctx: DetailPartContext): PuckData {
  return inject(data, DETAIL_PART_TYPES, ctx)
}

export function injectShopProductCardEmbed(data: PuckData, ctx: CardPartContext): PuckData {
  return inject(data, CARD_PART_TYPES, ctx)
}
