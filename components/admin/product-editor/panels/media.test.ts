import { describe, it, expect } from 'vitest'
import { mergeGalleryRows } from '@/modules/shop/components/admin/product-editor/panels/media'
import type { MediaItem } from '@/modules/shop/components/admin/product-editor/model'
import type { GalleryExtraItem } from '@/modules/shop/components/admin/product-editor/gallery-extras'

// The Images grid and whatever draws the gallery on the storefront each keep their
// own copy of this rule - shop must not import a module's code, and the module
// must not import a client component into a server render. Two copies is the
// price of that, so both are pinned: this file and shop-variations'
// lib/gallery-order.test.ts assert the same behaviour, and a change to one that
// is not made to the other shows up as a failure rather than as a gallery whose
// admin and storefront disagree about the order.

const img = (url: string): MediaItem => ({ type: 'IMAGE', url })
const extra = (id: string, position: number | null): GalleryExtraItem => ({ id, url: `${id}.jpg`, altText: '', badge: 'Variation', position })

/** The finished gallery as urls, so a row's kind is checked by what it points at. */
const order = (media: MediaItem[], extras: GalleryExtraItem[]) =>
  mergeGalleryRows(media, extras).map((r) => (r.kind === 'media' ? r.item.url : r.item.id))

describe('mergeGalleryRows', () => {
  it('leaves a product with no contributed pictures exactly as it is', () => {
    expect(order([img('a'), img('b')], [])).toEqual(['a', 'b'])
  })

  it('puts unplaced contributions after the product own pictures', () => {
    expect(order([img('a'), img('b')], [extra('x', null)])).toEqual(['a', 'b', 'x'])
  })

  it('interleaves at the slot each one claims', () => {
    expect(order([img('a'), img('b'), img('c')], [extra('x', 1), extra('y', 4)])).toEqual(['a', 'x', 'b', 'c', 'y'])
  })

  it('lands at the end rather than past it when a product picture is deleted', () => {
    expect(order([img('a')], [extra('x', 3)])).toEqual(['a', 'x'])
  })

  it('keeps the media index pointing at the right picture after an interleave', () => {
    const rows = mergeGalleryRows([img('a'), img('b')], [extra('x', 1)])
    const media = rows.flatMap((r) => (r.kind === 'media' ? [r] : []))
    expect(media.map((r) => r.index)).toEqual([0, 1])
    expect(media.map((r) => r.item.url)).toEqual(['a', 'b'])
  })
})
