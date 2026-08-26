import { describe, it, expect } from 'vitest'
import { preferLiveLogo } from '@/modules/shop/lib/invoice-document'
import { SAMPLE_INVOICE_CONTEXT } from '@/modules/shop/lib/invoice-doc-context'

// An invoice snapshots its seller, logo URL included, so that a later settings
// edit cannot rewrite paperwork already sent. That is right for the figures, the
// addresses and the VAT number - and wrong for the logo, which is a promise
// about a file the invoice does not own. Replacing the logo in the media library
// leaves the old file gone and every invoice ever issued pointing at a 404.

const withLogo = (url: string | null) => ({
  ...SAMPLE_INVOICE_CONTEXT,
  invoice: { ...SAMPLE_INVOICE_CONTEXT.invoice, seller: { ...SAMPLE_INVOICE_CONTEXT.invoice.seller, logoUrl: url } },
})

describe('preferLiveLogo', () => {
  it('replaces a snapshotted logo with the one the site uses today', () => {
    const ctx = withLogo('https://media.example.com/media/old-mark.svg')
    const out = preferLiveLogo(ctx, 'https://media.example.com/media/identity/abc-new-mark.svg')
    expect(out.invoice.seller.logoUrl).toBe('https://media.example.com/media/identity/abc-new-mark.svg')
  })

  it('keeps the snapshot when the site has no logo at all', () => {
    const ctx = withLogo('https://media.example.com/media/old-mark.svg')
    expect(preferLiveLogo(ctx, null).invoice.seller.logoUrl).toBe('https://media.example.com/media/old-mark.svg')
  })

  it('gives an invoice raised before the site had a logo the current one', () => {
    const out = preferLiveLogo(withLogo(null), 'https://media.example.com/media/identity/abc.svg')
    expect(out.invoice.seller.logoUrl).toBe('https://media.example.com/media/identity/abc.svg')
  })

  it('never edits the row it was handed - a render may not mutate what it renders', () => {
    const ctx = withLogo('https://media.example.com/media/old-mark.svg')
    preferLiveLogo(ctx, 'https://media.example.com/media/identity/new.svg')
    expect(ctx.invoice.seller.logoUrl).toBe('https://media.example.com/media/old-mark.svg')
  })

  it('hands back the very same object when there is nothing to change', () => {
    const ctx = withLogo('https://media.example.com/same.svg')
    expect(preferLiveLogo(ctx, 'https://media.example.com/same.svg')).toBe(ctx)
  })

  it('leaves everything the snapshot is actually for alone', () => {
    const ctx = withLogo('https://media.example.com/old.svg')
    const out = preferLiveLogo(ctx, 'https://media.example.com/new.svg')
    expect(out.invoice.seller.vatNumber).toBe(ctx.invoice.seller.vatNumber)
    expect(out.invoice.seller.addressLines).toEqual(ctx.invoice.seller.addressLines)
    expect(out.invoice.total).toBe(ctx.invoice.total)
    expect(out.invoice.customer).toBe(ctx.invoice.customer)
  })
})
