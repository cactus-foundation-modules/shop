import { formatMoney } from '@/modules/shop/lib/money'
import {
  Style, FontLink, fontStyle, fontField, ptField, sizeVars, yesNo, formatDay, paragraphs, useCtx,
  type DocProps,
} from '@/modules/shop/components/puck/invoice-shared'

// The invoice document, as six draggable blocks on the `shopInvoice` layout
// type: the heading, who it is between, the lines, the money, the VAT summary
// and the payment small print. Four more - the document style, a notice panel, a
// footer and a rule - live in invoice-chrome.tsx.
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
//
// Every look-and-feel field added here follows one rule: the value a layout
// saved before the field existed carries - which is `undefined` - must render
// what it rendered then. So the defaults read as `!== 'no'` or fall through to
// the old behaviour, never `=== 'yes'` for something that used to be on.

// ---------------------------------------------------------------------------
// Header: which invoice, and when
// ---------------------------------------------------------------------------
//
// The letterhead is NOT here. The picture at the top of the document is core's
// own Site Logo block, dropped on the layout above this one, so it can be sized,
// nudged and moved without going through a field on the heading - and so the
// invoice, the quote and every other document draw the same logo the same way
// rather than each keeping a copy of the question.
//
// A layout published before that change carries `showLogo` and `showName` props
// this block no longer reads. They are ignored, which means the letterhead is
// gone from that document until somebody adds the Site Logo block to it. Said
// plainly in the release notes, because it is the one thing an owner has to do
// by hand.

type HeaderProps = DocProps & {
  heading?: string
  showOrderNumber?: string; showTaxPoint?: string; taxPointLabel?: string
  titleSize?: string; sides?: string; rule?: string
  factsLayout?: string; numberStyle?: string
  dateLabel?: string; dueLabel?: string; orderLabel?: string; invoiceLabel?: string
  titlePt?: number; numberPt?: number; factsPt?: number; introPt?: number
}

const TITLE_SIZES: Record<string, string> = {
  small: ' shp-inv-title-sm',
  medium: '',
  large: ' shp-inv-title-lg',
  display: ' shp-inv-title-xl',
}

const HEAD_RULES: Record<string, string> = {
  hairline: '',
  accent: ' shp-inv-head-accent',
  none: ' shp-inv-head-flat',
}

