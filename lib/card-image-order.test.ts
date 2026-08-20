import { describe, it, expect } from 'vitest'
import { mergeCardImages } from '@/modules/shop/lib/card-image-order'
import type { PartImage } from '@/modules/shop/components/puck/parts/part-context'

const own = (url: string): PartImage => ({ url, alt: url })
const at = (url: string, position: number | null): PartImage => ({ url, alt: url, sourceId: `child-${url}`, promoted: true, position })
const plain = (url: string): PartImage => ({ url, alt: url, sourceId: `child-${url}` })

const urls = (images: PartImage[]) => images.map((i) => i.url)

describe('mergeCardImages', () => {
  it('leaves a shop-only card exactly as it is', () => {
    expect(urls(mergeCardImages([own('a'), own('b')], []))).toEqual(['a', 'b'])
  })

  it('puts a contribution with no slot behind the product own pictures', () => {
    expect(urls(mergeCardImages([own('a'), own('b')], [plain('x')]))).toEqual(['a', 'b', 'x'])
  })

  // The defect this file exists for: a variation arranged SECOND in the Images
  // grid used to land behind every one of the product's own photographs, so the
  // hover-swap revealed the product's second shot and the arrows reached the
  // variation last. The tile disagreed with the page it opened.
  it('puts a variation arranged second second, so hover reveals it', () => {
    const images = mergeCardImages([own('a'), own('b'), own('c')], [at('x', 1), plain('y')])
    expect(urls(images)).toEqual(['a', 'x', 'b', 'c', 'y'])
    expect(images[1]?.promoted).toBe(true)
  })

  it('leads with a variation arranged first', () => {
    expect(urls(mergeCardImages([own('a'), own('b')], [at('x', 0)]))).toEqual(['x', 'a', 'b'])
  })

  it('lands at the end rather than past it when a product picture is deleted', () => {
    expect(urls(mergeCardImages([own('a')], [at('x', 3)]))).toEqual(['a', 'x'])
  })

  it('keeps the requested order when a contributed photo is also the product own', () => {
    // The dedupe drops the duplicate; the picture after it must not drift forward
    // into the slot the duplicate would have taken.
    expect(urls(mergeCardImages([own('a'), own('b')], [at('a', 0), at('x', 2)]))).toEqual(['a', 'b', 'x'])
  })

  it('still leads for a module using the older leadImages', () => {
    expect(urls(mergeCardImages([own('a'), own('b')], [plain('y')], [plain('x')]))).toEqual(['x', 'a', 'b', 'y'])
  })

  it('interleaves positioned contributions alongside an older leadImages', () => {
    expect(urls(mergeCardImages([own('a'), own('b')], [at('x', 2)], [plain('L')]))).toEqual(['L', 'a', 'x', 'b'])
  })
})
