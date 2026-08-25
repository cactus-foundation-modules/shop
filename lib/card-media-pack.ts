// How a card's carousel pictures travel to the browser.
//
// The card image part hands ShopCardMedia every picture the carousel can reach:
// the product's own photos plus whatever a companion module folded in through
// `shop.card-media` (shop-variations contributes one per variation colour). That
// list is right - the arrows really do reach all of them - but the spelled-out
// version of it is enormous, because almost every byte repeats.
//
// Measured on deskwell.co.uk's office-chairs category, August 2026: twelve cards
// carrying 1,675 pictures between them, the worst single card carrying 539. Each
// picture was written as
//
//   {"url":"https://media.deskwell.co.uk/media/shop/office-chairs/computer-task-
//    chairs/eclipse-plus-medium-back-task-operator-office-chair/op000158_1.webp",
//    "alt":"Eclipse Plus Medium Back Task Operator Office Chair",
//    "sourceId":"561f5777-cf43-4400-889a-15c70ef50848"}
//
// and the only part of that which differed from the picture before it was the
// filename. The folder was written 539 times. So was the alt text. 483 KB of
// flight payload for twelve cards, which the browser must parse before the page
// is interactive.
//
// So the wire shape names the repeated parts once and points at them:
//
//   { f: [folder, ...], a: [alt, ...], i: [[folderIndex, filename, altIndex, ...]] }
//
// Same pictures, same order, same everything the carousel does with them - 97 KB
// instead of 483 KB on that page. The tables are per card rather than per page
// because a card's pictures nearly all share one folder and one alt, so a local
// table is already within a few bytes of a global one and needs no plumbing
// through the render tree to reach the one place that builds it.
//
// Lossless by construction: a url is split at its LAST slash and rejoined by
// concatenation, so whatever it was - absolute, root-relative, a data: uri with
// slashes in it, no slash at all - it comes back identical. The folder entry
// keeps its trailing slash precisely so the no-slash case rejoins to itself.

import type { PartImage } from '@/modules/shop/components/puck/parts/part-context'

// One picture. The trailing two are omitted when absent, which is the common
// case (a product's own photo has no sourceId, and only a contributed photo the
// contributing module marked `promoted` carries the flag).
//
// `promoted` is only ever meaningful alongside a sourceId - it says "this
// contributed photo already sits in the product page's gallery" - so it never
// appears without one, and the tuple never has a hole in it.
export type PackedImage =
  | [folder: number, file: string, alt: number]
  | [folder: number, file: string, alt: number, sourceId: string]
  | [folder: number, file: string, alt: number, sourceId: string, promoted: 1]

export type PackedImages = {
  // Folder prefixes, each INCLUDING its trailing slash.
  f: string[]
  // Distinct alt strings.
  a: string[]
  // The pictures, in the order the carousel flicks through them.
  i: PackedImage[]
}

export function packCardImages(images: PartImage[]): PackedImages {
  const f: string[] = []
  const a: string[] = []
  const folderAt = new Map<string, number>()
  const altAt = new Map<string, number>()
  const intern = (value: string, table: string[], index: Map<string, number>) => {
    let at = index.get(value)
    if (at === undefined) {
      at = table.push(value) - 1
      index.set(value, at)
    }
    return at
  }

  const i: PackedImage[] = images.map((image) => {
    const url = image.url ?? ''
    // +1 keeps the slash on the folder, so a url with no slash at all interns
    // the empty string and rejoins to exactly itself.
    const cut = url.lastIndexOf('/') + 1
    const folder = intern(url.slice(0, cut), f, folderAt)
    const alt = intern(image.alt ?? '', a, altAt)
    const file = url.slice(cut)
    if (!image.sourceId) return [folder, file, alt]
    if (image.promoted === true) return [folder, file, alt, image.sourceId, 1]
    return [folder, file, alt, image.sourceId]
  })

  return { f, a, i }
}

export function unpackCardImages(packed: PackedImages): PartImage[] {
  return packed.i.map(([folder, file, alt, sourceId, promoted]) => ({
    url: (packed.f[folder] ?? '') + file,
    alt: packed.a[alt] ?? '',
    ...(sourceId ? { sourceId } : {}),
    ...(promoted === 1 ? { promoted: true } : {}),
  }))
}
