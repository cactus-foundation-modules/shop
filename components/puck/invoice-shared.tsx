import type { CSSProperties, ReactNode } from 'react'
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

// ---------------------------------------------------------------------------
// Field labels
// ---------------------------------------------------------------------------
//
// Puck draws the label for its own field types and NOT for `type: 'custom'` - a
// custom field is handed the whole row and is expected to head itself. Core's
// widgets all do (see lib/puck/UnitValueField.tsx, BgColorField.tsx); this
// module's did not, so every font, colour and size menu on a document block sat
// in the panel as an unlabelled box with no clue what it was for. A dozen of
// them in a row, every one reading "Default".
//
// So every custom field here goes through `labelled`, which draws the same
// heading in the same style core's widgets use. One helper rather than the
// label repeated in five renders, because the next custom field added here
// would forget it otherwise.

const fieldLabelStyle: CSSProperties = {
  display: 'block',
  fontSize: '0.8125rem',
  fontWeight: 500,
  color: 'var(--color-text)',
  marginBottom: '0.375rem',
}

function labelled(label: string, control: ReactNode): ReactNode {
  return (
    <div>
      {label && <label style={fieldLabelStyle}>{label}</label>}
      {control}
    </div>
  )
}

const FONT_LABEL = 'Font (blank uses the site font)'

export const fontField = {
  type: 'custom' as const,
  label: FONT_LABEL,
  render: ({ value, onChange }: { value: string; onChange: (value: string) => void }) =>
    labelled(FONT_LABEL, <SiteFontField value={value} onChange={onChange} />),
}

const HEADING_FONT_LABEL = 'Heading font (blank uses the site heading font)'

/** The same widget as `fontField` under a different heading, for the Document
 *  style block's second font. Its own field rather than a spread of the one
 *  above, which would carry that one's label into the panel. */
export const headingFontField = {
  type: 'custom' as const,
  label: HEADING_FONT_LABEL,
  render: ({ value, onChange }: { value: string; onChange: (value: string) => void }) =>
    labelled(HEADING_FONT_LABEL, <SiteFontField value={value} onChange={onChange} />),
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

// ---------------------------------------------------------------------------
// The size picker
// ---------------------------------------------------------------------------
//
// The boxes above are now menus, and the menus are in PIXELS. Points were the
// right unit for a thing that ends up on paper and the wrong one for a thing an
// owner is looking at on a screen while they design it: every other size field
// in the admin is in px, a browser lays the document out in px, and "13" typed
// into a box meaning points landed at a size nobody predicted.
//
// A menu rather than a box for the same reason the rest of the admin uses one:
// a document set in 11px, 12px and 11.5px is not a design, it is three
// accidents, and nobody typing free numbers into fourteen boxes ends up with a
// document whose sizes agree with one another.
//
// Old values keep working, untouched. A size saved before this was a menu is a
// bare number meaning points; it renders exactly as it did (see `sizeVars`), and
// the menu offers it back as its own first option so an owner can see what they
// have and change it when they mean to rather than the moment they open the
// panel.

const PX_SIZES = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 24, 28, 32, 36, 40, 48, 56, 64, 72]

const selectStyle: CSSProperties = {
  width: '100%',
  padding: '0.375rem 0.5rem',
  border: '1px solid var(--color-border)',
  borderRadius: 6,
  fontSize: '0.8125rem',
  fontFamily: 'inherit',
}

/** A menu of px sizes, with "Default" at the top and any legacy point value kept
 *  where an owner can see it. Not a client component: it is only ever rendered
 *  inside the Puck editor, which is client-side already, and marking it would
 *  open a client boundary in the document's published render path. */
function SizeSelect({
  value, onChange, sizes, unit, zeroLabel,
}: {
  value: string | number | undefined
  onChange: (value: string) => void
  sizes: number[]
  unit: string
  zeroLabel?: string
}) {
  const current = value === undefined || value === null ? '' : String(value).trim()
  const known = current === '' || sizes.some((n) => `${n}${unit}` === current)
  return (
    <select style={selectStyle} value={current} onChange={(event) => onChange(event.target.value)}>
      <option value="">Default</option>
      {!known && <option value={current}>{`${current}${/[a-z%]$/i.test(current) ? '' : 'pt'} (set before this was a menu)`}</option>}
      {sizes.map((n) => (
        <option key={n} value={`${n}${unit}`}>{n === 0 && zeroLabel ? zeroLabel : `${n}${unit}`}</option>
      ))}
    </select>
  )
}

/** A text size, in px. Blank means "leave it as the document has it". */
export function sizeField(label: string) {
  return {
    type: 'custom' as const,
    label,
    render: ({ value, onChange }: { value: string | number | undefined; onChange: (value: string) => void }) =>
      labelled(label, <SizeSelect value={value} onChange={onChange} sizes={PX_SIZES} unit="px" />),
  }
}

const RADII = [0, 1, 2, 3, 4, 6, 8, 10, 12, 16, 20, 24, 32]

/** A corner radius, in px. Same shape as the size menu, so the two read alike. */
export function radiusField(label: string) {
  return {
    type: 'custom' as const,
    label,
    render: ({ value, onChange }: { value: string | number | undefined; onChange: (value: string) => void }) =>
      labelled(label, <SizeSelect value={value} onChange={onChange} sizes={RADII} unit="px" zeroLabel="Square (0px)" />),
  }
}

const SPACES = [0, 2, 4, 6, 8, 10, 12, 16, 20, 24, 28, 32, 40, 48, 56, 64, 80]

/** A gap, in px - the space above a block, the padding inside a table cell. */
export function spaceField(label: string) {
  return {
    type: 'custom' as const,
    label,
    render: ({ value, onChange }: { value: string | number | undefined; onChange: (value: string) => void }) =>
      labelled(label, <SizeSelect value={value} onChange={onChange} sizes={SPACES} unit="px" zeroLabel="None (0px)" />),
  }
}

/** One CSS length from whatever a field holds, or null for "not set".
 *
 *  Two shapes, and the difference is the whole reason this exists:
 *
 *   - a bare number, or a string of digits, is POINTS. That is what the old
 *     number boxes stored, and a document already in a customer's hands has to
 *     keep the size it was issued at.
 *   - anything carrying a unit is used as it stands, which is what the px menus
 *     save and what an owner typing `1.2rem` into a legacy value would mean.
 */
export function cssLength(raw: number | string | undefined | null): string | null {
  if (raw === undefined || raw === null) return null
  if (typeof raw === 'number') return Number.isFinite(raw) && raw > 0 ? `${raw}pt` : null
  const value = raw.trim()
  if (!value) return null
  if (/^-?[\d.]+$/.test(value)) {
    const n = Number(value)
    return Number.isFinite(n) && n > 0 ? `${n}pt` : null
  }
  // A unit an owner picked or typed. `0` on its own is caught above and dropped;
  // `0px` is a deliberate square corner and has to survive.
  return /^-?[\d.]+(px|pt|rem|em|%|mm|cm|in)$/.test(value) ? value : null
}

/** The `--shp-inv-*` properties for the fields an owner actually set. An empty
 *  field emits nothing at all, so the stylesheet's own fallback stands and a
 *  layout saved before the field existed renders what it always did. */
export function sizeVars(sizes: Record<string, number | string | undefined>): CSSProperties {
  const out: Record<string, string> = {}
  for (const [name, raw] of Object.entries(sizes)) {
    const length = cssLength(raw)
    if (length) out[name] = length
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
    render: ({ value, onChange }: { value: string; onChange: (value: string) => void }) =>
      labelled(label, <SiteColourField value={value} onChange={onChange} allowManual />),
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
