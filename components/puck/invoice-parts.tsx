import type { ReactElement } from 'react'
import { formatMoney } from '@/modules/shop/lib/money'
import { invoiceChargeRows } from '@/modules/shop/lib/invoice-tax'
import type { InvoiceDocContext } from '@/modules/shop/lib/invoice-doc-context'
import {
  Style, FontLink, fontStyle, fontField, sizeField, radiusField, spaceField, sizeVars, cssLength,
  yesNo, formatDay, paragraphs, useCtx,
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
  showCustomerReference?: string; customerReferenceLabel?: string
  showDate?: string; showDue?: string
  titleSize?: string; sides?: string; rule?: string
  factsLayout?: string; numberStyle?: string
  dateLabel?: string; dueLabel?: string; orderLabel?: string; invoiceLabel?: string
  titlePt?: number | string; numberPt?: number | string; factsPt?: number | string; introPt?: number | string
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

  // Built as a list and then filtered, rather than as eight conditionals inside
  // the <dl>. A row whose value is empty used to reach the markup as a label
  // with nothing beside it, and in the stacked layout that is a line of white
  // space on the printed page under a heading that says nothing - which is what
  // "the invoice prints a gap where the due date should be" was. A row with no
  // value is not a row.
  const facts: { label: string; value: string }[] = []
  // A credit note leads with its own number and then names the invoice it
  // credits. The reference is not decoration: a credit note that does not say
  // which invoice it undoes is not one, and it is the first thing an accountant
  // looks for. Lifted above the list when the number leads, so it is never
  // printed twice.
  if (credit && !leadNumber) {
    facts.push({ label: invoice.wording?.heading?.trim() || 'Credit note', value: credit.creditNoteNumber })
  }
  // Skipped on a credit note whose invoice row has since been deleted - an empty
  // "Invoice" row says less than no row. And skipped on an ordinary invoice
  // whose number already leads.
  if (!(leadNumber && !credit)) facts.push({ label: invoiceLabel, value: invoice.invoiceNumber ?? '' })
  if (props.showOrderNumber !== 'no') facts.push({ label: props.orderLabel?.trim() || 'Order', value: invoice.orderNumber ?? '' })
  // The customer's OWN number for this order, where they gave one. On by
  // default, and safe to be: no document raised before the shop asked for one
  // carries a value, and a row with no value is dropped below - so an invoice
  // already in somebody's hands is unchanged, while a layout published last year
  // starts printing a purchase order number the day the owner switches the box
  // on, without anybody having to reopen the editor.
  //
  // The label comes from the document's own snapshot before its default, so it
  // reads the way the shop worded it on the day - an owner who renames the box
  // from "Purchase order number" to "Job reference" does not retitle every
  // invoice they have already sent.
  if (props.showCustomerReference !== 'no') {
    facts.push({
      label: props.customerReferenceLabel?.trim() || invoice.wording?.customerReferenceLabel?.trim() || 'Your reference',
      value: invoice.customer?.reference ?? '',
    })
  }
  if (props.showDate !== 'no') facts.push({ label: props.dateLabel?.trim() || 'Date', value: formatDay(invoice.taxPointDate) })
  // The tax point is the date the VAT belongs to. It is usually the same day as
  // the invoice, and printing it twice is noise - so it is a switch, off unless
  // an owner's accountant wants it.
  if (props.showTaxPoint === 'yes') {
    facts.push({ label: props.taxPointLabel?.trim() || 'Tax point', value: formatDay(invoice.taxPointDate) })
  }
  // Off entirely on a document that has no due date - a credit note, an invoice
  // for money already in the bank - and switchable off on one that has.
  if (props.showDue !== 'no') facts.push({ label: props.dueLabel?.trim() || 'Due by', value: formatDay(invoice.dueDate) })
  const rows = facts.filter((row) => row.value.trim() !== '')

  return (
    <>
      <Style />
      <FontLink family={props.fontFamily} />
      <header className={headClass} style={{ ...font, ...sizes }}>
        <div className="shp-inv-meta">
          <h1 className={`shp-inv-h1${TITLE_SIZES[props.titleSize ?? 'medium'] ?? ''}`} style={font}>{heading}</h1>
          {leadNumber && documentNumber && <p className="shp-inv-lead">{documentNumber}</p>}
          {/* No rows at all means no list at all: an empty <dl> still carries
              the grid's own row gap, and that gap is white space on paper. */}
          {rows.length > 0 && (
            <dl className={`shp-inv-facts${stacked ? ' shp-inv-facts-stack' : ''}`}>
              {rows.map((row, i) => (
                <div className="shp-inv-fact" key={`${row.label}-${i}`}>
                  <dt>{row.label}</dt>
                  <dd>{row.value}</dd>
                </div>
              ))}
            </dl>
          )}
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
    titlePt: sizeField('Heading size (overrides the menu above)'),
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
    showCustomerReference: { type: 'select' as const, label: "The customer's own reference", options: yesNo },
    customerReferenceLabel: { type: 'text' as const, label: 'Their reference row label (blank uses the one in Shop settings)' },
    showDate: { type: 'select' as const, label: 'Date row', options: yesNo },
    dateLabel: { type: 'text' as const, label: '"Date" row label' },
    showDue: { type: 'select' as const, label: 'Due by row', options: yesNo },
    dueLabel: { type: 'text' as const, label: '"Due by" row label' },
    showTaxPoint: { type: 'select' as const, label: 'Tax point date as its own row', options: yesNo },
    taxPointLabel: { type: 'text' as const, label: 'Tax point row label' },
    numberPt: sizeField('Invoice number size'),
    factsPt: sizeField('Dates and numbers size'),
    introPt: sizeField('Opening line size'),
  },
  // No defaults for the sizes on purpose: blank is "leave it as it is", and a
  // default would set every document's sizes the moment the field shipped.
  defaultProps: {
    heading: '', fontFamily: '', titleSize: 'medium', sides: 'logo-left', rule: 'hairline',
    factsLayout: 'columns', numberStyle: 'row',
    invoiceLabel: 'Invoice', showOrderNumber: 'yes', orderLabel: 'Order',
    showCustomerReference: 'yes', customerReferenceLabel: '',
    showDate: 'yes', dateLabel: 'Date', showDue: 'yes', dueLabel: 'Due by',
    showTaxPoint: 'no', taxPointLabel: 'Tax point',
  },
  render: ShopInvoiceHeader,
}
export const shopInvoiceHeaderPuckRscComponent = { ...shopInvoiceHeaderPuckComponent, render: ShopInvoiceHeader }

