import type { CSSProperties } from 'react'
import { googleFontHrefForFamily } from '@/lib/design/tokens'
import { SiteFontField } from '@/lib/puck/fields/registry'
import { formatMoney } from '@/modules/shop/lib/money'
import { INVOICE_DOC_CSS } from '@/modules/shop/components/public/invoice-doc-css'
import { SAMPLE_INVOICE_CONTEXT, type InvoiceDocContext } from '@/modules/shop/lib/invoice-doc-context'

// The invoice document, as six draggable blocks on the `shopInvoice` layout
// type: the heading, who it is between, the lines, the money, the VAT summary
// and the payment small print.
//
// One render path each, shared by the Puck editor and the storefront (the
// manifest points both `component` and `rscComponent` at the same export), so an
// invoice can never look one way in the editor and another on the page - which
// matters more here than anywhere else in the module, because this layout is
// also what the PDF is made of and what a customer's accountant reads. Nothing
// in this file is a client component: there is nothing to click on an invoice.
//
// Context arrives as `_ctx` (see lib/invoice-doc-context.ts). Absent means the
// editor canvas, where a sample invoice is drawn instead of six empty boxes.

type DocProps = { _ctx?: InvoiceDocContext; fontFamily?: string }

function useCtx(props: DocProps): InvoiceDocContext {
  return props._ctx ?? SAMPLE_INVOICE_CONTEXT
}

/** One <style> per part. Identical rules every time, so a document holding all
 *  six blocks costs one set of rules repeated, not six different ones. */
function Style() {
  return <style dangerouslySetInnerHTML={{ __html: INVOICE_DOC_CSS }} />
}

// ---------------------------------------------------------------------------
// Typeface - same field on every part, same reasoning as the quote document's:
// blank inherits the site's fonts, set overrides them inline (the CSS binding is
// a class rule and would otherwise win against anything inherited).
// ---------------------------------------------------------------------------

function fontStyle(props: { fontFamily?: string }): CSSProperties | undefined {
  const family = props.fontFamily?.trim()
  return family ? { fontFamily: family } : undefined
}

/** The stylesheet a chosen family needs, when it is a Google face rather than a
 *  system one. Rendered inside the block so it travels with the document: the
 *  PDF is a browser opening the page and gets no chance to add a <link>. */
function FontLink({ family }: { family?: string }) {
  const href = googleFontHrefForFamily(family?.trim())
  return href ? <link rel="stylesheet" href={href} /> : null
}

const fontField = {
  type: 'custom' as const,
  label: 'Font (blank uses the site font)',
  render: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => (
    <SiteFontField value={value} onChange={onChange} />
  ),
}

const yesNo = [
  { value: 'yes', label: 'Show' },
  { value: 'no', label: 'Hide' },
]

/** "6 April 2026" from a plain yyyy-mm-dd. Parsed as UTC deliberately: a date
 *  with no time in it must not shift a day because the reader is in Auckland. */
function formatDay(value: string | null): string {
  if (!value) return ''
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
}

// ---------------------------------------------------------------------------
// Header: whose invoice, which invoice, and when
// ---------------------------------------------------------------------------

type HeaderProps = DocProps & {
  heading?: string; showLogo?: string; showName?: string
  showOrderNumber?: string; showTaxPoint?: string; taxPointLabel?: string
}

