import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { foldAltTable, packCardImages, unfoldAltTable, unpackCardImages, type PackedImages } from './card-media-pack'
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

describe('card media packing - the folded alts and ids', () => {
  const product = 'Eclipse Plus Task Operator Office Chair with Hi Rise Draughtsman Kit'
  const folder = 'https://media.example.com/media/shop/office-chairs/eclipse/variations/thumb/'

  // A card the shape the live homepage's were: the product's own photos first,
  // then a photo per variation, each described by the product and its options and
  // each naming its variation by uuid.
  function variationCard(count: number): PartImage[] {
    const colours = ['Quest Crab', 'Quest Kelp', 'Quest Limpet', 'Rivet Forge', 'Blue', 'Charcoal']
    const own: PartImage[] = [
      { url: `${folder}own-1.webp`, alt: product },
      { url: `${folder}own-2.webp`, alt: product },
    ]
    const contributed: PartImage[] = Array.from({ length: count }, (_, n) => ({
      url: `${folder}v${n}_1-thumb.webp`,
      alt: `${product} - Seat Height / ${n % 2 ? 'No Arms' : 'Fixed Arms'} / ${colours[n % colours.length]} / ${n % 3 ? 'Black' : colours[(n + 1) % colours.length]}`,
      sourceId: randomUUID(),
      ...(n % 5 === 0 ? { promoted: true } : {}),
    }))
    return [...own, ...contributed]
  }

  it('returns a card of hundreds of variation photos exactly', () => {
    const images = variationCard(350)
    expect(roundTrip(images)).toEqual(images)
  })

  it('spells a uuid source id in twenty-two characters on the wire', () => {
    const images = variationCard(3)
    const packed = packCardImages(images)
    const wireIds = packed.i.map((tuple) => tuple[3]).filter((id): id is string => id !== undefined)
    expect(wireIds).toHaveLength(3)
    for (const id of wireIds) expect(id).toHaveLength(22)
  })

  it('writes each alt against the one before it once they share a long start', () => {
    const packed = packCardImages(variationCard(4))
    // The product name on its own first, then the four variations, every one of
    // them after the first spelled as a count and a tail.
    expect(packed.a[0]).toBe(product)
    expect(Array.isArray(packed.a[1])).toBe(true)
    expect(packed.a.slice(2).every((entry) => Array.isArray(entry))).toBe(true)
    // And far smaller for it.
    const spelledOut = JSON.stringify(unfoldAltTable(packed.a))
    expect(JSON.stringify(packed.a).length).toBeLessThan(spelledOut.length / 2)
  })

  it('carries source ids that are not uuids exactly', () => {
    const images: PartImage[] = [
      { url: 'https://cdn/a/1.webp', alt: 'x', sourceId: 'src-1' },
      { url: 'https://cdn/a/2.webp', alt: 'x', sourceId: '12D48796-EDD9-407C-85F0-3EC6A53B373A' },
      { url: 'https://cdn/a/3.webp', alt: 'x', sourceId: '~marked' },
      { url: 'https://cdn/a/4.webp', alt: 'x', sourceId: 'AAAAAAAAAAAAAAAAAAAAAA', promoted: true },
      { url: 'https://cdn/a/5.webp', alt: 'x', sourceId: 'cat:12d48796-edd9-407c-85f0-3ec6a53b373a' },
    ]
    expect(roundTrip(images)).toEqual(images)
  })

  it('still treats an empty source id as none, as it always has', () => {
    const [plain] = roundTrip([{ url: 'https://cdn/a/1.webp', alt: 'x', sourceId: '' }])
    expect(plain).toEqual({ url: 'https://cdn/a/1.webp', alt: 'x' })
  })

  it('keeps empty alts, duplicate alts and missing source ids side by side', () => {
    const id = randomUUID()
    const images: PartImage[] = [
      { url: 'https://cdn/a/1.webp', alt: '' },
      { url: 'https://cdn/a/2.webp', alt: `${product} - Blue` },
      { url: 'https://cdn/a/3.webp', alt: '', sourceId: id },
      { url: 'https://cdn/a/4.webp', alt: `${product} - Blue`, sourceId: id, promoted: true },
      { url: 'https://cdn/a/5.webp', alt: `${product} - Blue / Black` },
      { url: 'https://cdn/a/6.webp', alt: '' },
      { url: 'https://cdn/a/7.webp', alt: product },
    ]
    expect(roundTrip(images)).toEqual(images)
    // A duplicate alt is still one table entry, however it is spelled.
    expect(packCardImages(images).a).toHaveLength(4)
  })

  it('never cuts an emoji in half between an alt and the one before it', () => {
    // The two share the first half of a surrogate pair and no more.
    const alts = ['Chair \u{1FA91} red', 'Chair \u{1FA92} blue', 'Chair \u{1FA92}']
    const folded = foldAltTable(alts)
    for (const entry of folded) {
      const rest = typeof entry === 'string' ? entry : entry[1]
      const first = rest.charCodeAt(0)
      expect(first >= 0xdc00 && first <= 0xdfff).toBe(false)
    }
    expect(unfoldAltTable(folded)).toEqual(alts)
  })

  it('returns random tables exactly', () => {
    // Short words over a tiny vocabulary, so neighbours share starts of every
    // length - including the ones too short for the pair to be worth it.
    const words = ['a', 'ab', 'Desk', 'Desk ', ' / ', 'Oak', 'O', '', 'é', '\u{1F600}']
    let seed = 7
    const next = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648
    for (let run = 0; run < 300; run++) {
      const alts = Array.from({ length: Math.floor(next() * 12) }, () =>
        Array.from({ length: Math.floor(next() * 6) }, () => words[Math.floor(next() * words.length)]).join(''),
      )
      expect(unfoldAltTable(foldAltTable(alts))).toEqual(alts)
      const images: PartImage[] = alts.map((alt, n) => {
        const pick = next()
        const sourceId = pick < 0.3 ? undefined : pick < 0.6 ? randomUUID() : pick < 0.8 ? `id-${n}` : ''
        return { url: `https://cdn/f${n % 3}/${n}.webp`, alt, ...(sourceId === undefined ? {} : { sourceId }), ...(next() < 0.3 && sourceId ? { promoted: true } : {}) }
      })
      const expected = images.map((image) => {
        const { sourceId, promoted, ...rest } = image
        return { ...rest, ...(sourceId ? { sourceId } : {}), ...(sourceId && promoted ? { promoted } : {}) }
      })
      expect(roundTrip(images)).toEqual(expected)
    }
  })

  it('reads a card written in the shape before alts and ids were folded', () => {
    // A page rendered by the previous version, read by this one: every alt in
    // full and every id spelled out.
    const legacy: PackedImages = {
      f: ['https://cdn/a/'],
      a: [product, `${product} - Blue`, ''],
      i: [
        [0, '1.webp', 0],
        [0, '2.webp', 1, '561f5777-cf43-4400-889a-15c70ef50848'],
        [0, '3.webp', 2, 'src-1', 1],
      ],
    }
    expect(unpackCardImages(legacy)).toEqual([
      { url: 'https://cdn/a/1.webp', alt: product },
      { url: 'https://cdn/a/2.webp', alt: `${product} - Blue`, sourceId: '561f5777-cf43-4400-889a-15c70ef50848' },
      { url: 'https://cdn/a/3.webp', alt: '', sourceId: 'src-1', promoted: true },
    ])
  })
})