// ---------------------------------------------------------------------------
// Parties: who it is from, who it is to, and where the goods went
// ---------------------------------------------------------------------------

type PartyLook = DocProps & {
  headingPt?: number | string; addressPt?: number | string; registrationPt?: number | string
}

type PartiesProps = PartyLook & {
  fromLabel?: string; toLabel?: string; deliverLabel?: string
  showFrom?: string; showDelivery?: string; showRegistration?: string
  order?: string; columns?: string; showEmail?: string; leadWith?: string
  showPhone?: string; showCustomerPhone?: string
}

export type AddressedTo = 'person' | 'organisation' | 'organisation-only'

/** What the layout's "Address it to" field means, with anything unrecognised -
 *  an older layout, a hand-edited page - reading as the original behaviour. */
function addressedTo(props: { leadWith?: string }): AddressedTo {
  return props.leadWith === 'organisation' || props.leadWith === 'organisation-only'
    ? props.leadWith
    : 'person'
}

/**
 * The address block for whoever the document is addressed to, with the
 * organisation lifted to the top line when the layout asks for it.
 *
 * A trade document is addressed to a business, not to whoever in that business
 * happened to fill the form in - the same reasoning `orderCustomerLabel` already
 * uses for the orders list. Left off by default all the same: an invoice already
 * in a customer's hands must keep the shape it was issued in, so only a layout
 * that sets the field moves anything (the proforma's starters do).
 *
 * The organisation is deduped rather than prepended blindly. It usually IS one of
 * the address lines already - `addressLines` puts `company` second - and the one
 * thing worse than the wrong first line is the right one printed twice.
 *
 * "organisation-only" goes one further and drops the individual entirely, for a
 * shop whose invoices are read by a finance department that has never heard of
 * whoever placed the order.
 */
