// Basket lines with no product behind them.
//
// Every basket line is a product - except the one thing an owner quoting by hand
// needs most: "Installation, £180", "Delivery to the third floor, £60". Those are
// real money on a real order, and there is nothing in the catalogue to point at.
//
// So a module may publish lines of its own at the `shop.virtual-cart-product`
// extension point. The cart line carries an id starting `virtual:`, and the
// module that minted it answers for it: its name, price, tax class and SKU. Shop
// turns that answer into a product-shaped value for the length of one request,
// so every pass the basket already makes over its lines - pricing, tax, the
// order's own items - treats it like any other line, and nothing downstream
// needs a second code path.
//
// What keeps it honest:
//   - The answer is the MODULE's, worked out on the server from something the
//     shopper cannot write (a saved quote). The browser sends only the id.
//   - An id nobody answers for simply drops out of the basket, exactly as a
//     deleted product does.
//   - It never reaches the database as a product: the order item is written with
//     no product id (the column has always been nullable, for deleted products),
//     its stock is never counted, and it has no page to link to.
//
// The provider contract:
//   (ids: string[]) => Promise<VirtualCartProduct[]>
// Given every `virtual:` id in a basket at once, it returns the ones it owns and
// leaves the rest alone. Validate inside: shop takes what comes back as given.

import { gatherCartExtensionPoint } from '@/modules/shop/lib/line-meta'
import type { ShpProduct } from '@/modules/shop/lib/types'

export const VIRTUAL_PRODUCT_PREFIX = 'virtual:'

const POINT = 'shop.virtual-cart-product'

export type VirtualCartProduct = {
  /** The full id, prefix included, exactly as the basket line carries it. */
  id: string
  name: string
  sku: string | null
  /** Per unit, on the same side of tax as the shop's stored prices. */
  price: number
  taxClassId: string | null
}

export type VirtualCartProductProvider = (ids: string[]) => Promise<VirtualCartProduct[]> | VirtualCartProduct[]

export function isVirtualProductId(id: string | null | undefined): boolean {
  return typeof id === 'string' && id.startsWith(VIRTUAL_PRODUCT_PREFIX)
}

/** A line's product id as it should be WRITTEN anywhere it is stored as a
 *  reference to a real product row: null for a virtual one. */
export function storedProductId(id: string): string | null {
  return isVirtualProductId(id) ? null : id
}

/** The product-shaped value a virtual line travels as. Every field a real
 *  product row would give is filled with the answer that keeps it out of the
 *  way: active, untracked, no slug (so nothing links to it), never pre-order,
 *  no minimum. Typed in full rather than spread from a default so a field added
 *  to ShpProduct is a compile error here instead of an undefined at the till. */
export function virtualProductToShpProduct(v: VirtualCartProduct): ShpProduct {
  const epoch = new Date(0)
  return {
    id: v.id,
    name: v.name,
    slug: '',
    type: 'SERVICE',
    status: 'ACTIVE',
    description: null,
    descriptionPuck: null,
    shortDescription: null,
    sku: v.sku,
    saleSku: null,
    supplierSku: null,
    barcode: null,
    supplier: null,
    price: v.price.toFixed(2),
    salePrice: null,
    retailPrice: null,
    tradePrice: null,
    costPrice: null,
    taxClassId: v.taxClassId,
    trackInventory: false,
    stockCount: null,
    lowStockThreshold: null,
    outOfStockBehaviour: 'BACKORDER',
    weight: null,
    weightUnit: null,
    dimensionL: null,
    dimensionW: null,
    dimensionH: null,
    dimensionUnit: null,
    digitalFileId: null,
    downloadLimit: null,
    downloadExpiry: null,
    metaTitle: null,
    metaDescription: null,
    ogImageId: null,
    masterCategoryId: null,
    isPreOrder: false,
    preOrderDispatchDate: null,
    preOrderNote: null,
    preOrderMaxQuantity: null,
    preOrderCount: 0,
    minOrderQuantity: null,
    orderSizeDeduction: null,
    returnable: null,
    nonReturnableNote: null,
    returnsDiscretionary: null,
    relatedMode: 'MANUAL',
    upsellMode: 'MANUAL',
    relatedLimit: 0,
    upsellLimit: 0,
    catalogueHidden: true,
    partsOnly: false,
    featuredHidden: true,
    popularitySeed: null,
    popularity: null,
    faqs: { items: [], inherit: false },
    createdAt: epoch,
    updatedAt: epoch,
  }
}

/** Every virtual id in `ids` that some installed module answers for, as the
 *  product-shaped value the basket passes carry. One call per provider for the
 *  whole basket; a provider that throws is logged and treated as owning
 *  nothing, so one module's bad day costs only its own lines. */
export async function loadVirtualProducts(ids: string[]): Promise<Map<string, ShpProduct>> {
  const out = new Map<string, ShpProduct>()
  const wanted = [...new Set(ids.filter(isVirtualProductId))]
  if (wanted.length === 0) return out
  const providers = await gatherCartExtensionPoint<VirtualCartProductProvider>(POINT)
  for (const provide of providers) {
    const still = wanted.filter((id) => !out.has(id))
    if (still.length === 0) break
    try {
      const answered = await provide(still)
      for (const v of answered) {
        if (!still.includes(v.id) || !v.name || !Number.isFinite(v.price) || v.price < 0) continue
        out.set(v.id, virtualProductToShpProduct(v))
      }
    } catch (err) {
      console.error(`[${POINT}] provider failed`, err)
    }
  }
  return out
}
