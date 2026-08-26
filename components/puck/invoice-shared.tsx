import type { CSSProperties } from 'react'
import { googleFontHrefForFamily } from '@/lib/design/tokens'
import { SiteColourField, SiteFontField } from '@/lib/puck/fields/registry'
import { formatMoney } from '@/modules/shop/lib/money'
import { INVOICE_DOC_CSS } from '@/modules/shop/components/public/invoice-doc-css'
import { SAMPLE_INVOICE_CONTEXT, type InvoiceDocContext } from '@/modules/shop/lib/invoice-doc-context'

// What every block of the invoice document shares: the context it reads, the
// stylesheet it carries, the two fields that appear on all of them, and the
// token substitution the written blocks do.
//
// Split out of invoice-parts.tsx when the chrome blocks (style, notice, footer,
// divider) arrived, so the two files hold blocks rather than one holding blocks
// and a preamble. Nothing here is a client component: there is nothing to click
// on an invoice.

export type DocProps = { _ctx?: InvoiceDocContext; fontFamily?: string }

/** Context absent means the editor canvas, where a sample invoice is drawn
 *  instead of a column of empty boxes. */
export function useCtx(props: DocProps): InvoiceDocContext {
  return props._ctx ?? SAMPLE_INVOICE_CONTEXT
}

/** One <style> per part. Identical rules every time, so a document holding every
 *  block costs one set of rules repeated, not one set per block. */
export function Style() {
  return <style dangerouslySetInnerHTML={{ __html: INVOICE_DOC_CSS }} />
}

// ---------------------------------------------------------------------------
// Typeface - same field on every part: blank inherits the site's fonts, set
// overrides them inline (the CSS binding is a class rule and would otherwise win
// against anything inherited).
// ---------------------------------------------------------------------------

export function fontStyle(props: { fontFamily?: string }): CSSProperties | undefined {
  const family = props.fontFamily?.trim()
  return family ? { fontFamily: family } : undefined
}

/** The stylesheet a chosen family needs, when it is a Google face rather than a
 *  system one. Rendered inside the block so it travels with the document: the
 *  PDF is a browser opening the page and gets no chance to add a <link>. */
export function FontLink({ family }: { family?: string }) {
  const href = googleFontHrefForFamily(family?.trim())
  return href ? <link rel="stylesheet" href={href} /> : null
}

export const fontField = {
  type: 'custom' as const,
  label: 'Font (blank uses the site font)',
  render: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => (
    <SiteFontField value={value} onChange={onChange} />
  ),
}

// ---------------------------------------------------------------------------
// Text sizes
// ---------------------------------------------------------------------------
//
// Every run of text on the document - the dates, the addresses, the column
// headings, the small print - has a size box of its own, in POINTS, because a
// point is the unit the thing this ends up as is measured in. An invoice is
// printed, filed and read on paper; "11pt" is what an owner's accountant asks
// for and what their old paperwork was set in.
//
// Blank means untouched. Nothing is emitted at all for an empty box, so the
// stylesheet's own fallback stands and a layout saved before any of these fields
// existed renders byte-for-byte what it rendered then - which matters here more
// than anywhere, because these documents are already in customers' hands.
//
// The size lands as a `--shp-inv-*-size` custom property set INLINE on the
// block's root element, and the stylesheet reads it with the old hard-coded
// value as its fallback. Inline rather than a class because the size is a number
// an owner typed, and a property rather than `font-size` because several of
// these sizes belong to a descendant (a table's column headings, a footer's
// small print) rather than to the root itself.

export function ptField(label: string) {
  return { type: 'number' as const, label, min: 4, max: 96 }
}

/** The `--shp-inv-*-size` properties for the boxes an owner actually filled in.
 *  An empty box, a zero and anything that is not a number emit nothing. */
export function sizeVars(sizes: Record<string, number | string | undefined>): CSSProperties {
  const out: Record<string, string> = {}
  for (const [name, raw] of Object.entries(sizes)) {
    const pt = typeof raw === 'string' ? Number(raw.trim()) : raw
    if (typeof pt === 'number' && Number.isFinite(pt) && pt > 0) out[name] = `${pt}pt`
  }
  return out as CSSProperties
}

/** A colour picked from the site's own palette, or typed in. Blank everywhere
 *  means "leave it as it was", which is how a document that has never been
 *  styled keeps the look it had before any of these fields existed. */
export function colourField(label: string) {
  return {
    type: 'custom' as const,
    label,
    render: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => (
      <SiteColourField value={value} onChange={onChange} allowManual />
    ),
  }
}

export const yesNo = [
  { value: 'yes', label: 'Show' },
  { value: 'no', label: 'Hide' },
]

/** "6 April 2026" from a plain yyyy-mm-dd. Parsed as UTC deliberately: a date
 *  with no time in it must not shift a day because the reader is in Auckland. */
export function formatDay(value: string | null): string {
  if (!value) return ''
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
}

/** Plain text from a settings textarea, split on blank lines into paragraphs -
 *  a textarea is not a rich-text field and paragraphs are all it can mean. */