export function addressedLines(
  lines: string[],
  company: string | undefined,
  leadWith: AddressedTo,
  personName?: string,
): string[] {
  const org = company?.trim()
  if (leadWith === 'person' || !org) return lines
  const body = lines.filter((line) => line.trim() !== org)
  if (leadWith === 'organisation') return [org, ...body]
  // Organisation only: the individual comes off the document altogether. Matched
  // by name rather than by position, and only on the first line, so an address
  // that never carried a name keeps its first line - printing "Acme Ltd" over a
  // missing street is a worse invoice than one with a name on it. Case-insensitive
  // because plenty of address books shout the name and the order does not.
  const person = personName?.trim().toLowerCase()
  return [org, ...body.filter((line, i) => !(i === 0 && person && line.trim().toLowerCase() === person))]
}

/** The size properties every party block sets, so the three of them cannot
 *  drift apart. */
function partySizes(props: PartyLook) {
  return sizeVars({
    '--shp-inv-h2-size': props.headingPt,
    '--shp-inv-party-size': props.addressPt,
    '--shp-inv-reg-size': props.registrationPt,
  })
}

/** The seller's own column: name, address, and the registration numbers a
 *  limited company has to print. Shared by the combined block and by the
 *  "Invoice: From" one, so the two can never disagree about what "From" means. */
function SellerParty({
  invoice, props, heading,
}: {
  invoice: InvoiceDocContext['invoice']
  props: PartiesProps
  heading: string
}) {
  const font = fontStyle(props)
  const seller = invoice.seller ?? ({} as typeof invoice.seller)
  return (
    <div className="shp-inv-party" key="from">
      <h2 className="shp-inv-h2" style={font}>{heading}</h2>
      <address>
        {seller.name && <span className="shp-inv-strong">{seller.name}</span>}
        {(seller.addressLines ?? []).map((line, i) => <span key={i}>{line}</span>)}
        {props.showEmail !== 'no' && seller.email && <span>{seller.email}</span>}
        {/* The shop's own telephone number. On by default because it always
            printed; a switch because plenty of trades would rather a customer
            emailed, and because a document going to an accountant does not need
            a number on it at all. */}
        {props.showPhone !== 'no' && seller.phone && <span>{seller.phone}</span>}
      </address>
      {props.showRegistration !== 'no' && (seller.vatNumber || seller.companyNumber) && (
        <div className="shp-inv-reg">
          {seller.vatNumber && <span>VAT registration {seller.vatNumber}</span>}
          {seller.companyNumber && <span>Company number {seller.companyNumber}</span>}
        </div>
      )}
    </div>
  )
}

/** Who the document is addressed to. */
function CustomerParty({
  invoice, props, heading,
}: {
  invoice: InvoiceDocContext['invoice']
  props: PartiesProps
  heading: string
}) {
  const font = fontStyle(props)
  const customer = invoice.customer ?? ({} as typeof invoice.customer)
  const billTo = addressedLines(customer.billingAddress ?? [], customer.company, addressedTo(props), customer.name)
  return (
    <div className="shp-inv-party" key="to">
      <h2 className="shp-inv-h2" style={font}>{heading}</h2>
      <address>
        {billTo.length > 0
          ? billTo.map((line, i) => <span key={i} className={i === 0 ? 'shp-inv-strong' : undefined}>{line}</span>)
          : <span className="shp-inv-strong">{customer.company?.trim() || customer.name}</span>}
        {props.showEmail !== 'no' && customer.email && <span>{customer.email}</span>}
        {/* Off unless asked for, because it never printed: a document already in
            somebody's hands must keep the shape it was issued in. */}
        {props.showCustomerPhone === 'yes' && customer.phone && <span>{customer.phone}</span>}
      </address>
    </div>
  )
}

/** Where the goods went, when that is somewhere else. Only worth a column when
 *  it differs - printing the same address twice under two headings helps
 *  nobody. */
