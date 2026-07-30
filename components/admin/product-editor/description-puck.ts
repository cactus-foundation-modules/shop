import type { PuckData } from '@/modules/shop/lib/types'

// A per-product designed description, edited with the full-screen pop-out Puck
// builder (components/admin/description-builder). The layout type is deliberately
// one nothing registers blocks against, so the config is core's shared content
// parts only (headings, text, images, columns, callouts) with a bare root - no
// site header/footer/menu chrome. Same shared parts drive the storefront render,
// so editor and frontend markup match automatically.
export const DESCRIPTION_LAYOUT_TYPE = 'shopProductDescription'

// Same-origin channel the full-screen pop-out uses to tell an open product editor
// that it has just saved a new description, so the editor adopts it instead of
// later overwriting it with the copy it loaded. One channel for every product;
// messages carry the product id and the receiver filters on it.
export const DESCRIPTION_SYNC_CHANNEL = 'cactus:shop:product-description'

export type DescriptionSyncMessage = { productId: string; descriptionPuck: PuckData | null }

/** Broadcast a just-saved description to any open product editor for this product. */
export function broadcastDescriptionSaved(productId: string, descriptionPuck: PuckData | null): void {
  if (typeof BroadcastChannel === 'undefined') return
  const channel = new BroadcastChannel(DESCRIPTION_SYNC_CHANNEL)
  try {
    channel.postMessage({ productId, descriptionPuck } satisfies DescriptionSyncMessage)
  } finally {
    channel.close()
  }
}