export function ShopInvoiceHeader(props: HeaderProps) {
  const { invoice, credit } = useCtx(props)
  const heading = props.heading?.trim() || invoice.wording?.heading || 'Invoice'
  const font = fontStyle(props)
  const sizes = sizeVars({
    '--shp-inv-title-size': props.titlePt,
    '--shp-inv-lead-size': props.numberPt,
    '--shp-inv-facts-size': props.factsPt,
  })

  const headClass = [
    'shp-inv-head',
    props.sides === 'title-left' ? 'shp-inv-swap' : '',
    (HEAD_RULES[props.rule ?? 'hairline'] ?? '').trim(),
  ].filter(Boolean).join(' ')
  // Stacked reads "Issued 6 April 2026" on one line; columns rules the labels
  // and the values into two, which is what the document has always done.
  const stacked = props.factsLayout === 'stacked'
  // The document's own number, lifted out of the list and printed above it with
  // no label. An invoice number needs no introduction and the dates under it are
  // supporting detail, which is how most printed invoices are set.
  const leadNumber = props.numberStyle === 'lead'
  const documentNumber = credit ? credit.creditNoteNumber : invoice.invoiceNumber
  const invoiceLabel = props.invoiceLabel?.trim() || 'Invoice'

  return (
    <>
      <Style />
      <FontLink family={props.fontFamily} />
      <header className={headClass} style={{ ...font, ...sizes }}>
        <div className="shp-inv-meta">
          <h1 className={`shp-inv-h1${TITLE_SIZES[props.titleSize ?? 'medium'] ?? ''}`} style={font}>{heading}</h1>
          {leadNumber && documentNumber && <p className="shp-inv-lead">{documentNumber}</p>}
          <dl className={`shp-inv-facts${stacked ? ' shp-inv-facts-stack' : ''}`}>
            {/* A credit note leads with its own number and then names the
                invoice it credits. The reference is not decoration: a credit
                note that does not say which invoice it undoes is not one, and
                it is the first thing an accountant looks for. Lifted above the
                list when the number leads, so it is never printed twice. */}
            {credit && !leadNumber && (
              <>
                <dt>{invoice.wording?.heading?.trim() || 'Credit note'}</dt>
                <dd>{credit.creditNoteNumber}</dd>
              </>
            )}
            {/* Skipped on a credit note whose invoice row has since been
                deleted - an empty "Invoice" row says less than no row. And
                skipped on an ordinary invoice whose number already leads. */}
            {(!credit || invoice.invoiceNumber) && !(leadNumber && !credit) && (
              <>
                <dt>{invoiceLabel}</dt>
                <dd>{invoice.invoiceNumber}</dd>
              </>
            )}
            {props.showOrderNumber !== 'no' && invoice.orderNumber && (
              <>
                <dt>{props.orderLabel?.trim() || 'Order'}</dt>
                <dd>{invoice.orderNumber}</dd>
              </>
            )}
            <dt>{props.dateLabel?.trim() || 'Date'}</dt>
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
                <dt>{props.dueLabel?.trim() || 'Due by'}</dt>
                <dd>{formatDay(invoice.dueDate)}</dd>
              </>
            )}
          </dl>
          {/* A voided invoice still opens - the number is spent and the document
              is part of the trail - so it has to say so on its face. */}
          {invoice.status === 'VOID' && <span className="shp-inv-void">Void</span>}
        </div>
      </header>
      {/* A sibling of the header rather than a child of it, so it carries its
          own size property - a custom property reaches its own subtree and
          nothing else. */}
      {invoice.wording?.intro && (
        <p className="shp-inv-intro" style={{ ...font, ...sizeVars({ '--shp-inv-intro-size': props.introPt }) }}>
          {invoice.wording.intro}
        </p>
      )}
    </>
  )
}