function deliveryParty(
  invoice: InvoiceDocContext['invoice'],
  props: PartiesProps,
  heading: string,
): ReactElement | null {
  const font = fontStyle(props)
  const customer = invoice.customer ?? ({} as typeof invoice.customer)
  const billing = customer.billingAddress ?? []
  const shipping = customer.shippingAddress ?? []
  if (props.showDelivery === 'no' || shipping.length === 0 || shipping.join('|') === billing.join('|')) return null
  return (
    <div className="shp-inv-party" key="deliver">
      <h2 className="shp-inv-h2" style={font}>{heading}</h2>
      <address>
        {addressedLines(shipping, customer.company, addressedTo(props), customer.name)
          .map((line, i) => <span key={i} className={i === 0 ? 'shp-inv-strong' : undefined}>{line}</span>)}
      </address>
    </div>
  )
}

export function ShopInvoiceParties(props: PartiesProps) {
  const { invoice } = useCtx(props)
  const font = fontStyle(props)
  const from = props.showFrom !== 'no'
    ? <SellerParty invoice={invoice} props={props} heading={props.fromLabel?.trim() || 'From'} key="from" />
    : null
  const to = <CustomerParty invoice={invoice} props={props} heading={props.toLabel?.trim() || 'Invoice to'} key="to" />
  const deliver = deliveryParty(invoice, props, props.deliverLabel?.trim() || 'Delivered to')

  // Whose details come first. "From" first is the older order and stays the
  // default; plenty of printed invoices lead with the customer instead, because
  // the customer is who the document is addressed to.
  const columns = props.order === 'to-first' ? [to, from, deliver] : [from, to, deliver]
  const width = props.columns === '2' || props.columns === '3' ? ` shp-inv-cols-${props.columns}` : ''

  return (
    <>
      <Style />
      <FontLink family={props.fontFamily} />
      <section className={`shp-inv-parties${width}`} style={{ ...font, ...partySizes(props) }}>
        {columns.filter(Boolean)}
      </section>
    </>
  )
}

// The party fields that belong to one column, shared by all three blocks so a
// field added to one is a field added to all of them.
const PARTY_SIZE_FIELDS = {
  headingPt: sizeField('Heading size'),
  addressPt: sizeField('Address size'),
  registrationPt: sizeField('VAT and company number size'),
}

export const shopInvoicePartiesPuckComponent = {
  // Kept, and kept working, because it is on every invoice layout published
  // before the split - including ones a customer has already been sent. New
  // layouts get "Invoice: From" and "Invoice: To" instead, which is the same
  // two columns as two blocks an owner can move, size and space apart.
  label: 'Invoice: From and to (both columns)',
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
    showPhone: { type: 'select' as const, label: 'Your telephone number', options: yesNo },
    showCustomerPhone: { type: 'select' as const, label: 'Their telephone number', options: yesNo },
    leadWith: { type: 'select' as const, label: 'Address it to', options: [
      { value: 'person', label: 'The person, then their organisation' },
      { value: 'organisation', label: 'The organisation, on the top line' },
      { value: 'organisation-only', label: 'The organisation only, without a person' },
    ] },
    showRegistration: { type: 'select' as const, label: 'VAT and company numbers', options: yesNo },
    ...PARTY_SIZE_FIELDS,
  },
  defaultProps: {
    fontFamily: '', order: 'from-first', columns: 'auto',
    showFrom: 'yes', fromLabel: 'From', toLabel: 'Invoice to',
    showDelivery: 'yes', deliverLabel: 'Delivered to', showEmail: 'yes',
    showPhone: 'yes', showCustomerPhone: 'no',
    leadWith: 'person', showRegistration: 'yes',
  },
  render: ShopInvoiceParties,
}
export const shopInvoicePartiesPuckRscComponent = { ...shopInvoicePartiesPuckComponent, render: ShopInvoiceParties }

// ---------------------------------------------------------------------------
// From, and To, as blocks of their own
// ---------------------------------------------------------------------------
//
// The same two columns the block above draws together, drawn one at a time.
//
// One block that drew both was fine until an owner wanted them anywhere other
// than side by side and equal: the seller at the top under the letterhead and
// the customer down beside the dates, one of them in a two-column grid with the
// notice panel, different sizes on each. None of that is reachable through a
// block that owns both columns and lays them out itself.
//
// Separately they are ordinary blocks: drop them where you want them, put them
// in a Columns block if you want them beside each other, and they carry their
// own headings, sizes and switches. The combined block stays for every layout
// that already uses it.

