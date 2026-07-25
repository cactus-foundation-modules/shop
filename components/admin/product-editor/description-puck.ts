import { getModuleLayoutPuckConfig } from '@/lib/puck/config'
import { withImagePickerFields } from '@/lib/puck/MediaPickerField'
import type { PuckData } from '@/modules/shop/lib/types'

// A per-product designed description, edited with the full-screen pop-out Puck
// builder. The layout type is deliberately one nothing registers blocks against,
// so the config is core's shared content parts only (headings, text, images,
// columns, callouts) with a bare root - no site header/footer/menu chrome. Same
// shared parts drive the storefront render, so editor and frontend markup match
// automatically.
export const DESCRIPTION_LAYOUT_TYPE = 'shopProductDescription'

// Puck's minimal empty document. Seeded when the admin first chooses to design.
export const emptyDescriptionPuck: PuckData = { content: [], root: {} }

/**
 * The Puck config both description surfaces render through: core's shared content
 * parts with the media library wired into every image field, the same wrap the
 * core layout editor applies. Allocates a fresh object per call (Puck reinitialises
 * its left panel when the config identity changes), so callers should useMemo it.
 */
export function buildDescriptionConfig() {
  return withImagePickerFields(getModuleLayoutPuckConfig(DESCRIPTION_LAYOUT_TYPE))
}

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
