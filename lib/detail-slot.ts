// Server-side resolver for the `shop.product-detail-parts` extension point. Shop
// stays generic: it knows nothing about options, variants or personalisation,
// only that a companion module may claim a product and take over three parts of
// the Product Detail layout (gallery, price, purchase area) for it.
//
// Precedent: shop.cart-line-resolver -> lib/line-meta.ts. Like that one, the
// provider is discovered through the active modules' manifests and stored in the
// generated moduleExtensionPointComponents map. `claimsProduct` MUST be
// server-safe (it runs inside ShopProductDetail.rsc.tsx); the three components
// are rendered into the RSC tree, so they carry their own 'use client' boundary.
//
// Why replace rather than sit alongside: a claimed product's price, stock and
// image all depend on the shopper's chosen combination, which shop cannot know.
// Rendering both shop's static part and the provider's live one would show the
// shopper two prices and two buttons.
import type { ComponentType } from 'react'
import { prisma } from '@/lib/db/prisma'
import { moduleExtensionPointComponents } from '@/lib/modules/extension-points'
import type { ShopGalleryExtra } from '@/modules/shop/lib/gallery-media'
import type { PuckData, ShpProduct } from '@/modules/shop/lib/types'

// Handed to every slot component so a replaced part is styled by the layout it
// sits in, not by the module that supplied it. The provider renders shop's own
// class names onto its own markup, which keeps the swap invisible to the shopper
// and leaves shop the single owner of the detail chrome.
export type ShopDetailGalleryClassNames = {
  col: string
  stage: string
  image: string
  thumbs: string
  thumb: string
  thumbOn: string
}

export type ShopDetailPriceClassNames = {
  block: string
  now: string
  was: string
  save: string
}

export type ShopDetailPurchaseClassNames = {
  row: string
  stepper: string
  add: string
  outOfStock: string
}

// Structurally the same as the parts' own PartImage; declared here so the slot
// contract stands on its own rather than importing back from part-context.ts.
export type ShopDetailSlotImage = { url: string; alt: string }

type SlotBase = {
  slug: string
  productId: string
  currencySymbol: string
  // Every block type present in the layout this part sits in. Shop reports the
  // fact and reads nothing into it; a provider uses it to stand down the pieces
  // of a slot the author has already placed as blocks of the provider's own (an
  // options picker dropped in by hand, say), which is the finer-grained cousin
  // of `coveredSlots` below.
  layoutBlockTypes: string[]
}

export type ShopDetailGallerySlotProps = SlotBase & {
  classNames: ShopDetailGalleryClassNames
  productName: string
  // The product's own gallery, already loaded server-side. A provider should
  // render these straight away and only swap once the shopper's choice brings
  // its own image, so a claimed product paints its picture on first byte rather
  // than after a fetch.
  images: ShopDetailSlotImage[]
  // The layout author's own choice on shop's Gallery part, passed through so a
  // replaced gallery honours it too. The stage's shape used to be one of these;
  // it is square for every product now, and lives in shop's `.spd-stage` CSS,
  // which a provider is handed through `classNames` - so a replacing gallery
  // gets the ratio for free rather than being trusted to reproduce it.
  thumbPosition?: string
  // The shop-wide "magnify the image under the pointer" setting. A provider that
  // leaves this alone simply shows a plain image, which is what shop's own
  // gallery does when it's off.
  zoom?: boolean
  // Extra gallery items contributed through `shop.gallery-media` (a 3D model,
  // say), already resolved server-side. A replacing gallery is the only thing
  // rendering a strip for this product, so it owns showing these too - ignore
  // them and installing the contributing module would quietly do nothing on
  // exactly the products this provider claimed. See lib/gallery-media.ts for how
  // a host renders them; ProductGallery does the same job for unclaimed products.
  // extra thumbnail rendering, and passes each one the chosen combination's child
  // product id - which is the provider's own knowledge, not shop's, and the whole
  // reason this is handed over rather than rendered by shop around the outside.
  extras?: ShopGalleryExtra[]
}

export type ShopDetailPriceSlotProps = SlotBase & {
  classNames: ShopDetailPriceClassNames
  // The parent product's own prices (decimal-pound strings, as the query layer
  // surfaces them). Render `basePrice` until the shopper's choice resolves, so
  // the price is never blank. `compareAtPrice`/`savePct` describe the parent
  // only - shop models no per-combination "was" price - so a provider must drop
  // them once the live price stops matching `basePrice`, or it would advertise a
  // saving against the wrong number.
  basePrice: string
  compareAtPrice: string | null
  savePct: number | null
  showCompare: boolean
  showSave: boolean
}