export function ShopInvoiceHeader(props: HeaderProps) {
  const { invoice } = useCtx(props)
  const heading = props.heading?.trim() || invoice.wording?.heading || 'Invoice'
  const font = fontStyle(props)
  const showLogo = props.showLogo !== 'no' && Boolean(invoice.seller?.logoUrl)
  // Plenty of logos have the business name drawn into them, and printing it
  // again beside the picture just says everything twice - so the default is to
  // print the name only where there is no logo to say it. 'yes' and 'no' are
  // still honoured outright, which is what a layout saved before this existed
  // carries.
  const nameSetting = props.showName?.trim() || 'auto'
  const nameWanted = nameSetting === 'yes' || (nameSetting !== 'no' && !showLogo)
  const showName = nameWanted && Boolean(invoice.seller?.siteName || invoice.seller?.name)
  return (
    <>
      <Style />
      <FontLink family={props.fontFamily} />
      <header className="shp-inv-head" style={font}>
        {(showLogo || showName) && (
          <div className="shp-inv-brand">
            {showLogo && (
              // eslint-disable-next-line @next/next/no-img-element -- the PDF renderer loads this straight from the URL; next/image's optimiser adds nothing to a one-off print
              <img className="shp-inv-logo" src={invoice.seller.logoUrl!} alt={invoice.seller.name} />
            )}
            {showName && <span className="shp-inv-site">{invoice.seller.name || invoice.seller.siteName}</span>}
          </div>
        )}
        <div className="shp-inv-meta">
          <h1 className="shp-inv-h1" style={font}>{heading}</h1>
          <dl className="shp-inv-facts">
            <dt>Invoice</dt>
            <dd>{invoice.invoiceNumber}</dd>
            {props.showOrderNumber !== 'no' && invoice.orderNumber && (
              <>
                <dt>Order</dt>
                <dd>{invoice.orderNumber}</dd>
              </>
            )}
            <dt>Date</dt>
            <dd>{formatDay(invoice.taxPointDate)}</dd>
            {/* The tax point is the date the VAT belongs to. It is usually the
                same day as the invoice, and printing it twice is noise - so it
                is a switch, off unless an owner's accountant wants it. */}
            {props.showTaxPoint === 'yes' && (
              <>
                <dt>{props.taxPointLabel?.trim() || 'Tax point'}</dt>
                <dd>{formatDay(invoice.taxPointDate)}</dd>
              </>
            )}
            {invoice.dueDate && (
              <>
                <dt>Due by</dt>
                <dd>{formatDay(invoice.dueDate)}</dd>
              </>
            )}
          </dl>
          {/* A voided invoice still opens - the number is spent and the document
              is part of the trail - so it has to say so on its face. */}
          {invoice.status === 'VOID' && <span className="shp-inv-void">Void</span>}
        </div>
      </header>
      {invoice.wording?.intro && <p className="shp-inv-intro" style={font}>{invoice.wording.intro}</p>}
    </>
  )
}

export const shopInvoiceHeaderPuckComponent = {
  label: 'Invoice: Heading',
  fields: {
    heading: { type: 'text' as const, label: 'Heading (blank uses the one in Shop settings)' },
    fontFamily: fontField,
    showLogo: { type: 'select' as const, label: 'Site logo', options: yesNo },
    showName: { type: 'select' as const, label: 'Business name in words', options: [
      { value: 'auto', label: 'Only when there is no logo' },
      { value: 'yes', label: 'Always' },
      { value: 'no', label: 'Never' },
    ] },
    showOrderNumber: { type: 'select' as const, label: 'Order number', options: yesNo },
    showTaxPoint: { type: 'select' as const, label: 'Tax point date as its own row', options: yesNo },
    taxPointLabel: { type: 'text' as const, label: 'Tax point row label' },
  },
  defaultProps: {
    heading: '', fontFamily: '', showLogo: 'yes', showName: 'auto',
    showOrderNumber: 'yes', showTaxPoint: 'no', taxPointLabel: 'Tax point',
  },
  render: ShopInvoiceHeader,
}
export const shopInvoiceHeaderPuckRscComponent = { ...shopInvoiceHeaderPuckComponent, render: ShopInvoiceHeader }

// ---------------------------------------------------------------------------
// Parties: who it is from, who it is to, and where the goods went
// ---------------------------------------------------------------------------

type PartiesProps = DocProps & {
  fromLabel?: string; toLabel?: string; deliverLabel?: string
  showFrom?: string; showDelivery?: string; showRegistration?: string
}