type OnePartyProps = PartyLook & {
  heading?: string; showEmail?: string; showPhone?: string
  showRegistration?: string; align?: string
}

const PARTY_ALIGN: Record<string, string> = {
  left: '',
  centre: ' shp-inv-party-centre',
  right: ' shp-inv-party-right',
}

export function ShopInvoiceFrom(props: OnePartyProps) {
  const { invoice } = useCtx(props)
  const font = fontStyle(props)
  return (
    <>
      <Style />
      <FontLink family={props.fontFamily} />
      <section
        className={`shp-inv-parties shp-inv-party-one${PARTY_ALIGN[props.align ?? 'left'] ?? ''}`}
        style={{ ...font, ...partySizes(props) }}
      >
        <SellerParty invoice={invoice} props={props as PartiesProps} heading={props.heading?.trim() || 'From'} />
      </section>
    </>
  )
}

export const shopInvoiceFromPuckComponent = {
  label: 'Invoice: From',
  fields: {
    heading: { type: 'text' as const, label: 'Heading' },
    fontFamily: fontField,
    showEmail: { type: 'select' as const, label: 'Email address', options: yesNo },
    showPhone: { type: 'select' as const, label: 'Telephone number', options: yesNo },
    showRegistration: { type: 'select' as const, label: 'VAT and company numbers', options: yesNo },
    align: { type: 'select' as const, label: 'Sits', options: [
      { value: 'left', label: 'Left' },
      { value: 'centre', label: 'Centred' },
      { value: 'right', label: 'Right' },
    ] },
    ...PARTY_SIZE_FIELDS,
  },
  defaultProps: {
    heading: 'From', fontFamily: '', showEmail: 'yes', showPhone: 'yes', showRegistration: 'yes', align: 'left',
  },
  render: ShopInvoiceFrom,
}
export const shopInvoiceFromPuckRscComponent = { ...shopInvoiceFromPuckComponent, render: ShopInvoiceFrom }

type ToProps = PartyLook & {
  heading?: string; deliverLabel?: string
  showEmail?: string; showCustomerPhone?: string; showDelivery?: string
  leadWith?: string; align?: string
}

export function ShopInvoiceTo(props: ToProps) {
  const { invoice } = useCtx(props)
  const font = fontStyle(props)
  const deliver = deliveryParty(invoice, props as PartiesProps, props.deliverLabel?.trim() || 'Delivered to')
  return (
    <>
      <Style />
      <FontLink family={props.fontFamily} />
      <section
        className={`shp-inv-parties${deliver ? '' : ' shp-inv-party-one'}${PARTY_ALIGN[props.align ?? 'left'] ?? ''}`}
        style={{ ...font, ...partySizes(props) }}
      >
        <CustomerParty invoice={invoice} props={props as PartiesProps} heading={props.heading?.trim() || 'Invoice to'} />
        {deliver}
      </section>
    </>
  )
}

export const shopInvoiceToPuckComponent = {
  label: 'Invoice: To',
  fields: {
    heading: { type: 'text' as const, label: 'Heading' },
    fontFamily: fontField,
    showEmail: { type: 'select' as const, label: 'Email address', options: yesNo },
    showCustomerPhone: { type: 'select' as const, label: 'Telephone number', options: yesNo },
    leadWith: { type: 'select' as const, label: 'Address it to', options: [
      { value: 'person', label: 'The person, then their organisation' },
      { value: 'organisation', label: 'The organisation, on the top line' },
      { value: 'organisation-only', label: 'The organisation only, without a person' },
    ] },
    showDelivery: { type: 'select' as const, label: 'Delivery address, when it differs', options: yesNo },
    deliverLabel: { type: 'text' as const, label: '"Delivered to" heading' },
    align: { type: 'select' as const, label: 'Sits', options: [
      { value: 'left', label: 'Left' },
      { value: 'centre', label: 'Centred' },
      { value: 'right', label: 'Right' },
    ] },
    ...PARTY_SIZE_FIELDS,
  },
  defaultProps: {
    heading: 'Invoice to', fontFamily: '', showEmail: 'yes', showCustomerPhone: 'no',
    leadWith: 'person', showDelivery: 'yes', deliverLabel: 'Delivered to', align: 'left',
  },
  render: ShopInvoiceTo,
}
export const shopInvoiceToPuckRscComponent = { ...shopInvoiceToPuckComponent, render: ShopInvoiceTo }

