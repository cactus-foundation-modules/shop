import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  ShopInvoiceHeader, ShopInvoiceParties, ShopInvoiceFrom, ShopInvoiceTo, ShopInvoiceLines,
  ShopInvoiceTotals, ShopInvoiceTaxSummary, ShopInvoicePayment,
} from '@/modules/shop/components/puck/invoice-parts'
import {
  ShopInvoiceStyle, ShopInvoiceNotice, ShopInvoiceFooter, ShopInvoiceDivider, ShopInvoicePageNumber,
  INVOICE_DOC_SCOPE_CLASSES,
} from '@/modules/shop/components/puck/invoice-chrome'
import { fillTokens, invoiceTokens } from '@/modules/shop/components/puck/invoice-shared'
import { SAMPLE_INVOICE_CONTEXT } from '@/modules/shop/lib/invoice-doc-context'
import { INVOICE_DOC_CSS } from '@/modules/shop/components/public/invoice-doc-css'

// The Document style block sets its custom properties on the part classes rather
// than on :root, so nothing escapes the document. That only works while the list
// of part classes matches the parts that actually exist: a block added later
// whose root class is missing from the list silently keeps the fallbacks, and
// the failure is one block that stays grey in an otherwise coloured document -
// which nobody notices until a customer has the PDF.
//
// So every block renders here, and every top-level element it produces has to
// carry a class the style block's selector reaches.

const ctx = SAMPLE_INVOICE_CONTEXT

/** What the style block wrote, with the shared stylesheet every part carries
 *  taken back out - that one mentions the custom properties too, being what
 *  reads them. */
function emitted(html: string): string {
  return html.split('</style>').map((part) => `${part}</style>`)
    .filter((part) => !part.includes(INVOICE_DOC_CSS.slice(0, 80)))
    .join('')
    .replace(/<\/?style>/g, '')
    .trim()
}

/** Markup with the stylesheets stripped, for counting what is on the page. */
function visible(html: string): string {
  return html.replace(/<style[\s\S]*?<\/style>/g, '')
}

/** The class names on every element at the top of a block's output. Anything
 *  nested is inside one of these and inherits, so only the roots matter. */
function rootClasses(html: string): string[] {
  // Drop the <style> and <link> every part carries, then take the class of each
  // remaining element at depth zero.
  const stripped = html
    .replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/<link[^>]*>/g, '')
  const found: string[] = []
  let depth = 0
  const tagRe = /<(\/?)([a-z0-9]+)([^>]*)>/gi
  let match: RegExpExecArray | null
  while ((match = tagRe.exec(stripped))) {
    const closing = match[1] ?? ''
    const tag = match[2] ?? ''
    const attrs = match[3] ?? ''
    if (closing) {
      depth -= 1
      continue
    }
    if (depth === 0) {
      const cls = /class="([^"]*)"/.exec(attrs)
      found.push(cls?.[1] ?? '')
    }
    // <img>, <br> and <hr> are roots in their own right but never open a level.
    if (!attrs.endsWith('/') && !/^(img|br|hr|input|meta)$/i.test(tag)) depth += 1
  }
  return found
}

describe('invoice document style scope', () => {
  const blocks: [string, string][] = [
    ['header', renderToStaticMarkup(<ShopInvoiceHeader _ctx={ctx} />)],
    ['parties', renderToStaticMarkup(<ShopInvoiceParties _ctx={ctx} />)],
    ['from', renderToStaticMarkup(<ShopInvoiceFrom _ctx={ctx} />)],
    ['to', renderToStaticMarkup(<ShopInvoiceTo _ctx={ctx} />)],
    ['lines', renderToStaticMarkup(<ShopInvoiceLines _ctx={ctx} />)],
    ['totals', renderToStaticMarkup(<ShopInvoiceTotals _ctx={ctx} />)],
    ['tax summary', renderToStaticMarkup(<ShopInvoiceTaxSummary _ctx={ctx} hideWhenSingleZero="no" />)],
    ['payment', renderToStaticMarkup(<ShopInvoicePayment _ctx={ctx} />)],
    ['notice', renderToStaticMarkup(<ShopInvoiceNotice _ctx={ctx} lead="Lead" body="Body" />)],
    ['footer', renderToStaticMarkup(<ShopInvoiceFooter _ctx={ctx} contact="a" smallPrint="b" />)],
    ['divider', renderToStaticMarkup(<ShopInvoiceDivider />)],
    ['page number', renderToStaticMarkup(<ShopInvoicePageNumber _ctx={ctx} />)],
  ]

  it.each(blocks)('every root element of the %s block is inside the style scope', (_name, html) => {
    const roots = rootClasses(html).filter(Boolean)
    expect(roots.length).toBeGreaterThan(0)
    for (const cls of roots) {
      const names = cls.split(/\s+/)
      expect(
        names.some((n) => INVOICE_DOC_SCOPE_CLASSES.includes(n)),
        `"${cls}" is not reached by the Document style block - add its root class to INVOICE_DOC_SCOPE_CLASSES`,
      ).toBe(true)
    }
  })

  it('every class in the scope list is one the stylesheet actually styles', () => {
    for (const name of INVOICE_DOC_SCOPE_CLASSES) {
      expect(INVOICE_DOC_CSS, `${name} is in the scope list but nothing styles it`).toContain(`.${name}`)
    }
  })

  it('emits nothing at all when no field is set, so an unstyled document is untouched', () => {
    expect(emitted(renderToStaticMarkup(<ShopInvoiceStyle />))).toBe('')
  })

  it('emits only the properties an owner actually set', () => {
    const css = emitted(renderToStaticMarkup(<ShopInvoiceStyle accent="var(--color-primary)" labelColour="  " />))
    expect(css).toContain('--shp-inv-accent: var(--color-primary);')
    expect(css).not.toContain('--shp-inv-label')
    // Scoped to the parts, never to the whole page.
    expect(css).not.toContain(':root')
    expect(css).toContain('.shp-inv-head')
  })
})

