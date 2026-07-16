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
import type { ShpProduct } from '@/modules/shop/lib/types'

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
}

export type ShopDetailGallerySlotProps = SlotBase & {
  classNames: ShopDetailGalleryClassNames
  productName: string
  // The product's own gallery, already loaded server-side. A provider should
  // render these straight away and only swap once the shopper's choice brings
  // its own image, so a claimed product paints its picture on first byte rather
  // than after a fetch.
  images: ShopDetailSlotImage[]
  // The layout author's own choices on shop's Gallery part, passed through so a
  // replaced gallery honours them too.
  shape?: string
  thumbPosition?: string
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

export type ShopDetailPartsProvider = {
  // True when this provider owns how the product is priced and bought. Called
  // once per product page render, never per part.
  claimsProduct: (product: ShpProduct) => Promise<boolean> | boolean
  Gallery?: ComponentType<ShopDetailGallerySlotProps>
  Price?: ComponentType<ShopDetailPriceSlotProps>
  PurchaseArea?: ComponentType<ShopDetailPurchaseSlotProps>
}

// What the parts actually see: the components of the provider that claimed this
// product, or null on a shop-only site (and on every unclaimed product), in
// which case every part renders shop's own markup exactly as before.
export type ShopDetailSlot = Omit<ShopDetailPartsProvider, 'claimsProduct'>

type ExtensionPointEntry = { point: string; id: string; permission?: string }

const POINT = 'shop.product-detail-parts'

// First claiming provider wins. Two modules both claiming one product would mean
// two answers to "what does this cost", so the order of the active-modules query
// decides rather than merging them.
export async function resolveShopDetailSlot(product: ShpProduct): Promise<ShopDetailSlot | null> {
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
      if (await provider.claimsProduct(product)) {
        const { Gallery, Price, PurchaseArea } = provider
        return { Gallery, Price, PurchaseArea }
      }
    }
  }
  return null
}
