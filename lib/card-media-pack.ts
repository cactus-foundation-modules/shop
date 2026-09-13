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
//
// TWO MORE FOLDS, September 2026, once variation photographs started reaching
// the cards in their hundreds. Measured on the deskwell.co.uk homepage, whose 48
// cards carried 719 KB of this shape:
//
// - The alt table stopped being "nearly all one alt". A variation's photo is
//   described by its product's name and its options - "Eclipse Plus Task Operator
//   Office Chair with Hi Rise Draughtsman Kit - Seat Height / No Arms / Quest Crab
//   / Black" - and one card had 348 of those, differing from each other only at
//   the end. Interning cannot help strings that are all different. So each entry
//   says only how much it shares with the entry before it and what comes after:
//   272 KB of alts became 64 KB.
// - Every contributed picture names its variation by id, a uuid spelled out in
//   thirty-six characters. The same id fits in twenty-two (lib/compact-id.ts),
//   which took another 62 KB off.
//
// 719 KB became 448 KB, and the carousel unfolds exactly the list it did before.
//
// Unfolding also still reads the shape this file wrote before either fold: an alt
// entry that is a plain string is that alt, and a uuid spelled out in full is not
// mistaken for a folded one. So a card rendered by the previous version is read
// correctly by this one.

import type { PartImage } from '@/modules/shop/components/puck/parts/part-context'
import { compactId, expandId } from '@/modules/shop/lib/compact-id'

// One picture. The trailing two are omitted when absent, which is the common
// case (a product's own photo has no sourceId, and only a contributed photo the
// contributing module marked `promoted` carries the flag).
//
// `promoted` is only ever meaningful alongside a sourceId - it says "this
// contributed photo already sits in the product page's gallery" - so it never
// appears without one, and the tuple never has a hole in it.
//
// `sourceId` is in its wire spelling (lib/compact-id.ts), not as the module wrote
// it.
export type PackedImage =
  | [folder: number, file: string, alt: number]
  | [folder: number, file: string, alt: number, sourceId: string]
  | [folder: number, file: string, alt: number, sourceId: string, promoted: 1]

// One entry in the alt table. A plain string is the alt as it is. A pair is the
// alt spelled against the entry immediately before it in the table: keep the
// first `shared` UTF-16 code units of that one and add `rest`.
export type PackedAlt = string | [shared: number, rest: string]

export type PackedImages = {
  // Folder prefixes, each INCLUDING its trailing slash.
  f: string[]
  // Distinct alt strings, each spelled against the one before it where that is
  // shorter - see PackedAlt.
  a: PackedAlt[]
  // The pictures, in the order the carousel flicks through them.
  i: PackedImage[]
}

// How many leading UTF-16 code units two strings share, never ending between the
// two halves of a surrogate pair. That is not tidiness: the rest of the alt would
// then start with half an emoji, and a lone half cannot be written as UTF-8 - a
// long enough string reaches the browser as raw text rather than escaped JSON,
// and the encoder swaps the half for a replacement character. The alt would come
// back with a question-mark diamond where the emoji was.
function sharedPrefixLength(previous: string, next: string): number {
  const limit = Math.min(previous.length, next.length)
  let shared = 0
  while (shared < limit && previous.charCodeAt(shared) === next.charCodeAt(shared)) shared++
  if (shared > 0 && shared < next.length) {
    const lastKept = next.charCodeAt(shared - 1)
    if (lastKept >= 0xd800 && lastKept <= 0xdbff) shared--
  }
  return shared
}

/** The alt table with each entry spelled against the one before it, wherever
 *  that comes out shorter than writing the alt in full. */
export function foldAltTable(alts: readonly string[]): PackedAlt[] {
  let previous = ''
  return alts.map((alt) => {
    const shared = sharedPrefixLength(previous, alt)
    previous = alt
    // The pair costs its brackets, its comma and the digits of the count on top
    // of the rest, so it is only worth it when it saves more than that.
    return shared > String(shared).length + 3 ? [shared, alt.slice(shared)] : alt
  })
}

/** The inverse of foldAltTable. */
export function unfoldAltTable(folded: readonly PackedAlt[]): string[] {
  const alts: string[] = []
  let previous = ''
  for (const entry of folded) {
    const alt = typeof entry === 'string' ? entry : previous.slice(0, entry[0]) + entry[1]
    alts.push(alt)
    previous = alt
  }
  return alts
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
    if (image.promoted === true) return [folder, file, alt, compactId(image.sourceId), 1]
    return [folder, file, alt, compactId(image.sourceId)]
  })

  return { f, a: foldAltTable(a), i }
}

export function unpackCardImages(packed: PackedImages): PartImage[] {
  const alts = unfoldAltTable(packed.a)
  return packed.i.map(([folder, file, alt, sourceId, promoted]) => ({
    url: (packed.f[folder] ?? '') + file,
    alt: alts[alt] ?? '',
    ...(sourceId ? { sourceId: expandId(sourceId) } : {}),
    ...(promoted === 1 ? { promoted: true } : {}),
  }))
}