export function ShopInvoiceParties(props: PartiesProps) {
  const { invoice } = useCtx(props)
  const font = fontStyle(props)
  const seller = invoice.seller ?? ({} as typeof invoice.seller)
  const customer = invoice.customer ?? ({} as typeof invoice.customer)
  const showFrom = props.showFrom !== 'no'
  const billing = customer.billingAddress ?? []
  const shipping = customer.shippingAddress ?? []
  // Only worth a second column when the goods went somewhere else. Printing the
  // same address twice under two headings helps nobody.
  const differentDelivery =
    props.showDelivery !== 'no' && shipping.length > 0 && shipping.join('|') !== billing.join('|')

  return (
    <>
      <Style />
      <FontLink family={props.fontFamily} />
      <section className="shp-inv-parties" style={font}>
        {showFrom && (
          <div className="shp-inv-party">
            <h2 className="shp-inv-h2" style={font}>{props.fromLabel?.trim() || 'From'}</h2>
            <address>
              {seller.name && <span className="shp-inv-strong">{seller.name}</span>}
              {(seller.addressLines ?? []).map((line, i) => <span key={i}>{line}</span>)}
              {seller.email && <span>{seller.email}</span>}
              {seller.phone && <span>{seller.phone}</span>}
            </address>
            {props.showRegistration !== 'no' && (seller.vatNumber || seller.companyNumber) && (
              <div className="shp-inv-reg">
                {seller.vatNumber && <span>VAT registration {seller.vatNumber}</span>}
                {seller.companyNumber && <span>Company number {seller.companyNumber}</span>}
              </div>
            )}
          </div>
        )}
        <div className="shp-inv-party">
          <h2 className="shp-inv-h2" style={font}>{props.toLabel?.trim() || 'Invoice to'}</h2>
          <address>
            {billing.length > 0
              ? billing.map((line, i) => <span key={i} className={i === 0 ? 'shp-inv-strong' : undefined}>{line}</span>)
              : <span className="shp-inv-strong">{customer.name}</span>}
            {customer.email && <span>{customer.email}</span>}
          </address>
        </div>
        {differentDelivery && (
          <div className="shp-inv-party">
            <h2 className="shp-inv-h2" style={font}>{props.deliverLabel?.trim() || 'Delivered to'}</h2>
            <address>
              {shipping.map((line, i) => <span key={i} className={i === 0 ? 'shp-inv-strong' : undefined}>{line}</span>)}
            </address>
          </div>
        )}
      </section>
    </>
  )
}

export const shopInvoicePartiesPuckComponent = {
  label: 'Invoice: From and to',
  fields: {
    fontFamily: fontField,
    showFrom: { type: 'select' as const, label: 'Your own details', options: yesNo },
    fromLabel: { type: 'text' as const, label: '"From" heading' },
    toLabel: { type: 'text' as const, label: '"Invoice to" heading' },
    showDelivery: { type: 'select' as const, label: 'Delivery address, when it differs', options: yesNo },
    deliverLabel: { type: 'text' as const, label: '"Delivered to" heading' },
    showRegistration: { type: 'select' as const, label: 'VAT and company numbers', options: yesNo },
  },
  defaultProps: {
    fontFamily: '', showFrom: 'yes', fromLabel: 'From', toLabel: 'Invoice to',
    showDelivery: 'yes', deliverLabel: 'Delivered to', showRegistration: 'yes',
  },
  render: ShopInvoiceParties,
}
export const shopInvoicePartiesPuckRscComponent = { ...shopInvoicePartiesPuckComponent, render: ShopInvoiceParties }

// ---------------------------------------------------------------------------
// Lines: what was charged for
// ---------------------------------------------------------------------------

type LinesProps = DocProps & {
  showSku?: string; showDetail?: string; showTaxRate?: string
  itemLabel?: string; qtyLabel?: string; priceLabel?: string; rateLabel?: string; totalLabel?: string
}

