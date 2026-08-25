import { describe, expect, it } from 'vitest'
import { packCardImages, unpackCardImages } from './card-media-pack'
import type { PartImage } from '@/modules/shop/components/puck/parts/part-context'

// The folded wire shape is only ever allowed to be smaller, never different. A
// carousel that quietly loses a picture, an alt or a sourceId would look fine on
// the card and break the filter's colour constraint, which reads sourceIds - so
// the round trip is asserted field by field rather than by eye.
const roundTrip = (images: PartImage[]) => unpackCardImages(packCardImages(images))

describe('card media packing', () => {
  it('returns every picture unchanged, in order', () => {
    const images: PartImage[] = [
      { url: 'https://media.example.com/media/shop/chairs/eclipse/1.webp', alt: 'Eclipse' },
      { url: 'https://media.example.com/media/shop/chairs/eclipse/2.webp', alt: 'Eclipse' },
      { url: 'https://media.example.com/media/shop/chairs/eclipse/red.webp', alt: '', sourceId: 'src-1' },
      { url: 'https://media.example.com/media/shop/chairs/eclipse/blue.webp', alt: '', sourceId: 'src-2', promoted: true },
    ]
    expect(roundTrip(images)).toEqual([
      { url: 'https://media.example.com/media/shop/chairs/eclipse/1.webp', alt: 'Eclipse' },
      { url: 'https://media.example.com/media/shop/chairs/eclipse/2.webp', alt: 'Eclipse' },
      { url: 'https://media.example.com/media/shop/chairs/eclipse/red.webp', alt: '', sourceId: 'src-1' },
      { url: 'https://media.example.com/media/shop/chairs/eclipse/blue.webp', alt: '', sourceId: 'src-2', promoted: true },
    ])
  })

  it('names each repeated folder and alt once', () => {
    const packed = packCardImages([
      { url: 'https://cdn/a/b/1.webp', alt: 'Chair' },
      { url: 'https://cdn/a/b/2.webp', alt: 'Chair' },
      { url: 'https://cdn/a/b/3.webp', alt: 'Chair' },
    ])
    expect(packed.f).toEqual(['https://cdn/a/b/'])
    expect(packed.a).toEqual(['Chair'])
  })

  // Every odd url shape that could reach a card, since the split is positional
  // rather than a parse: whatever went in has to come back out.
  it.each([
    ['no slash at all', 'photo.webp'],
    ['root relative', '/media/shop/a.webp'],
    ['trailing slash', 'https://cdn/a/b/'],
    ['a data uri', 'data:image/svg+xml;base64,PHN2Zy8+'],
    ['query string', 'https://cdn/a/b.webp?v=2'],
    ['empty', ''],
  ])('survives %s', (_label, url) => {
    expect(roundTrip([{ url, alt: 'x' }])[0]?.url).toBe(url)
  })

  it('drops sourceId and promoted rather than inventing them', () => {
    const [own] = roundTrip([{ url: 'https://cdn/a/1.webp', alt: 'x' }])
    expect(own).not.toHaveProperty('sourceId')
    expect(own).not.toHaveProperty('promoted')
    // promoted:false is a contributed photo that is NOT already in the gallery,
    // which the hover-swap must keep treating as absent.
    const [plain] = roundTrip([{ url: 'https://cdn/a/1.webp', alt: 'x', sourceId: 's', promoted: false }])
    expect(plain).not.toHaveProperty('promoted')
    expect(plain?.sourceId).toBe('s')
  })

  it('holds an empty list', () => {
    expect(roundTrip([])).toEqual([])
  })
})
