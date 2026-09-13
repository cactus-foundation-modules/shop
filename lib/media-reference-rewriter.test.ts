import { describe, it, expect, vi, beforeEach } from 'vitest'

// Every statement the rewriter sends, as the SQL text with its bound values, so a
// test can ask "was this column repointed, from what, to what" without a database.
const statements: Array<{ sql: string; values: unknown[] }> = []
const record = (strings: TemplateStringsArray, ...values: unknown[]) => {
  statements.push({ sql: strings.join('?'), values })
}

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    $executeRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => { record(strings, ...values); return 0 },
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => { record(strings, ...values); return [] },
  },
}))

const { shopMediaReferenceRewriter } = await import('@/modules/shop/lib/media-reference-rewriter')

const OLD_URL = 'https://media.example/media/orders/dw1/proof-of-delivery/signature.jpeg'
const NEW_URL = 'https://media.example/media/orders/dw1/proof-of-delivery/signature.webp'
const OLD_KEY = 'media/orders/dw1/proof-of-delivery/signature.jpeg'
const NEW_KEY = 'media/orders/dw1/proof-of-delivery/signature.webp'

beforeEach(() => { statements.length = 0 })

describe('shopMediaReferenceRewriter - an order\'s own pictures', () => {
  it('repoints a shipment\'s proof of delivery, url and storage key both, when it is optimised', async () => {
    await shopMediaReferenceRewriter({ oldUrl: OLD_URL, newUrl: NEW_URL, oldKey: OLD_KEY, newKey: NEW_KEY })

    const url = statements.find((s) => s.sql.includes('"shp_shipments" SET "signature_url"'))
    expect(url?.values).toEqual([NEW_URL, OLD_URL])
    const key = statements.find((s) => s.sql.includes('"shp_shipments" SET "signature_key"'))
    expect(key?.values).toEqual([NEW_KEY, OLD_KEY])
  })

  it('repoints a photograph a customer sent with a return or damage report', async () => {
    await shopMediaReferenceRewriter({ oldUrl: OLD_URL, newUrl: NEW_URL, oldKey: OLD_KEY, newKey: NEW_KEY })

    const photo = statements.find((s) => s.sql.includes('"shp_order_request_photos" SET "url"'))
    expect(photo?.values).toEqual([NEW_URL, OLD_URL])
  })

  it('leaves the signature key alone when only the url changed', async () => {
    await shopMediaReferenceRewriter({ oldUrl: OLD_URL, newUrl: NEW_URL, oldKey: OLD_KEY, newKey: OLD_KEY })
    expect(statements.some((s) => s.sql.includes('"signature_key"'))).toBe(false)
  })

  it('does nothing at all when the url did not move', async () => {
    await shopMediaReferenceRewriter({ oldUrl: OLD_URL, newUrl: OLD_URL, oldKey: OLD_KEY, newKey: NEW_KEY })
    expect(statements).toHaveLength(0)
  })
})
