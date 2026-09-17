import { describe, expect, it } from 'vitest'
import { parseDeleteRedirectTarget } from '@/modules/shop/lib/db/slug-redirects'

describe('parseDeleteRedirectTarget', () => {
  it('accepts site paths', () => {
    expect(parseDeleteRedirectTarget('/shop/categories/chairs')).toEqual({ path: '/shop/categories/chairs' })
  })

  it('accepts product slugs', () => {
    expect(parseDeleteRedirectTarget('green-office-chair')).toEqual({ productSlug: 'green-office-chair' })
  })

  it('rejects empty and invalid values', () => {
    expect(parseDeleteRedirectTarget('')).toBeNull()
    expect(parseDeleteRedirectTarget('  ')).toBeNull()
    expect(parseDeleteRedirectTarget('not a slug!')).toBeNull()
  })
})
