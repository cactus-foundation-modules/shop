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

// Shop's own card parts. A companion module may register card parts of its own
// against the `shopProductCard` layout type (shop-variations puts a colour/size
// summary there), and those need the same context or they render their editor
// skeleton on the live storefront - so the caller passes their block types in and
// they are added to this set. Kept as a floor rather than replaced by the caller's
// list, so shop's own parts still work on a surface that has not been rebuilt.
const CARD_PART_TYPES = [
  'ShopCardImage',
  'ShopCardBadge',
  'ShopCardName',
  'ShopCardPrice',
  'ShopCardBlurb',
  'ShopCardCta',
]

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

// `extraPartTypes` is every block type registered against the `shopProductCard`
// layout type, which the caller already has to hand from the Puck config it
// renders with. Passing it rather than reading the generated module registry here
// keeps this file free of an import cycle (that registry pulls in the very
// surfaces that call this).
export function injectShopProductCardEmbed(data: PuckData, ctx: CardPartContext, extraPartTypes?: readonly string[]): PuckData {
  return inject(data, new Set([...CARD_PART_TYPES, ...(extraPartTypes ?? [])]), ctx)
}