export function ShopInvoiceLines(props: LinesProps) {
  const { invoice } = useCtx(props)
  const font = fontStyle(props)
  const symbol = invoice.currencySymbol || '£'
  // Off unless asked for. A product code is the shop's own filing reference; the
  // customer's accountant wants the description and the money, and a column of
  // codes beside every line is the first thing an owner asks to have taken off.
  const showSku = props.showSku === 'yes'
  const showDetail = props.showDetail !== 'no'
  // A single-rate shop gains nothing from a column that says 20% all the way
  // down - the VAT summary below already says so once.
  const showRate = props.showTaxRate === 'yes'
  const lines = invoice.lines ?? []

  return (
    <>
      <Style />
      <FontLink family={props.fontFamily} />
      <table className="shp-inv-lines" style={font}>
        <thead>
          <tr>
            <th>{props.itemLabel?.trim() || 'Description'}</th>
            <th className="shp-inv-num">{props.qtyLabel?.trim() || 'Qty'}</th>
            <th className="shp-inv-num">{props.priceLabel?.trim() || 'Unit price'}</th>
            {showRate && <th className="shp-inv-num">{props.rateLabel?.trim() || 'Rate'}</th>}
            <th className="shp-inv-num">{props.totalLabel?.trim() || 'Amount'}</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, index) => (
            <tr key={`${line.sku ?? line.name}-${index}`}>
              <td>
                <span className="shp-inv-name">{line.name}</span>
                {showSku && line.sku && <span className="shp-inv-sku">{line.sku}</span>}
                {showDetail && line.detail?.length > 0 && (
                  <ul className="shp-inv-detail">
                    {line.detail.map((row, i) => (
                      <li key={i}><span>{row.label}:</span> {row.value}</li>
                    ))}
                  </ul>
                )}
              </td>
              <td className="shp-inv-num">{line.quantity}</td>
              <td className="shp-inv-num">{formatMoney(line.unitPrice, symbol)}</td>
              {showRate && <td className="shp-inv-num">{line.taxRatePercent}%</td>}
              <td className="shp-inv-num">{formatMoney(line.lineTotal, symbol)}</td>
            </tr>
          ))}
          {lines.length === 0 && (
            <tr>
              <td colSpan={showRate ? 5 : 4} className="shp-inv-empty">There is nothing on this invoice.</td>
            </tr>
          )}
        </tbody>
      </table>
    </>
  )
}

export const shopInvoiceLinesPuckComponent = {
  label: 'Invoice: Items',
  fields: {
    fontFamily: fontField,
    showSku: { type: 'select' as const, label: 'Product codes', options: yesNo },
    showDetail: { type: 'select' as const, label: 'Options and personalisation', options: yesNo },
    showTaxRate: { type: 'select' as const, label: 'Tax rate column', options: yesNo },
    itemLabel: { type: 'text' as const, label: 'Description column' },
    qtyLabel: { type: 'text' as const, label: 'Quantity column' },
    priceLabel: { type: 'text' as const, label: 'Unit price column' },
    rateLabel: { type: 'text' as const, label: 'Rate column' },
    totalLabel: { type: 'text' as const, label: 'Amount column' },
  },
  defaultProps: {
    fontFamily: '', showSku: 'no', showDetail: 'yes', showTaxRate: 'no',
    itemLabel: 'Description', qtyLabel: 'Qty', priceLabel: 'Unit price', rateLabel: 'Rate', totalLabel: 'Amount',
  },
  render: ShopInvoiceLines,
}
export const shopInvoiceLinesPuckRscComponent = { ...shopInvoiceLinesPuckComponent, render: ShopInvoiceLines }

// ---------------------------------------------------------------------------
// Totals
// ---------------------------------------------------------------------------

type TotalsProps = DocProps & {
  subtotalLabel?: string; discountLabel?: string; deliveryLabel?: string
  taxLabel?: string; totalLabel?: string; showPaid?: string; paidWording?: string
}

export function ShopInvoiceTotals(props: TotalsProps) {
  const { invoice } = useCtx(props)
  const font = fontStyle(props)
  const symbol = invoice.currencySymbol || '£'
  const inclusive = invoice.taxMode === 'INCLUSIVE'
  const discount = Number(invoice.discountAmount)
  const shipping = Number(invoice.shippingAmount)
  const tax = Number(invoice.taxAmount)
  const taxLabel = props.taxLabel?.trim() || invoice.wording?.taxLabel || 'VAT'

  return (
    <>
      <Style />
      <FontLink family={props.fontFamily} />
      <dl className="shp-inv-totals" style={font}>
        <dt>{props.subtotalLabel?.trim() || 'Subtotal'}</dt>
        <dd>{formatMoney(invoice.subtotal, symbol)}</dd>
        {discount > 0 && (
          <div className="shp-inv-row">
            <dt>{props.discountLabel?.trim() || 'Discount'}</dt>
            <dd>-{formatMoney(discount, symbol)}</dd>
          </div>
        )}
        {shipping > 0 && (
          <div className="shp-inv-row">
            <dt>{props.deliveryLabel?.trim() || 'Delivery'}</dt>
            <dd>{formatMoney(shipping, symbol)}</dd>
          </div>
        )}
        {tax > 0 && (
          <div className="shp-inv-row">
            {/* An INCLUSIVE shop's prices already carry the tax, so the row is a
                statement of how much of the total it is - not an addition. Say
                which, or the arithmetic looks wrong by exactly the VAT. */}
            <dt>{taxLabel}{inclusive ? ' (included)' : ''}</dt>
            <dd>{formatMoney(tax, symbol)}</dd>
          </div>
        )}
        <dt className="shp-inv-grand">{props.totalLabel?.trim() || 'Total'}</dt>
        <dd className="shp-inv-grand">{formatMoney(invoice.total, symbol)}</dd>
      </dl>
      {props.showPaid !== 'no' && (
        <p className="shp-inv-paid" style={font}>
          {props.paidWording?.trim() || 'Paid in full - thank you.'}
        </p>
      )}
    </>
  )
}