// ---------------------------------------------------------------------------
// Lines: what was charged for
// ---------------------------------------------------------------------------

type LinesProps = DocProps & {
  showSku?: string; showDetail?: string; showTaxRate?: string
  itemLabel?: string; qtyLabel?: string; priceLabel?: string; rateLabel?: string; totalLabel?: string
  headStyle?: string; rowRules?: string; zebra?: string
  headPt?: number | string; rowPt?: number | string; skuPt?: number | string; detailPt?: number | string
  headRadius?: string; headRadiusEdges?: string; headPadX?: string; headPadY?: string
  rowPadY?: string; rowRadius?: string; descWidth?: string; headCase?: string
}

/** How much of the table the description column takes, leaving the money
 *  columns whatever is left. `auto` is the browser's own guess, which is what
 *  the table has always used and what a document with long descriptions wants. */
const DESC_WIDTHS: Record<string, string> = {
  auto: '',
  half: '50%',
  wide: '60%',
  widest: '70%',
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
    // Corners on the outer ends of the heading band only, or on every cell in
    // it. "Every cell" is the look a document with a filled head and gaps
    // between the columns wants; the outer ends is what a single banner wants.
    props.headRadiusEdges === 'every' ? 'shp-inv-thead-round-all' : '',
    props.headCase === 'plain' ? 'shp-inv-thead-plain' : '',
  ].filter(Boolean).join(' ')

  // The corner radius on the column headings, and the padding around them, as
  // properties rather than classes: an owner picking 6px means 6px, not
  // "slightly rounded". Blank leaves the document style block's own corner
  // setting standing, which is what every layout published before this had.
  const shape: Record<string, string> = {}
  const headRadius = cssLength(props.headRadius)
  if (headRadius) shape['--shp-inv-thead-radius'] = headRadius
  const rowRadius = cssLength(props.rowRadius)
  if (rowRadius) shape['--shp-inv-row-radius'] = rowRadius
  const headPadX = cssLength(props.headPadX)
  if (headPadX) shape['--shp-inv-thead-pad-x'] = headPadX
  const headPadY = cssLength(props.headPadY)
  if (headPadY) shape['--shp-inv-thead-pad-y'] = headPadY
  const rowPadY = cssLength(props.rowPadY)
  if (rowPadY) shape['--shp-inv-row-y'] = rowPadY
  const descWidth = DESC_WIDTHS[props.descWidth ?? 'auto'] ?? ''

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
          ...shape,
        }}
      >
        <thead>
          <tr>
            <th style={descWidth ? { width: descWidth } : undefined}>{props.itemLabel?.trim() || 'Description'}</th>
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
    headRadius: radiusField('Column heading corners (needs a filled band)'),
    headRadiusEdges: { type: 'select' as const, label: 'Those corners go on', options: [
      { value: 'outer', label: 'The outer ends of the band' },
      { value: 'every', label: 'Every heading cell' },
    ] },
    headPadX: spaceField('Space either side of a column heading'),
    headPadY: spaceField('Space above and below a column heading'),
    headCase: { type: 'select' as const, label: 'Column headings read', options: [
      { value: 'caps', label: 'IN SMALL CAPITALS' },
      { value: 'plain', label: 'As you typed them' },
    ] },
    rowPadY: spaceField('Space above and below an item row'),
    rowRadius: radiusField('Shaded row corners'),
    descWidth: { type: 'select' as const, label: 'Description column takes', options: [
      { value: 'auto', label: 'As much as it needs' },
      { value: 'half', label: 'Half the table' },
      { value: 'wide', label: 'Three fifths' },
      { value: 'widest', label: 'Seven tenths' },
    ] },
    showSku: { type: 'select' as const, label: 'Product codes', options: yesNo },
    showDetail: { type: 'select' as const, label: 'Options and personalisation', options: yesNo },
    showTaxRate: { type: 'select' as const, label: 'Tax rate column', options: yesNo },
    itemLabel: { type: 'text' as const, label: 'Description column' },
    qtyLabel: { type: 'text' as const, label: 'Quantity column' },
    priceLabel: { type: 'text' as const, label: 'Unit price column' },
    rateLabel: { type: 'text' as const, label: 'Rate column' },
    totalLabel: { type: 'text' as const, label: 'Amount column' },
    headPt: sizeField('Column heading size'),
    rowPt: sizeField('Item row size'),
    skuPt: sizeField('Product code size'),
    detailPt: sizeField('Options and personalisation size'),
  },
  defaultProps: {
    fontFamily: '', headStyle: 'rule', rowRules: 'every', zebra: 'no',
    headRadius: '', headRadiusEdges: 'outer', headPadX: '', headPadY: '',
    headCase: 'caps', rowPadY: '', rowRadius: '', descWidth: 'auto',
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
  align?: string
  rowPt?: number | string; totalPt?: number | string; paidPt?: number | string
}

