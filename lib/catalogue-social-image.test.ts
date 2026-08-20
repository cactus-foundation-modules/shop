import { describe, expect, it } from 'vitest'
import { absoluteSocialImageUrl } from '@/modules/shop/lib/catalogue-social-image'

describe('absoluteSocialImageUrl', () => {
  it('leaves an already-absolute URL alone', () => {
    expect(absoluteSocialImageUrl('https://cdn.example.com/a.jpg', 'https://shop.example.com'))
      .toBe('https://cdn.example.com/a.jpg')
  })

  it('makes a site-relative URL absolute', () => {
    expect(absoluteSocialImageUrl('/media/a.jpg', 'https://shop.example.com'))
      .toBe('https://shop.example.com/media/a.jpg')
  })

  it('leaves a relative URL as it found it when the site has no address', () => {
    expect(absoluteSocialImageUrl('/media/a.jpg', null)).toBe('/media/a.jpg')
  })

  it('answers null for nothing at all', () => {
    expect(absoluteSocialImageUrl(null, 'https://shop.example.com')).toBeNull()
    expect(absoluteSocialImageUrl(undefined, 'https://shop.example.com')).toBeNull()
    expect(absoluteSocialImageUrl('', 'https://shop.example.com')).toBeNull()
  })
})