export const shopInvoiceTotalsPuckComponent = {
  label: 'Invoice: Totals',
  fields: {
    fontFamily: fontField,
    subtotalLabel: { type: 'text' as const, label: 'Subtotal row' },
    discountLabel: { type: 'text' as const, label: 'Discount row' },
    deliveryLabel: { type: 'text' as const, label: 'Delivery row' },
    taxLabel: { type: 'text' as const, label: 'Tax row (blank uses the one in Shop settings)' },
    totalLabel: { type: 'text' as const, label: 'Total row' },
    showPaid: { type: 'select' as const, label: 'Line under the total', options: yesNo },
    paidWording: { type: 'text' as const, label: 'What that line says' },
  },
  defaultProps: {
    fontFamily: '', subtotalLabel: 'Subtotal', discountLabel: 'Discount', deliveryLabel: 'Delivery',
    taxLabel: '', totalLabel: 'Total', showPaid: 'yes', paidWording: 'Paid in full - thank you.',
  },
  render: ShopInvoiceTotals,
}
export const shopInvoiceTotalsPuckRscComponent = { ...shopInvoiceTotalsPuckComponent, render: ShopInvoiceTotals }

// ---------------------------------------------------------------------------
// Tax summary: net, tax and gross at each rate
// ---------------------------------------------------------------------------
//
// The block that makes this a VAT invoice rather than a receipt with a total on
// it. A single-rate shop gets one row; a shop selling books alongside desks gets
// two, and its customer's accountant can reclaim the right amount without
// working anything out.

type TaxProps = DocProps & {
  heading?: string; rateLabel?: string; netLabel?: string; taxLabel?: string; grossLabel?: string
  hideWhenSingleZero?: string
}

export function ShopInvoiceTaxSummary(props: TaxProps) {
  const { invoice } = useCtx(props)
  const font = fontStyle(props)
  const symbol = invoice.currencySymbol || '£'
  const rows = invoice.taxBreakdown ?? []
  if (rows.length === 0) return null
  // A shop that charges no tax at all has nothing to summarise, and a table of
  // zeroes on every invoice invites the question "why is this here".
  const allZero = rows.every((row) => Number(row.tax) === 0)
  if (allZero && props.hideWhenSingleZero !== 'no') return null

  return (
    <>
      <Style />
      <FontLink family={props.fontFamily} />
      <section className="shp-inv-vat" style={font}>
        <h2 className="shp-inv-h2" style={font}>
          {props.heading?.trim() || `${invoice.wording?.taxLabel || 'VAT'} summary`}
        </h2>
        <table>
          <thead>
            <tr>
              <th>{props.rateLabel?.trim() || 'Rate'}</th>
              <th>{props.netLabel?.trim() || 'Net'}</th>
              <th>{props.taxLabel?.trim() || invoice.wording?.taxLabel || 'VAT'}</th>
              <th>{props.grossLabel?.trim() || 'Gross'}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.ratePercent}>
                <td>{row.ratePercent}%</td>
                <td>{formatMoney(row.net, symbol)}</td>
                <td>{formatMoney(row.tax, symbol)}</td>
                <td>{formatMoney(row.gross, symbol)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  )
}

