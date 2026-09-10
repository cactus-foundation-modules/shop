'use client'

// Putting a picture into the product's gallery from somewhere else on the
// Images tab.
//
// `gallery-extras.tsx` is for pictures another module OWNS and keeps - the
// variations module's promoted photographs, which live on the variation and are
// only shown here. This is the other case: a picture that is being HANDED OVER,
// to become one of the product's own photographs, indistinguishable from one
// added with the Add images button. Nothing to register, nothing to keep in
// step afterwards, no callbacks - the sender is finished the moment it lets go.
//
// The seam is a plain window CustomEvent rather than a hook, for the same reason
// the storefront's purchase-quantity bus is one: a contributor may have no
// dependency on shop at all. A module that publishes into
// `shop.product-editor-media-sections` renders inside this tab but need never
// import '@/modules/shop/...' - that path does not exist at build time on an
// install with no shop, so a module that works with or without one cannot have
// a static import of it anywhere in its graph.
//
//   Event:  'cactus-shop-product-gallery-add'
//   Detail: { images: [{ url, altText? }] }
//   Taken:  the Images tab calls preventDefault(), so dispatchEvent() returns
//           false. A sender that gets `true` back was not heard - nothing is
//           listening, or the shop is too old to know the event - and should
//           say so rather than pretend the picture landed.
//
// A url already in the gallery is ignored, so a sender may repeat itself
// harmlessly. Added pictures land at the END of the gallery as unsaved edits:
// the editor's own Save button is what writes them, exactly as with the picker.

export const GALLERY_ADD_EVENT = 'cactus-shop-product-gallery-add'

export type GalleryAddImage = { url: string, altText?: string | null }
export type GalleryAddDetail = { images: GalleryAddImage[] }

/**
 * Hand pictures to the product editor's Images tab. Returns true when the tab
 * took them, false when nothing was listening.
 */
export function addImagesToProductGallery(images: GalleryAddImage[]): boolean {
  if (typeof window === 'undefined' || images.length === 0) return false
  const event = new CustomEvent<GalleryAddDetail>(GALLERY_ADD_EVENT, { detail: { images }, cancelable: true })
  // dispatchEvent answers false when a listener called preventDefault, which is
  // how the tab says "these are mine now".
  return !window.dispatchEvent(event)
}