export function paragraphs(value: string): string[] {
  return value.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean)
}

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------
//
// The written blocks - the notice panel and the footer - are sentences an owner
// types, and a sentence about this invoice needs this invoice's numbers in it.
// So they are written with {{PLACEHOLDERS}} and filled here.
//
// Deliberately a fixed, small list rather than a path into the invoice object.
// An owner writing "Order {{ORDER_NUMBER}}, invoiced {{INVOICE_DATE}}" is doing
// something they can hold in their head; an owner writing "{{invoice.lines[0]}}"
// is writing code into a text box, and the first time a field is missing they
// get an exception on a legal document.
//
// A known token with nothing behind it is replaced with nothing: a customer
// should never be handed an invoice reading "Payment is due by {{DUE_DATE}}"
// because their order had no payment terms. A token nobody recognises is left
// where it stands, because it is a typo and the owner needs to see it - and
// they will, on the sample invoice in the editor, before anybody is invoiced.
//
// NOTHING HERE MAY READ A `Date`. Puck's renderer deep-copies every block's
// props on the way in, and a Date has no enumerable own properties, so it
// arrives as `{}` - not as an invalid date that could be spotted, as an empty
// object that formats to nothing at all. `issuedAt` went that way and printed
// "Order ORD-000142, placed." on an otherwise finished invoice. Every date below
// comes from a field the invoice already stores as a plain string.

export function invoiceTokens(ctx: InvoiceDocContext): Record<string, string> {
  const { invoice, credit } = ctx
  const seller = invoice.seller ?? ({} as typeof invoice.seller)
  const customer = invoice.customer ?? ({} as typeof invoice.customer)
  const symbol = invoice.currencySymbol || '£'
  const siteUrl = (seller.siteUrl || '').replace(/^https?:\/\//, '').replace(/\/$/, '')
  return {
    INVOICE_NUMBER: invoice.invoiceNumber ?? '',
    CREDIT_NOTE_NUMBER: credit?.creditNoteNumber ?? '',
    CREDIT_REASON: credit?.reason ?? '',
    // Blank on an invoice, which is the point: an invoice layout that somebody
    // has pasted {{PROFORMA_NOTICE}} into prints nothing rather than telling a
    // customer their VAT invoice is not one.
    PROFORMA_NOTICE: invoice.wording?.proformaNotice ?? '',
    ORDER_NUMBER: invoice.orderNumber ?? '',
    INVOICE_DATE: formatDay(invoice.taxPointDate),
    TAX_POINT: formatDay(invoice.taxPointDate),
    DUE_DATE: formatDay(invoice.dueDate),
    CUSTOMER_NAME: customer.name ?? '',
    CUSTOMER_COMPANY: customer.company ?? '',
    CUSTOMER_EMAIL: customer.email ?? '',
    BUSINESS_NAME: seller.name || seller.siteName || '',
    BUSINESS_EMAIL: seller.email ?? '',
    BUSINESS_PHONE: seller.phone ?? '',
    BUSINESS_ADDRESS: (seller.addressLines ?? []).join(', '),
    VAT_NUMBER: seller.vatNumber ?? '',
    COMPANY_NUMBER: seller.companyNumber ?? '',
    SITE_URL: siteUrl,
    TAX_LABEL: invoice.wording?.taxLabel || 'VAT',
    PAYMENT_DETAILS: invoice.wording?.paymentDetails ?? '',
    SUBTOTAL: formatMoney(invoice.subtotal, symbol),
    TAX_AMOUNT: formatMoney(invoice.taxAmount, symbol),
    TOTAL: formatMoney(invoice.total, symbol),
  }
}

const TOKEN_RE = /\{\{\s*([A-Z0-9_]+)\s*\}\}/g

/** Fills {{TOKENS}} and tidies up after itself: an unknown or empty token leaves
 *  a hole, and the hole would otherwise show as a double space or a stranded
 *  comma in the middle of an otherwise finished sentence. */
export function fillTokens(text: string, tokens: Record<string, string>): string {
  return text
    .replace(TOKEN_RE, (whole: string, name: string) => tokens[name] ?? whole)
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+([.,;:])/g, '$1')
    .replace(/([([])\s+/g, '$1')
    .replace(/\s+([)\]])/g, '$1')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .trim()
}

/** The list an owner can reach, printed under the fields that accept them. Puck
 *  has no help-text of its own on a text field, so it rides on the label. */
export const TOKEN_HINT =
  'Placeholders: {{INVOICE_NUMBER}} {{ORDER_NUMBER}} {{INVOICE_DATE}} {{TAX_POINT}} {{DUE_DATE}} {{TOTAL}} {{CUSTOMER_NAME}} {{CUSTOMER_COMPANY}} {{BUSINESS_NAME}} {{BUSINESS_EMAIL}} {{BUSINESS_PHONE}} {{BUSINESS_ADDRESS}} {{VAT_NUMBER}} {{COMPANY_NUMBER}} {{SITE_URL}} {{PROFORMA_NOTICE}}'