export const shopInvoiceTaxSummaryPuckComponent = {
  label: 'Invoice: Tax summary',
  fields: {
    fontFamily: fontField,
    heading: { type: 'text' as const, label: 'Heading' },
    rateLabel: { type: 'text' as const, label: 'Rate column' },
    netLabel: { type: 'text' as const, label: 'Net column' },
    taxLabel: { type: 'text' as const, label: 'Tax column' },
    grossLabel: { type: 'text' as const, label: 'Gross column' },
    hideWhenSingleZero: { type: 'select' as const, label: 'Print it even when no tax was charged', options: [
      { value: 'no', label: 'Always print it' },
      { value: 'yes', label: 'Hide it when there is no tax' },
    ] },
  },
  defaultProps: {
    fontFamily: '', heading: '', rateLabel: 'Rate', netLabel: 'Net', taxLabel: '', grossLabel: 'Gross',
    hideWhenSingleZero: 'yes',
  },
  render: ShopInvoiceTaxSummary,
}
export const shopInvoiceTaxSummaryPuckRscComponent = { ...shopInvoiceTaxSummaryPuckComponent, render: ShopInvoiceTaxSummary }

// ---------------------------------------------------------------------------
// Payment: how to pay, the terms, and whatever goes at the foot
// ---------------------------------------------------------------------------

type PaymentProps = DocProps & {
  showPaymentDetails?: string; paymentHeading?: string
  showTerms?: string; termsHeading?: string; showFooter?: string; footerAlign?: string
}

/** Plain text from a settings textarea, split on blank lines into paragraphs -
 *  a textarea is not a rich-text field and paragraphs are all it can mean. */
function paragraphs(value: string): string[] {
  return value.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean)
}

export function ShopInvoicePayment(props: PaymentProps) {
  const { invoice } = useCtx(props)
  const font = fontStyle(props)
  const wording = invoice.wording ?? ({} as typeof invoice.wording)
  const showPayment = props.showPaymentDetails !== 'no' && Boolean(wording.paymentDetails)
  const showTerms = props.showTerms !== 'no' && Boolean(wording.terms)
  const showFooter = props.showFooter !== 'no' && Boolean(wording.footer)
  // A strapline under a rule reads as a footer when it is centred and as an
  // unfinished sentence when it is not. Centred unless a layout says otherwise.
  const footerAlign = props.footerAlign === 'left' || props.footerAlign === 'right' ? props.footerAlign : 'center'
  if (!showPayment && !showTerms && !showFooter) return null

  return (
    <>
      <Style />
      <FontLink family={props.fontFamily} />
      <section className="shp-inv-pay" style={font}>
        {showPayment && (
          <div className="shp-inv-block">
            <h2 className="shp-inv-h2" style={font}>{props.paymentHeading?.trim() || 'Payment'}</h2>
            {paragraphs(wording.paymentDetails).map((para, i) => <p key={i}>{para}</p>)}
          </div>
        )}
        {showTerms && (
          <div className="shp-inv-block">
            <h2 className="shp-inv-h2" style={font}>{props.termsHeading?.trim() || 'Terms'}</h2>
            {paragraphs(wording.terms).map((para, i) => <p key={i}>{para}</p>)}
          </div>
        )}
      </section>
      {showFooter && (
        <p className="shp-inv-foot" style={{ ...font, textAlign: footerAlign }}>{wording.footer}</p>
      )}
    </>
  )
}

export const shopInvoicePaymentPuckComponent = {
  label: 'Invoice: Payment and terms',
  fields: {
    fontFamily: fontField,
    showPaymentDetails: { type: 'select' as const, label: 'How to pay', options: yesNo },
    paymentHeading: { type: 'text' as const, label: 'Payment heading' },
    showTerms: { type: 'select' as const, label: 'Terms', options: yesNo },
    termsHeading: { type: 'text' as const, label: 'Terms heading' },
    showFooter: { type: 'select' as const, label: 'Footer line', options: yesNo },
    footerAlign: { type: 'select' as const, label: 'Footer line sits', options: [
      { value: 'center', label: 'Centred' },
      { value: 'left', label: 'Left' },
      { value: 'right', label: 'Right' },
    ] },
  },
  defaultProps: {
    fontFamily: '', showPaymentDetails: 'yes', paymentHeading: 'Payment',
    showTerms: 'yes', termsHeading: 'Terms', showFooter: 'yes', footerAlign: 'center',
  },
  render: ShopInvoicePayment,
}
export const shopInvoicePaymentPuckRscComponent = { ...shopInvoicePaymentPuckComponent, render: ShopInvoicePayment }