const TOTALS_WIDTHS: Record<string, string> = { narrow: '18rem', normal: '22rem', wide: '28rem' }

export function ShopInvoiceTotals(props: TotalsProps) {
  const { invoice, credit, proforma } = useCtx(props)
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
  // Named charges a cart-line resolver broke out of the line prices - a delivery
  // service priced per item rather than per order. The money is already inside
  // the lines, so these come OUT of the subtotal instead of being added to it,
  // and the column still sums to the same total to the penny.
  const chargeRows = invoiceChargeRows(invoice.lines)
  const chargeTotal = chargeRows.reduce((sum, row) => sum + row.amount, 0)
  const goodsSubtotal = Math.round((Number(invoice.subtotal) - chargeTotal + Number.EPSILON) * 100) / 100
  // A delivery row printed even at zero, so a customer can see that delivery was
  // free rather than wondering whether it is still to come.
  //
  // Except where the lines carried delivery charges of their own. `shipping` is
  // the ORDER's carriage rate, and on a shop that prices delivery per item that
  // figure is nought while the customer is being charged plenty - so the
  // reassuring "Free" was flatly untrue on every one of those documents. The
  // charge rows above say what was actually charged; this row only speaks when
  // there is carriage to speak about.
  const showDelivery = shipping > 0 || (props.showDeliveryRow === 'always' && chargeTotal === 0)
  const deliveryValue = shipping > 0
    ? formatMoney(shipping, symbol)
    : props.zeroDelivery?.trim() || formatMoney(0, symbol)

  const listClass = [
    'shp-inv-totals',
    props.emphasis === 'accent' ? 'shp-inv-total-accent' : '',
    // Where the column of figures sits. It has always been pushed to the right,
    // which is where a total belongs on a printed invoice - but a document set
    // left, with the totals under the item table's first column, is a look
    // plenty of trades use and there was no way to ask for it.
    props.align === 'left' ? 'shp-inv-totals-left' : '',
  ].filter(Boolean).join(' ')
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
        <dd>{formatMoney(goodsSubtotal, symbol)}</dd>
        {/* Printed with the label the module that charged it gave, which is the
            only name anybody has for it - the delivery row's own label belongs
            to the order's carriage rate and would be a guess here. */}
        {chargeRows.map((charge) => (
          <div className="shp-inv-row" key={charge.label}>
            <dt>{charge.label}</dt>
            <dd>{formatMoney(charge.amount, symbol)}</dd>
          </div>
        ))}
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
          {/* "Paid in full - thank you" on a refund would be quite the insult,
              and on a proforma for money nobody has sent yet it would be a lie
              the customer could act on. Both documents bring their own wording
              rather than using the block's override, because that override was
              written for the invoice; the credit note's was snapshotted onto it
              when it was raised, and the proforma's is picked at render time
              from whether the money has actually arrived. */}
          {credit
            ? invoice.wording?.creditWording?.trim() || 'This amount has been refunded to your original payment method.'
            : proforma
              ? invoice.wording?.proformaWording?.trim()
                || (proforma.paid ? 'Payment received - thank you.' : 'Not yet paid.')
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
    align: { type: 'select' as const, label: 'Sits', options: [
      { value: 'right', label: 'At the right' },
      { value: 'left', label: 'At the left' },
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
    rowPt: sizeField('Row size'),
    totalPt: sizeField('Total size'),
    paidPt: sizeField('Size of the line under the total'),
  },
  defaultProps: {
    fontFamily: '', emphasis: 'rule', width: 'normal', align: 'right',
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
  headRadius?: string
  headingPt?: number | string; headPt?: number | string; rowPt?: number | string
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
          ...(cssLength(props.headRadius) ? { '--shp-inv-thead-radius': cssLength(props.headRadius)! } : {}),
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
    headRadius: radiusField('Column heading corners (needs a filled band)'),
    rateLabel: { type: 'text' as const, label: 'Rate column' },
    netLabel: { type: 'text' as const, label: 'Net column' },
    taxLabel: { type: 'text' as const, label: 'Tax column' },
    grossLabel: { type: 'text' as const, label: 'Gross column' },
    hideWhenSingleZero: { type: 'select' as const, label: 'When to print it', options: [
      { value: 'no', label: 'Always' },
      { value: 'yes', label: 'Unless no tax was charged' },
      { value: 'single', label: 'Only when there is more than one rate' },
    ] },
    headingPt: sizeField('Heading size'),
    headPt: sizeField('Column heading size'),
    rowPt: sizeField('Row size'),
  },
  defaultProps: {
    fontFamily: '', heading: '', headStyle: 'rule', align: 'right', headRadius: '',
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
  whenPaid?: string
  headingPt?: number | string; bodyPt?: number | string; footerPt?: number | string
}

export function ShopInvoicePayment(props: PaymentProps) {
  const ctx = useCtx(props)
  const { invoice } = ctx
  const font = fontStyle(props)
  const wording = invoice.wording ?? ({} as typeof invoice.wording)
  // The extra paragraph is the block's own, not the shop's - somewhere to put a
  // sentence that belongs to this document's design rather than to every
  // invoice ever issued. It counts towards the block having something to say.
  const paymentExtra = props.paymentExtra?.trim() ?? ''
  const termsExtra = props.termsExtra?.trim() ?? ''
  // Money already in the bank needs no bank details. An invoice raised on
  // despatch and paid a fortnight later still carries the "how to pay" wording
  // it was issued with, because that wording is a snapshot - so the block asks
  // the document whether the money arrived and leaves the panel off when it did.
  // Three settings rather than a switch: the terms are usually still worth
  // printing on a paid invoice (retention of title, returns), and the bank
  // details never are.
  const paid = ctx.paid === true
  const hidePaymentWhenPaid = paid && (props.whenPaid === 'payment' || props.whenPaid === 'both')
  const hideTermsWhenPaid = paid && props.whenPaid === 'both'
  const showPayment = props.showPaymentDetails !== 'no' && !hidePaymentWhenPaid && Boolean(wording.paymentDetails || paymentExtra)
  const showTerms = props.showTerms !== 'no' && !hideTermsWhenPaid && Boolean(wording.terms || termsExtra)
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
    whenPaid: { type: 'select' as const, label: 'Once it has been paid', options: [
      { value: 'both', label: 'Leave off how to pay, and the terms' },
      { value: 'payment', label: 'Leave off how to pay' },
      { value: 'show', label: 'Print both anyway' },
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
    headingPt: sizeField('Heading size'),
    bodyPt: sizeField('Body size'),
    footerPt: sizeField('Footer line size'),
  },
  defaultProps: {
    fontFamily: '', columns: '1', whenPaid: 'both',
    showPaymentDetails: 'yes', paymentHeading: 'Payment', paymentExtra: '',
    showTerms: 'yes', termsHeading: 'Terms', termsExtra: '', showFooter: 'yes', footerAlign: 'center',
  },
  render: ShopInvoicePayment,
}
export const shopInvoicePaymentPuckRscComponent = { ...shopInvoicePaymentPuckComponent, render: ShopInvoicePayment }
