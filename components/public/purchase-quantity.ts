'use client'

// How many of the product the shopper is about to buy, published to the whole
// page.
//
// The figure lives in the stepper beside Add to basket, which is local state
// inside whichever component drew that row - shop's own AddToCartButton on a
// plain product, shop-variations' purchase slot on one with options. Another
// module's block has no way into either, and must not import them: an
// accessories box that needed the number would be reaching across two module
// boundaries to read a `useState`.
//
// So the seam is the same plain browser one the variation selection uses (see
// shop-variations' lib/selection-broadcast.ts): a window CustomEvent with a
// documented name, plus the latest detail parked on `window` so a block that
// mounts late does not have to wait for the shopper to touch the stepper before
// it knows where things stand.
//
//   Event:  'cactus-shop-purchase-quantity'
//   Detail: PurchaseQuantityDetail (below), also at
//           window.__cactusPurchaseQuantity
//
// `productId` is the LISTING - the parent product whose page this is - not the
// variation the options resolve to. A consumer keyed on the page's product (an
// add-ons box is) can then ignore a figure published by anything else, and the
// number stays meaningful while the shopper is still half way through choosing.
//
// Nothing here changes what gets bought: the stepper's own component still adds
// its own quantity. This is a read-only announcement for the rest of the page.

export const PURCHASE_QUANTITY_EVENT = 'cactus-shop-purchase-quantity'

export type PurchaseQuantityDetail = {
  // The listing (parent) product the stepper belongs to.
  productId: string
  // What the stepper reads right now. Always at least 1.
  quantity: number
}

declare global {
  interface Window {
    __cactusPurchaseQuantity?: PurchaseQuantityDetail
  }
}

// A page can carry more than one island publishing the same figure (the buy row
// and a sticky repeat of it). Only a real change is announced; the rest are
// dropped here rather than left for each consumer to filter.
let last: string | null = null

export function publishPurchaseQuantity(detail: PurchaseQuantityDetail): void {
  if (typeof window === 'undefined') return
  if (!detail.productId) return
  const clean: PurchaseQuantityDetail = {
    productId: detail.productId,
    quantity: Number.isFinite(detail.quantity) ? Math.max(1, Math.floor(detail.quantity)) : 1,
  }
  const encoded = JSON.stringify(clean)
  if (encoded === last) return
  last = encoded
  window.__cactusPurchaseQuantity = clean
  window.dispatchEvent(new CustomEvent<PurchaseQuantityDetail>(PURCHASE_QUANTITY_EVENT, { detail: clean }))
}

export function getPurchaseQuantity(): PurchaseQuantityDetail | null {
  if (typeof window === 'undefined') return null
  return window.__cactusPurchaseQuantity ?? null
}
