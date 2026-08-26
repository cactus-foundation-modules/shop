import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  ShopInvoiceHeader, ShopInvoiceParties, ShopInvoiceLines,
  ShopInvoiceTotals, ShopInvoiceTaxSummary, ShopInvoicePayment,
} from '@/modules/shop/components/puck/invoice-parts'
import { ShopInvoiceNotice, ShopInvoiceFooter } from '@/modules/shop/components/puck/invoice-chrome'
import { sizeVars } from '@/modules/shop/components/puck/invoice-shared'
import { SAMPLE_INVOICE_CONTEXT } from '@/modules/shop/lib/invoice-doc-context'
import { INVOICE_DOC_CSS } from '@/modules/shop/components/public/invoice-doc-css'

// Every text size on the document is a number an owner types into a box, carried
// to the stylesheet as a `--shp-inv-*-size` custom property. Nothing checks the
// two ends agree: a property emitted under a name the stylesheet never reads is
// a box that does nothing at all, and a rule reading a name no block emits is a
// size nobody can change. Both look exactly like "the field is broken", and both
// pass tsc, eslint and every other test in this suite.
//
// So the two ends are matched here, in both directions.

/** The sample invoice with the optional sentences filled in, so the blocks that
 *  only draw them when the shop has written one still render here. */
const ctx = {
  ...SAMPLE_INVOICE_CONTEXT,
  invoice: {
    ...SAMPLE_INVOICE_CONTEXT.invoice,
    wording: {
      ...SAMPLE_INVOICE_CONTEXT.invoice.wording,
      intro: 'Thank you for your order.',
      footer: 'Registered in England and Wales.',
    },
  },
}

/** Every block, with every one of its size boxes filled in. The numbers differ
 *  so a property wired to the wrong prop shows up as the wrong figure. */
const RENDERED = [
  renderToStaticMarkup(<ShopInvoiceHeader _ctx={ctx} titlePt={30} numberPt={13} factsPt={9} introPt={11} />),
  renderToStaticMarkup(<ShopInvoiceParties _ctx={ctx} headingPt={8} addressPt={10} registrationPt={7} />),
  renderToStaticMarkup(<ShopInvoiceLines _ctx={ctx} showSku="yes" headPt={8} rowPt={10} skuPt={7} detailPt={7} />),
  renderToStaticMarkup(<ShopInvoiceTotals _ctx={ctx} rowPt={10} totalPt={16} paidPt={8} />),
  renderToStaticMarkup(<ShopInvoiceTaxSummary _ctx={ctx} hideWhenSingleZero="no" headingPt={8} headPt={7} rowPt={9} />),
  renderToStaticMarkup(<ShopInvoicePayment _ctx={ctx} headingPt={8} bodyPt={9} footerPt={7} />),
  // The written blocks draw nothing at all when nobody has written anything, so
  // they are given their wording here rather than left to return null.
  renderToStaticMarkup(<ShopInvoiceNotice _ctx={ctx} lead="Due by" body="Please quote the number." bodyPt={10} />),
  renderToStaticMarkup(<ShopInvoiceFooter _ctx={ctx} contact="example.com" smallPrint="Company number 01234567." contactPt={9} smallPrintPt={7} />),
].join('\n')

/** Custom properties the blocks actually wrote onto the document. */
function emittedSizeProps(html: string): Set<string> {
  return new Set([...html.matchAll(/(--shp-inv-[a-z0-9-]+-size)\s*:/g)].map((m) => m[1]!))
}

/** Custom properties the stylesheet reads. */
function readSizeProps(css: string): Set<string> {
  return new Set([...css.matchAll(/var\((--shp-inv-[a-z0-9-]+-size)/g)].map((m) => m[1]!))
}

describe('invoice document text sizes', () => {
  const emitted = emittedSizeProps(RENDERED)
  const read = readSizeProps(INVOICE_DOC_CSS)

  it('has sizes to check at all', () => {
    expect(emitted.size).toBeGreaterThan(10)
  })

  it('every size a block sets is one the stylesheet reads', () => {
    expect([...emitted].filter((name) => !read.has(name)).sort()).toEqual([])
  })

  it('every size the stylesheet reads is one a block can set', () => {
    expect([...read].filter((name) => !emitted.has(name)).sort()).toEqual([])
  })

  it('lands as points, because a document is measured in points', () => {
    expect(RENDERED).toContain('--shp-inv-facts-size:9pt')
  })
})

describe('a size box left blank changes nothing', () => {
  it('emits no property at all', () => {
    expect(sizeVars({ '--shp-inv-facts-size': undefined })).toEqual({})
    expect(sizeVars({ '--shp-inv-facts-size': '' })).toEqual({})
    expect(sizeVars({ '--shp-inv-facts-size': 0 })).toEqual({})
  })

  it('so the document renders exactly as it did before the boxes existed', () => {
    // The shared stylesheet every part carries names these properties, being
    // what reads them - it is the MARKUP that must mention none of them.
    const markup = renderToStaticMarkup(<ShopInvoiceLines _ctx={ctx} />).replace(/<style[\s\S]*?<\/style>/g, '')
    expect(markup).not.toContain('--shp-inv-')
  })
})

describe('the heading block no longer draws the letterhead', () => {
  // The logo is core's Site Logo block now. A layout published before that still
  // carries showLogo/showName props, and they have to be ignored rather than
  // resurrect a picture the block no longer sizes.
  it('prints no logo, whatever the old props said', () => {
    const html = renderToStaticMarkup(
      <ShopInvoiceHeader
        _ctx={{ ...ctx, invoice: { ...ctx.invoice, seller: { ...ctx.invoice.seller, logoUrl: 'https://example.com/old.svg' } } }}
        {...({ showLogo: 'yes', showName: 'yes', logoSize: 'large' } as Record<string, string>)}
      />,
    )
    expect(html).not.toContain('old.svg')
    expect(html).not.toContain('shp-inv-brand')
  })
})