export type ShopDetailPurchaseSlotProps = SlotBase & {
  classNames: ShopDetailPurchaseClassNames
  showStepper: boolean
  label: string
}

export type ShopDetailSlotName = 'Gallery' | 'Price' | 'PurchaseArea'

export type ShopDetailPartsProvider = {
  // True when this provider owns how the product is priced and bought. Called
  // once per product page render, never per part.
  claimsProduct: (product: ShpProduct) => Promise<boolean> | boolean
  // Which jobs the layout ALREADY does with blocks of the provider's own. Shop
  // hands over the block types it found in the layout and gets back the slots to
  // leave alone; it never learns which type means what, which is the whole point
  // - shop still knows nothing about options.
  //
  // Shop then renders NOTHING for a covered slot, rather than falling back to
  // its own part. Falling back is what looks like the safe choice and is not: a
  // layout holding both shop's Price and the provider's own price block would
  // show the parent's static price next to the chosen combination's, so the
  // shopper reads two different prices for the one product. The author placed
  // the provider's block for that job deliberately; it wins outright.
  coveredSlots?: (blockTypes: Set<string>) => ShopDetailSlotName[]
  Gallery?: ComponentType<ShopDetailGallerySlotProps>
  Price?: ComponentType<ShopDetailPriceSlotProps>
  PurchaseArea?: ComponentType<ShopDetailPurchaseSlotProps>
}

// What the parts actually see: the components of the provider that claimed this
// product, or null on a shop-only site (and on every unclaimed product), in
// which case every part renders shop's own markup exactly as before.
export type ShopDetailSlot = Omit<ShopDetailPartsProvider, 'claimsProduct' | 'coveredSlots'> & {
  covered: ShopDetailSlotName[]
}

type ExtensionPointEntry = { point: string; id: string; permission?: string }

const POINT = 'shop.product-detail-parts'

// Narrowing is split off from resolving so the claim (which needs only the
// product) can still run alongside the template fetch, while this - pure and
// synchronous - runs once the template is in hand and its blocks are known.
export function narrowShopDetailSlot(
  provider: ShopDetailPartsProvider | null,
  blockTypes: Set<string>,
): ShopDetailSlot | null {
  if (!provider) return null
  const { Gallery, Price, PurchaseArea } = provider
  return { Gallery, Price, PurchaseArea, covered: provider.coveredSlots?.(blockTypes) ?? [] }
}

// Every block type in a saved layout, zones included, so a provider can see what
// the author has already placed. Structural blocks (Split, Section) nest their
// children in `zones`, so a Product Detail built the default way keeps all its
// parts there rather than in `content` - miss those and the check reads empty on
// exactly the layout it matters most for.
export function collectLayoutBlockTypes(data: PuckData): Set<string> {
  const types = new Set<string>()
  const walk = (blocks: unknown[]): void => {
    for (const item of blocks) {
      if (!item || typeof item !== 'object') continue
      const block = item as { type?: string; props?: Record<string, unknown> }
      if (block.type) types.add(block.type)
      for (const value of Object.values(block.props ?? {})) {
        if (Array.isArray(value)) walk(value)
      }
    }
  }
  walk(Array.isArray(data.content) ? data.content : [])
  for (const zone of Object.values(data.zones ?? {})) {
    if (Array.isArray(zone)) walk(zone)
  }
  return types
}

// First claiming provider wins. Two modules both claiming one product would mean
// two answers to "what does this cost", so the order of the active-modules query
// decides rather than merging them.
export async function resolveShopDetailProvider(product: ShpProduct): Promise<ShopDetailPartsProvider | null> {
  const providers = moduleExtensionPointComponents[POINT] ?? {}
  if (Object.keys(providers).length === 0) return null

  const modules = await prisma.module.findMany({
    where: { status: { in: ['active', 'update_available'] } },
    select: { manifest: true },
  })

  for (const mod of modules) {
    const manifest = mod.manifest as { extensionPoints?: ExtensionPointEntry[] } | null
    if (!manifest?.extensionPoints) continue
    for (const entry of manifest.extensionPoints) {
      if (entry.point !== POINT) continue
      const provider = providers[entry.id] as ShopDetailPartsProvider | undefined
      if (!provider) continue
      if (await provider.claimsProduct(product)) return provider
    }
  }
  return null
}