export const shopInvoiceHeaderPuckComponent = {
  label: 'Invoice: Heading',
  fields: {
    heading: { type: 'text' as const, label: 'Heading (blank uses the one in Shop settings)' },
    fontFamily: fontField,
    titleSize: { type: 'select' as const, label: 'Heading size', options: [
      { value: 'small', label: 'Small' },
      { value: 'medium', label: 'Medium' },
      { value: 'large', label: 'Large' },
      { value: 'display', label: 'Very large' },
    ] },
    titlePt: ptField('Heading size in points (overrides the box above)'),
    sides: { type: 'select' as const, label: 'The heading sits', options: [
      // Values kept as they were: a layout saved when this also flipped the logo
      // keeps the side it was set to, without a data migration.
      { value: 'logo-left', label: 'At the right' },
      { value: 'title-left', label: 'At the left' },
    ] },
    rule: { type: 'select' as const, label: 'Rule underneath', options: [
      { value: 'hairline', label: 'Hairline' },
      { value: 'accent', label: 'Thick, in the accent colour' },
      { value: 'none', label: 'None' },
    ] },
    factsLayout: { type: 'select' as const, label: 'Dates and numbers', options: [
      { value: 'columns', label: 'Labels and values in two columns' },
      { value: 'stacked', label: 'One line each, label first' },
    ] },
    numberStyle: { type: 'select' as const, label: 'The invoice number', options: [
      { value: 'row', label: 'As a row, with the rest' },
      { value: 'lead', label: 'On its own, above the dates' },
    ] },
    invoiceLabel: { type: 'text' as const, label: '"Invoice" row label' },
    showOrderNumber: { type: 'select' as const, label: 'Order number', options: yesNo },
    orderLabel: { type: 'text' as const, label: '"Order" row label' },
    dateLabel: { type: 'text' as const, label: '"Date" row label' },
    dueLabel: { type: 'text' as const, label: '"Due by" row label' },
    showTaxPoint: { type: 'select' as const, label: 'Tax point date as its own row', options: yesNo },
    taxPointLabel: { type: 'text' as const, label: 'Tax point row label' },
    numberPt: ptField('Invoice number size in points'),
    factsPt: ptField('Dates and numbers size in points'),
    introPt: ptField('Opening line size in points'),
  },
  // No defaults for the point sizes on purpose: blank is "leave it as it is",
  // and a default would set every document's sizes the moment the field shipped.
  defaultProps: {
    heading: '', fontFamily: '', titleSize: 'medium', sides: 'logo-left', rule: 'hairline',
    factsLayout: 'columns', numberStyle: 'row',
    invoiceLabel: 'Invoice', showOrderNumber: 'yes', orderLabel: 'Order',
    dateLabel: 'Date', dueLabel: 'Due by',
    showTaxPoint: 'no', taxPointLabel: 'Tax point',
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
  order?: string; columns?: string; showEmail?: string
  headingPt?: number; addressPt?: number; registrationPt?: number
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
  const showEmail = props.showEmail !== 'no'

  const from = showFrom ? (
    <div className="shp-inv-party" key="from">
      <h2 className="shp-inv-h2" style={font}>{props.fromLabel?.trim() || 'From'}</h2>
      <address>
        {seller.name && <span className="shp-inv-strong">{seller.name}</span>}
        {(seller.addressLines ?? []).map((line, i) => <span key={i}>{line}</span>)}
        {showEmail && seller.email && <span>{seller.email}</span>}
        {seller.phone && <span>{seller.phone}</span>}
      </address>
      {props.showRegistration !== 'no' && (seller.vatNumber || seller.companyNumber) && (
        <div className="shp-inv-reg">
          {seller.vatNumber && <span>VAT registration {seller.vatNumber}</span>}
          {seller.companyNumber && <span>Company number {seller.companyNumber}</span>}
        </div>
      )}
    </div>
  ) : null

  const to = (
    <div className="shp-inv-party" key="to">
      <h2 className="shp-inv-h2" style={font}>{props.toLabel?.trim() || 'Invoice to'}</h2>
      <address>
        {billing.length > 0
          ? billing.map((line, i) => <span key={i} className={i === 0 ? 'shp-inv-strong' : undefined}>{line}</span>)
          : <span className="shp-inv-strong">{customer.name}</span>}
        {showEmail && customer.email && <span>{customer.email}</span>}
      </address>
    </div>
  )

  const deliver = differentDelivery ? (
    <div className="shp-inv-party" key="deliver">
      <h2 className="shp-inv-h2" style={font}>{props.deliverLabel?.trim() || 'Delivered to'}</h2>
      <address>
        {shipping.map((line, i) => <span key={i} className={i === 0 ? 'shp-inv-strong' : undefined}>{line}</span>)}
      </address>
    </div>
  ) : null

  // Whose details come first. "From" first is the older order and stays the
  // default; plenty of printed invoices lead with the customer instead, because
  // the customer is who the document is addressed to.
  const columns = props.order === 'to-first' ? [to, from, deliver] : [from, to, deliver]
  const width = props.columns === '2' || props.columns === '3' ? ` shp-inv-cols-${props.columns}` : ''

  return (
    <>
      <Style />
      <FontLink family={props.fontFamily} />
      <section
        className={`shp-inv-parties${width}`}
        style={{
          ...font,
          ...sizeVars({
            '--shp-inv-h2-size': props.headingPt,
            '--shp-inv-party-size': props.addressPt,
            '--shp-inv-reg-size': props.registrationPt,
          }),
        }}
      >
        {columns.filter(Boolean)}
      </section>
    </>
  )
}

export const shopInvoicePartiesPuckComponent = {
  label: 'Invoice: From and to',
  fields: {
    fontFamily: fontField,
    order: { type: 'select' as const, label: 'Which comes first', options: [
      { value: 'from-first', label: 'Your details, then theirs' },
      { value: 'to-first', label: 'Their details, then yours' },
    ] },
    columns: { type: 'select' as const, label: 'Columns', options: [
      { value: 'auto', label: 'As many as fit' },
      { value: '2', label: 'Always two' },
      { value: '3', label: 'Always three' },
    ] },
    showFrom: { type: 'select' as const, label: 'Your own details', options: yesNo },
    fromLabel: { type: 'text' as const, label: '"From" heading' },
    toLabel: { type: 'text' as const, label: '"Invoice to" heading' },
    showDelivery: { type: 'select' as const, label: 'Delivery address, when it differs', options: yesNo },
    deliverLabel: { type: 'text' as const, label: '"Delivered to" heading' },
    showEmail: { type: 'select' as const, label: 'Email addresses', options: yesNo },
    showRegistration: { type: 'select' as const, label: 'VAT and company numbers', options: yesNo },
    headingPt: ptField('Heading size in points'),
    addressPt: ptField('Address size in points'),
    registrationPt: ptField('VAT and company number size in points'),
  },
  defaultProps: {
    fontFamily: '', order: 'from-first', columns: 'auto',
    showFrom: 'yes', fromLabel: 'From', toLabel: 'Invoice to',
    showDelivery: 'yes', deliverLabel: 'Delivered to', showEmail: 'yes', showRegistration: 'yes',
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
  headStyle?: string; rowRules?: string; zebra?: string
  headPt?: number; rowPt?: number; skuPt?: number; detailPt?: number
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

  const table = [
    'shp-inv-lines',
    props.headStyle === 'filled' ? 'shp-inv-thead-fill' : '',
    props.zebra === 'yes' ? 'shp-inv-zebra' : '',
    props.rowRules === 'none' ? 'shp-inv-rows-none' : '',
  ].filter(Boolean).join(' ')

  return (
    <>
      <Style />
      <FontLink family={props.fontFamily} />
      <table
        className={table}
        style={{
          ...font,
          ...sizeVars({
            '--shp-inv-thead-size': props.headPt,
            '--shp-inv-row-size': props.rowPt,
            '--shp-inv-sku-size': props.skuPt,
            '--shp-inv-detail-size': props.detailPt,
          }),
        }}
      >
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
    headStyle: { type: 'select' as const, label: 'Column headings', options: [
      { value: 'rule', label: 'Ruled underneath' },
      { value: 'filled', label: 'On a filled band' },
    ] },
    rowRules: { type: 'select' as const, label: 'Rules between rows', options: [
      { value: 'every', label: 'Under every row' },
      { value: 'none', label: 'Only under the last one' },
    ] },
    zebra: { type: 'select' as const, label: 'Shade alternate rows', options: yesNo },
    showSku: { type: 'select' as const, label: 'Product codes', options: yesNo },
    showDetail: { type: 'select' as const, label: 'Options and personalisation', options: yesNo },
    showTaxRate: { type: 'select' as const, label: 'Tax rate column', options: yesNo },
    itemLabel: { type: 'text' as const, label: 'Description column' },
    qtyLabel: { type: 'text' as const, label: 'Quantity column' },
    priceLabel: { type: 'text' as const, label: 'Unit price column' },
    rateLabel: { type: 'text' as const, label: 'Rate column' },
    totalLabel: { type: 'text' as const, label: 'Amount column' },
    headPt: ptField('Column heading size in points'),
    rowPt: ptField('Item row size in points'),
    skuPt: ptField('Product code size in points'),
    detailPt: ptField('Options and personalisation size in points'),
  },
  defaultProps: {
    fontFamily: '', headStyle: 'rule', rowRules: 'every', zebra: 'no',
    showSku: 'no', showDetail: 'yes', showTaxRate: 'no',
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
  emphasis?: string; showTaxRate?: string; width?: string
  showDeliveryRow?: string; zeroDelivery?: string
  rowPt?: number; totalPt?: number; paidPt?: number
}

const TOTALS_WIDTHS: Record<string, string> = { narrow: '18rem', normal: '22rem', wide: '28rem' }

export function ShopInvoiceTotals(props: TotalsProps) {
  const { invoice, credit } = useCtx(props)
  const font = fontStyle(props)
  const symbol = invoice.currencySymbol || '£'
  const inclusive = invoice.taxMode === 'INCLUSIVE'
  const discount = Number(invoice.discountAmount)
  const shipping = Number(invoice.shippingAmount)
  const tax = Number(invoice.taxAmount)
  const taxLabel = props.taxLabel?.trim() || invoice.wording?.taxLabel || 'VAT'
  // "VAT at 20%" rather than "VAT", where a single rate covers the whole
  // document. Two rates make one figure in the label a lie, so it falls back to
  // the plain label and the tax summary block does the explaining.
  const rates = new Set((invoice.taxBreakdown ?? []).map((row) => String(row.ratePercent)))
  const singleRate = rates.size === 1 ? [...rates][0] : null
  const withRate = props.showTaxRate === 'yes' && singleRate ? `${taxLabel} at ${singleRate}%` : taxLabel
  // A delivery row printed even at zero, so a customer can see that delivery was
  // free rather than wondering whether it is still to come.
  const showDelivery = props.showDeliveryRow === 'always' || shipping > 0
  const deliveryValue = shipping > 0
    ? formatMoney(shipping, symbol)
    : props.zeroDelivery?.trim() || formatMoney(0, symbol)

  const listClass = `shp-inv-totals${props.emphasis === 'accent' ? ' shp-inv-total-accent' : ''}`
  const width = TOTALS_WIDTHS[props.width ?? 'normal']

  return (
    <>
      <Style />
      <FontLink family={props.fontFamily} />
      <dl
        className={listClass}
        style={{
          ...font,
          maxWidth: width,
          ...sizeVars({ '--shp-inv-totals-size': props.rowPt, '--shp-inv-grand-size': props.totalPt }),
        }}
      >
        <dt>{props.subtotalLabel?.trim() || 'Subtotal'}</dt>
        <dd>{formatMoney(invoice.subtotal, symbol)}</dd>
        {discount > 0 && (
          <div className="shp-inv-row">
            <dt>{props.discountLabel?.trim() || 'Discount'}</dt>
            <dd>-{formatMoney(discount, symbol)}</dd>
          </div>
        )}
        {showDelivery && (
          <div className="shp-inv-row">
            <dt>{props.deliveryLabel?.trim() || 'Delivery'}</dt>
            <dd>{deliveryValue}</dd>
          </div>
        )}
        {tax > 0 && (
          <div className="shp-inv-row">
            {/* An INCLUSIVE shop's prices already carry the tax, so the row is a
                statement of how much of the total it is - not an addition. Say
                which, or the arithmetic looks wrong by exactly the VAT. */}
            <dt>{withRate}{inclusive ? ' (included)' : ''}</dt>
            <dd>{formatMoney(tax, symbol)}</dd>
          </div>
        )}
        <dt className="shp-inv-grand">{props.totalLabel?.trim() || 'Total'}</dt>
        <dd className="shp-inv-grand">{formatMoney(invoice.total, symbol)}</dd>
      </dl>
      {props.showPaid !== 'no' && (
        <p className="shp-inv-paid" style={{ ...font, ...sizeVars({ '--shp-inv-paid-size': props.paidPt }) }}>
          {/* "Paid in full - thank you" on a refund would be quite the insult.
              The credit note's own wording was snapshotted onto it when it was
              raised, so a later edit in settings does not rewrite paperwork
              already sent out - and the block's own override is ignored here,
              because it was written for the other document. */}
          {credit
            ? invoice.wording?.creditWording?.trim() || 'This amount has been refunded to your original payment method.'
            : props.paidWording?.trim() || 'Paid in full - thank you.'}
        </p>
      )}
    </>
  )
}

export const shopInvoiceTotalsPuckComponent = {
  label: 'Invoice: Totals',
  fields: {
    fontFamily: fontField,
    emphasis: { type: 'select' as const, label: 'The total', options: [
      { value: 'rule', label: 'Bold, above a hairline' },
      { value: 'accent', label: 'Large, above an accent rule' },
    ] },
    width: { type: 'select' as const, label: 'How wide', options: [
      { value: 'narrow', label: 'Narrow' },
      { value: 'normal', label: 'Normal' },
      { value: 'wide', label: 'Wide' },
    ] },
    subtotalLabel: { type: 'text' as const, label: 'Subtotal row' },
    discountLabel: { type: 'text' as const, label: 'Discount row' },
    deliveryLabel: { type: 'text' as const, label: 'Delivery row' },
    showDeliveryRow: { type: 'select' as const, label: 'Delivery row when there is no charge', options: [
      { value: 'charged', label: 'Leave it off' },
      { value: 'always', label: 'Print it anyway' },
    ] },
    zeroDelivery: { type: 'text' as const, label: 'What a free delivery says (e.g. "Free")' },
    taxLabel: { type: 'text' as const, label: 'Tax row (blank uses the one in Shop settings)' },
    showTaxRate: { type: 'select' as const, label: 'Put the rate in the tax row', options: yesNo },
    totalLabel: { type: 'text' as const, label: 'Total row' },
    showPaid: { type: 'select' as const, label: 'Line under the total', options: yesNo },
    paidWording: { type: 'text' as const, label: 'What that line says' },
    rowPt: ptField('Row size in points'),
    totalPt: ptField('Total size in points'),
    paidPt: ptField('Size in points of the line under the total'),
  },
  defaultProps: {
    fontFamily: '', emphasis: 'rule', width: 'normal',
    subtotalLabel: 'Subtotal', discountLabel: 'Discount', deliveryLabel: 'Delivery',
    showDeliveryRow: 'charged', zeroDelivery: '',
    taxLabel: '', showTaxRate: 'no', totalLabel: 'Total',
    showPaid: 'yes', paidWording: 'Paid in full - thank you.',
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
  hideWhenSingleZero?: string; headStyle?: string; align?: string
  headingPt?: number; headPt?: number; rowPt?: number
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
  // A shop selling everything at one rate says so once in the totals ("VAT at
  // 20%"), and a four-column table restating the same figures underneath is
  // filler. The moment a second rate appears the table comes back on its own,
  // which is the point at which it stops being filler and starts being the
  // thing that makes this a VAT invoice.
  if (rows.length === 1 && props.hideWhenSingleZero === 'single') return null
  const filled = props.headStyle === 'filled' ? ' shp-inv-thead-fill' : ''

  return (
    <>
      <Style />
      <FontLink family={props.fontFamily} />
      <section
        className="shp-inv-vat"
        style={{
          ...font,
          ...sizeVars({
            '--shp-inv-h2-size': props.headingPt,
            '--shp-inv-vat-head-size': props.headPt,
            '--shp-inv-vat-size': props.rowPt,
          }),
        }}
      >
        <h2 className="shp-inv-h2" style={font}>
          {props.heading?.trim() || `${invoice.wording?.taxLabel || 'VAT'} summary`}
        </h2>
        <table className={filled.trim() || undefined} style={props.align === 'left' ? { marginLeft: 0 } : undefined}>
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
    headStyle: { type: 'select' as const, label: 'Column headings', options: [
      { value: 'rule', label: 'Ruled underneath' },
      { value: 'filled', label: 'On a filled band' },
    ] },
    align: { type: 'select' as const, label: 'Sits', options: [
      { value: 'right', label: 'At the right, under the totals' },
      { value: 'left', label: 'At the left' },
    ] },
    rateLabel: { type: 'text' as const, label: 'Rate column' },
    netLabel: { type: 'text' as const, label: 'Net column' },
    taxLabel: { type: 'text' as const, label: 'Tax column' },
    grossLabel: { type: 'text' as const, label: 'Gross column' },
    hideWhenSingleZero: { type: 'select' as const, label: 'When to print it', options: [
      { value: 'no', label: 'Always' },
      { value: 'yes', label: 'Unless no tax was charged' },
      { value: 'single', label: 'Only when there is more than one rate' },
    ] },
    headingPt: ptField('Heading size in points'),
    headPt: ptField('Column heading size in points'),
    rowPt: ptField('Row size in points'),
  },
  defaultProps: {
    fontFamily: '', heading: '', headStyle: 'rule', align: 'right',
    rateLabel: 'Rate', netLabel: 'Net', taxLabel: '', grossLabel: 'Gross',
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
  columns?: string; paymentExtra?: string; termsExtra?: string
  headingPt?: number; bodyPt?: number; footerPt?: number
}

export function ShopInvoicePayment(props: PaymentProps) {
  const { invoice } = useCtx(props)
  const font = fontStyle(props)
  const wording = invoice.wording ?? ({} as typeof invoice.wording)
  // The extra paragraph is the block's own, not the shop's - somewhere to put a
  // sentence that belongs to this document's design rather than to every
  // invoice ever issued. It counts towards the block having something to say.
  const paymentExtra = props.paymentExtra?.trim() ?? ''
  const termsExtra = props.termsExtra?.trim() ?? ''
  const showPayment = props.showPaymentDetails !== 'no' && Boolean(wording.paymentDetails || paymentExtra)
  const showTerms = props.showTerms !== 'no' && Boolean(wording.terms || termsExtra)
  const showFooter = props.showFooter !== 'no' && Boolean(wording.footer)
  // A strapline under a rule reads as a footer when it is centred and as an
  // unfinished sentence when it is not. Centred unless a layout says otherwise.
  const footerAlign = props.footerAlign === 'left' || props.footerAlign === 'right' ? props.footerAlign : 'center'
  if (!showPayment && !showTerms && !showFooter) return null
  const cols = props.columns === '2' ? ' shp-inv-cols-2' : ''

  return (
    <>
      <Style />
      <FontLink family={props.fontFamily} />
      <section
        className={`shp-inv-pay${cols}`}
        style={{
          ...font,
          ...sizeVars({ '--shp-inv-h2-size': props.headingPt, '--shp-inv-pay-size': props.bodyPt }),
        }}
      >
        {showPayment && (
          <div className="shp-inv-block">
            <h2 className="shp-inv-h2" style={font}>{props.paymentHeading?.trim() || 'Payment'}</h2>
            {paragraphs(wording.paymentDetails ?? '').map((para, i) => <p key={i}>{para}</p>)}
            {paragraphs(paymentExtra).map((para, i) => <p key={`x${i}`}>{para}</p>)}
          </div>
        )}
        {showTerms && (
          <div className="shp-inv-block">
            <h2 className="shp-inv-h2" style={font}>{props.termsHeading?.trim() || 'Terms'}</h2>
            {paragraphs(wording.terms ?? '').map((para, i) => <p key={i}>{para}</p>)}
            {paragraphs(termsExtra).map((para, i) => <p key={`x${i}`}>{para}</p>)}
          </div>
        )}
      </section>
      {showFooter && (
        <p
          className="shp-inv-foot"
          style={{ ...font, textAlign: footerAlign, ...sizeVars({ '--shp-inv-foot-size': props.footerPt }) }}
        >
          {wording.footer}
        </p>
      )}
    </>
  )
}

export const shopInvoicePaymentPuckComponent = {
  label: 'Invoice: Payment and terms',
  fields: {
    fontFamily: fontField,
    columns: { type: 'select' as const, label: 'Payment and terms', options: [
      { value: '1', label: 'One under the other' },
      { value: '2', label: 'Side by side' },
    ] },
    showPaymentDetails: { type: 'select' as const, label: 'How to pay', options: yesNo },
    paymentHeading: { type: 'text' as const, label: 'Payment heading' },
    paymentExtra: { type: 'textarea' as const, label: 'Extra payment wording, on this layout only' },
    showTerms: { type: 'select' as const, label: 'Terms', options: yesNo },
    termsHeading: { type: 'text' as const, label: 'Terms heading' },
    termsExtra: { type: 'textarea' as const, label: 'Extra terms wording, on this layout only' },
    showFooter: { type: 'select' as const, label: 'Footer line', options: yesNo },
    footerAlign: { type: 'select' as const, label: 'Footer line sits', options: [
      { value: 'center', label: 'Centred' },
      { value: 'left', label: 'Left' },
      { value: 'right', label: 'Right' },
    ] },
    headingPt: ptField('Heading size in points'),
    bodyPt: ptField('Body size in points'),
    footerPt: ptField('Footer line size in points'),
  },
  defaultProps: {
    fontFamily: '', columns: '1', showPaymentDetails: 'yes', paymentHeading: 'Payment', paymentExtra: '',
    showTerms: 'yes', termsHeading: 'Terms', termsExtra: '', showFooter: 'yes', footerAlign: 'center',
  },
  render: ShopInvoicePayment,
}
export const shopInvoicePaymentPuckRscComponent = { ...shopInvoicePaymentPuckComponent, render: ShopInvoicePayment }