describe('invoice document tokens', () => {
  const tokens = invoiceTokens(ctx)

  it('fills a written sentence from the invoice', () => {
    expect(fillTokens('Order {{ORDER_NUMBER}}, invoiced {{INVOICE_DATE}}.', tokens))
      .toBe('Order ORD-000142, invoiced 6 April 2026.')
  })

  // Puck's renderer deep-copies block props, and a Date has no enumerable own
  // properties, so one arrives as `{}` and formats to nothing at all - silently,
  // on a legal document. Every date token has to come from a string field.
  it('takes no date from a Date, because a Date does not survive the renderer', () => {
    const dated = Object.entries(tokens).filter(([name]) => name.endsWith('_DATE') || name === 'TAX_POINT')
    expect(dated.length).toBeGreaterThan(0)
    for (const [name, value] of dated) {
      expect(value, `${name} came out empty - is it reading a Date?`).not.toBe('')
    }
  })

  it('leaves no stranded punctuation where a token was empty', () => {
    const empty = { ...tokens, COMPANY_NUMBER: '' }
    expect(fillTokens('Company number {{COMPANY_NUMBER}}.', empty)).toBe('Company number.')
    expect(fillTokens('Registered {{COMPANY_NUMBER}} in England.', empty)).toBe('Registered in England.')
  })

  it('leaves a token nobody recognises where it stands, so the typo is visible', () => {
    expect(fillTokens('Ref {{NOT_A_TOKEN}}', tokens)).toBe('Ref {{NOT_A_TOKEN}}')
  })

  it('hides the notice panel when everything it said was an empty token', () => {
    const noDue = { ...ctx, invoice: { ...ctx.invoice, dueDate: null } }
    const html = visible(renderToStaticMarkup(<ShopInvoiceNotice _ctx={noDue} lead="{{DUE_DATE}}" body="" />))
    expect(html).not.toContain('shp-inv-notice')
  })
})

describe('invoice tax summary', () => {
  it('drops itself when one rate covers the whole document', () => {
    expect(renderToStaticMarkup(<ShopInvoiceTaxSummary _ctx={ctx} hideWhenSingleZero="single" />)).toBe('')
  })

  it('comes back the moment a second rate appears', () => {
    const twoRates = {
      ...ctx,
      invoice: {
        ...ctx.invoice,
        taxBreakdown: [
          { ratePercent: '20', net: '1000.00', tax: '200.00', gross: '1200.00' },
          { ratePercent: '5', net: '560.00', tax: '28.00', gross: '588.00' },
        ],
      },
    }
    const html = visible(renderToStaticMarkup(<ShopInvoiceTaxSummary _ctx={twoRates} hideWhenSingleZero="single" />))
    expect(html).toContain('shp-inv-vat')
    expect(html).toContain('5%')
  })
})

describe('invoice header', () => {
  it('prints the number once when it leads, not twice', () => {
    const html = visible(renderToStaticMarkup(<ShopInvoiceHeader _ctx={ctx} numberStyle="lead" />))
    expect(html.match(/INV-000087/g)).toHaveLength(1)
    expect(html).toContain('shp-inv-lead')
  })

  it('keeps the credited invoice reference on a credit note whose own number leads', () => {
    const credit = { ...ctx, credit: { creditNoteNumber: 'CRN-000004', reason: null } }
    const html = visible(renderToStaticMarkup(<ShopInvoiceHeader _ctx={credit} numberStyle="lead" />))
    expect(html).toContain('CRN-000004')
    expect(html.match(/INV-000087/g)).toHaveLength(1)
  })
})
