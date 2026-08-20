// What order a product card's carousel goes in, once a companion module has
// added pictures of its own through `shop.card-media`.
//
// It used to be a concatenation - the product's own photographs, then everything
// contributed - with `leadImages` as the one escape hatch for "put this in front
// of the lot". That is the wrong shape now the owner arranges both sets together
// in the product editor's Images grid: a variation dragged into second place
// belongs second on the tile too, which is the picture the hover-swap reveals and
// the first one the arrows reach. Concatenating buried it behind every one of the
// product's own photographs, so the tile and the page it opened disagreed.
//
// So a contributed picture carries `position`: its index in the FINISHED
// carousel, the product's own counted in. No position means "after the product's
// own", which is right for a supplementary variation colour and is what every
// contribution did before positions existed.
//
// Kept apart from card-template.tsx so it can be tested without dragging in
// Prisma and the Puck renderer - the same reason shop-variations keeps its own
// copy of this rule in lib/gallery-order.ts. The two must agree: the tile and the
// product page are the same arrangement drawn twice.
import type { PartImage } from '@/modules/shop/components/puck/parts/part-context'

/**
 * The product's own pictures with the contributed ones folded in at the slots
 * they asked for, deduped by url (first occurrence wins, so the requested order
 * stands and a variation whose photo is also the parent's primary appears once).
 *
 * Forgiving rather than exact: a picture asking for slot 7 of a four-picture card
 * lands at the end, and deleting one of the product's own shuffles the rest up.
 * Anything stricter would need the product's images and the contributing module
 * to write to each other every time either changed.
 *
 * `lead` is the older `ShopCardMediaPayload.leadImages` - "in front of the
 * product's own". With no positions of their own those simply claim slots 0..n,
 * so a module built against the previous contract leads exactly as it did.
 */
export function mergeCardImages(own: PartImage[], contributed: PartImage[], lead: PartImage[] = []): PartImage[] {
  const placed = [
    ...lead.map((im, i) => (im.position == null ? { ...im, position: i } : im)),
    ...contributed,
  ]
    .map((im, index) => ({ im, index }))
    .sort((a, b) => (
      (a.im.position ?? Number.POSITIVE_INFINITY) - (b.im.position ?? Number.POSITIVE_INFINITY)
      || a.index - b.index
    ))

  const images: PartImage[] = []
  const seen = new Set<string>()
  const push = (im: PartImage) => {
    if (seen.has(im.url)) return
    seen.add(im.url)
    images.push(im)
  }

  let nextOwn = 0
  for (const { im } of placed) {
    const target = im.position ?? Number.POSITIVE_INFINITY
    // Measured against `images.length`, not a running counter: a picture dropped
    // by the dedupe must not eat a slot, or everything after it drifts forward.
    while (nextOwn < own.length && images.length < target) push(own[nextOwn++]!)
    push(im)
  }
  while (nextOwn < own.length) push(own[nextOwn++]!)
  return images
}
