import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

// The PDF routes send a visitor who may not have the document to its own page,
// where the postcode form lives. Behind Caddy `request.url` reads
// https://localhost:<port>, so that redirect has to be built from the public
// address or the visitor lands on localhost.

vi.mock('@/lib/auth/rate-limit', () => ({ getClientIp: async () => '1.2.3.4' }))
vi.mock('@/modules/shop/lib/rate-limit', () => ({ checkInMemoryRateLimit: () => true }))
vi.mock('@/modules/shop/lib/config', () => ({ getShopConfigCached: async () => ({}) }))
vi.mock('@/modules/shop/lib/document-access', () => ({
  documentPagePath: () => '/x',
  resolveDocumentAccess: async () => ({ allowed: false, challenge: true }),
}))
vi.mock('@/modules/shop/lib/db/invoices', () => ({
  getInvoiceByNumber: async () => ({ invoiceNumber: 'INV-1', orderId: 'o1' }),
}))
vi.mock('@/modules/shop/lib/db/credit-notes', () => ({
  getCreditNoteByNumber: async () => ({ creditNoteNumber: 'CN-1', orderId: 'o1' }),
}))
vi.mock('@/modules/shop/lib/db/orders', () => ({ getOrderById: async () => ({ orderNumber: 'ORD-1' }) }))
vi.mock('@/modules/shop/lib/proforma', () => ({ loadProforma: async () => ({ order: { orderNumber: 'ORD-1' } }) }))
vi.mock('@/modules/shop/lib/proforma-pdf', () => ({ renderProformaPdf: vi.fn() }))
vi.mock('@/modules/shop/lib/document-print-token', () => ({ signDocumentPrintToken: vi.fn() }))
vi.mock('@/modules/shop/lib/invoice-pdf', () => ({
  InvoicePdfUnavailableError: class extends Error {},
  invoicePdfFilename: vi.fn(),
  printPath: vi.fn(),
  renderInvoicePdf: vi.fn(),
}))
vi.mock('@/modules/shop/lib/invoice-token', () => ({
  invoicePath: (n: string) => `/invoice/${n}?t=x`,
  proformaPath: (n: string) => `/proforma/${n}?t=x`,
  creditNotePath: (n: string) => `/credit-note/${n}?t=x`,
}))
vi.mock('@/modules/shop/lib/invoice-document', () => ({ documentPageSetup: vi.fn() }))

const invoice = await import('@/modules/shop/app/api/public/invoices/[number]/pdf/route')
const proforma = await import('@/modules/shop/app/api/public/proformas/[number]/pdf/route')
const creditNote = await import('@/modules/shop/app/api/public/credit-notes/[number]/pdf/route')

const KEYS = ['CACTUS_HOSTING_PROVIDER', 'VERCEL', 'SITE_URL'] as const
const saved: Record<string, string | undefined> = {}
beforeEach(() => {
  for (const k of KEYS) saved[k] = process.env[k]
  delete process.env.VERCEL
  process.env.CACTUS_HOSTING_PROVIDER = 'server'
  process.env.SITE_URL = 'https://shop.example'
})
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
  }
})

function behindCaddy(): NextRequest {
  return new NextRequest('https://localhost:3101/api/m/shop/public/x/1/pdf', {
    headers: { host: 'shop.example', 'x-forwarded-proto': 'https' },
  })
}
const ctx = { params: Promise.resolve({ number: '1' }) }

describe('document PDF redirects on a server install', () => {
  it('sends the invoice challenge to the public address', async () => {
    const res = await invoice.GET(behindCaddy(), ctx)
    expect(res.headers.get('location')).toMatch(/^https:\/\/shop\.example\//)
  })
  it('sends the proforma challenge to the public address', async () => {
    const res = await proforma.GET(behindCaddy(), ctx)
    expect(res.headers.get('location')).toMatch(/^https:\/\/shop\.example\//)
  })
  it('sends the credit note challenge to the public address', async () => {
    const res = await creditNote.GET(behindCaddy(), ctx)
    expect(res.headers.get('location')).toMatch(/^https:\/\/shop\.example\//)
  })
})
