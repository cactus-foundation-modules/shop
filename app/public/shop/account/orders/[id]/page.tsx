import { getSiteTimezone } from '@/lib/config/timezone.server'
import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { getMemberFromCookie } from '@/lib/members/session'
import { getMembersConfig } from '@/lib/members/config'
import { getMemberAreaPath } from '@/lib/members/paths'
import { moduleAccountSectionAnchor } from '@/lib/members/account-layout'
import MemberAccountShell from '@/components/members/account/MemberAccountShell'
import { loadOrderDetail } from '@/modules/shop/lib/member-orders'
import { getOrderById } from '@/modules/shop/lib/db/orders'
import { guestOrderAccessIds } from '@/modules/shop/lib/guest-order-access'
import { orderViewerFor } from '@/modules/shop/lib/order-viewer'
import { orderTrackingBasePath } from '@/modules/shop/lib/order-tracking'
import OrderAccessGate from '@/modules/shop/components/public/OrderAccessGate'
import GuestOrderAccountOffer from '@/modules/shop/components/public/GuestOrderAccountOffer'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import { getShopGate } from '@/modules/shop/lib/access'
import { ShopClosedNotice, ShopStaffPreviewBanner } from '@/modules/shop/components/public/ShopClosedNotice'
import { formatMoney } from '@/modules/shop/lib/money'
import { SHP_CANCEL_REASONS, SHP_RETURN_REASONS, reasonLabel } from '@/modules/shop/lib/order-requests'
import {
  ORDER_STATUS_DISPLAY,
  REQUEST_STATUS_DISPLAY,
  REQUEST_TYPE_LABEL,
  addressLines,
  badgeClass,
  formatOrderDate,
  orderCompanyName,
} from '@/modules/shop/lib/order-display'
import { orderProgressSteps, orderStopped } from '@/modules/shop/lib/order-progress'
import { listInvoicesForOrder } from '@/modules/shop/lib/db/invoices'
import { listCreditNotesForOrder } from '@/modules/shop/lib/db/credit-notes'
import {
  creditNotePath, creditNotePdfPath, invoicePath, invoicePdfPath, proformaPath, proformaPdfPath,
} from '@/modules/shop/lib/invoice-token'
import { customerBillingEditOffered, customerCanEditBilling } from '@/modules/shop/lib/customer-billing'
import OrderBillingPanel from '@/modules/shop/components/public/OrderBillingPanel'
import { manualPaymentInstructions, paymentOutstanding } from '@/modules/shop/lib/payment-instructions'
import { payOnlineMethodsForOrder, settlementMethod } from '@/modules/shop/lib/order-pay-online'
import { getPaymentMethodLabels, getPaymentMethodClientFields } from '@/modules/shop/lib/payments/registry'
import { resolveCheckoutPaymentFields } from '@/modules/shop/lib/checkout-payment-fields'
import { OrderPayOnlinePanel } from '@/modules/shop/components/public/OrderPayOnlinePanel'
import { proformaAvailable } from '@/modules/shop/lib/proforma'
import OrderRequestPanel from '@/modules/shop/components/public/OrderRequestPanel'
import OrderReferencePanel from '@/modules/shop/components/public/OrderReferencePanel'
import {
  customerCanSetReference,
  customerReferenceLabel,
  customerReferenceOfferedAfterOrder,
} from '@/modules/shop/lib/customer-reference'
import WithdrawRequestButton from '@/modules/shop/components/public/WithdrawRequestButton'
import { safeTrackingUrl } from '@/modules/shop/lib/tracking-url'
import { ORDER_DETAIL_CSS } from '@/modules/shop/components/public/order-detail-css'
import { Icon, ICON_DOWNLOAD, OrderCard, OrderNote } from '@/modules/shop/components/public/OrderDetailChrome'
import { OrderProgressRail } from '@/modules/shop/components/public/OrderProgressRail'
import { OrderItemList } from '@/modules/shop/components/public/OrderItemList'
import { OrderDocuments, type OrderDocument } from '@/modules/shop/components/public/OrderDocuments'

export const metadata = { title: 'Order detail' }
export const dynamic = 'force-dynamic'

// A member's own order, a week after they placed it.
//
// The page had grown a section at a time until it was eleven identical grey
// cards in one column - pay online, proforma, invoice address, purchase order
// number, items, parcels, downloads, totals, refunds, addresses, requests - all
// at the same volume, with the paperwork strung off the date line as middot
// separated links. Everything on it was needed; none of it was ranked.
//
// It now reads in the order somebody actually wants it:
//
//   1. Which order is this          - number, state, date, size, money
//   2. Where has it got to          - the progress rail
//   3. Anything still to do         - money owed, a request in flight
//   4. What was bought and paid     - the receipt, items and totals in one card
//   5. Everything else              - paired cards, two up on a desktop
//
// Layout classes come from order-detail-css.ts, injected once here. Nothing on
// this page carries a hardcoded colour.

// When an invoice turns up, in the buyer's words rather than the setting's.
// MANUAL promises no moment because the shop has not committed to one.
const INVOICE_WHEN: Record<string, string> = {
  COMPLETED: 'will be available on completion of your order',
  PAID: 'will be available once your payment has cleared',
  DISPATCHED: 'will be available once your order has been despatched',
  MANUAL: 'will appear here once it has been raised',
}

// Preferred wording for the four shop ships with. Anything else - a method a
// module contributed - is named by the registry, so a paid order never reads
// "GOCARDLESS_IBP" at its customer.
const PAYMENT_METHOD_LABELS: Record<string, string> = {
  STRIPE: 'Card',
  PAYPAL: 'PayPal',
  BANK_TRANSFER: 'Bank transfer',
  CASH: 'Cash',
}

// What a stopped order says instead of a progress rail. There is no next step
// to point at, and four greyed-out circles under "Cancelled" reads as a page
// that has not noticed.
const STOPPED_MESSAGE: Record<string, string> = {
  CANCELLED: 'This order was cancelled, so nothing further will be sent.',
  REFUNDED: 'This order was refunded in full.',
}

function TotalRow({ label, value, variant }: { label: React.ReactNode; value: string; variant?: string }) {
  return (
    <div className={variant ? `sod-row ${variant}` : 'sod-row'}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}

export default async function ShopAccountOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const gate = await getShopGate()
  if (gate.blocked) return <ShopClosedNotice message={gate.message} />

  const { id } = await params
  // The order alone first, and only then everything hanging off it. Who may
  // look at this is decided from the order's own memberId and a cookie, and a
  // page that fetched the parcels, the refunds and the paperwork before asking
  // that question would do a dozen queries for a stranger. The row is read
  // twice on the way through - once here, once inside loadOrderDetail - and one
  // extra lookup by primary key is a fair price for not loading a stranger's
  // order history to find out they are a stranger.
  const [order, config, membersConfig] = await Promise.all([
    getOrderById(id),
    getShopConfigCached(),
    getMembersConfig(),
  ])
  if (!order) notFound()

  // Two ways to be allowed in: signed in and it is yours, or you have already
  // proved the delivery postcode. See lib/order-viewer.ts - the same rule the
  // routes behind every button on this page ask.
  const [signedInMember, guestOrderIds] = await Promise.all([getMemberFromCookie(), guestOrderAccessIds()])
  const viewer = orderViewerFor(order, signedInMember, guestOrderIds)

  if (!viewer) {
    // Neither. A shop that offers guest tracking asks them to prove it, right
    // here, because they arrived from a link that already said which order this
    // is and sending them off to type the number back would be absurd.
    if (config.guestOrderTrackingEnabled) {
      return (
        <OrderAccessGate
          orderId={order.id}
          orderNumber={order.orderNumber}
          trackerPath={orderTrackingBasePath(config)}
        />
      )
    }
    // A shop that does not: exactly what it always did. Somebody else's order is
    // a 404 rather than a 403, since "not yours" would confirm the id exists.
    if (signedInMember) notFound()
    redirect(`/${getMemberAreaPath()}/login?redirect=/shop/account/orders`)
  }

  const member = viewer.member
  // A member page needs the member area switched on; a guest's own order does
  // not, and never did - it is their receipt, not part of anybody's account.
  if (member && !membersConfig.enabled) notFound()

  const [detail, timezone] = await Promise.all([loadOrderDetail(id), getSiteTimezone()])
  if (!detail) notFound()

  // `order` is already in hand from the access check above, so it is not taken
  // from the detail a second time.
  const { lines, shipments, refunds, refundItems, downloads, requests, openRequest } = detail
  const symbol = config.currencySymbol
  // Only looked up on a shop that invoices AND is willing to show it, so an
  // ordinary shop's order page costs exactly what it always did.
  const showPaperwork = config.invoicesEnabled && config.invoiceShowToCustomer
  // Whether this shop lets the customer put their own reference on afterwards.
  // Read first because it is the other reason the invoice is worth looking up:
  // an invoice already sent with a number on it is what closes the box (see
  // lib/customer-reference.ts), and that is true whether or not the shop shows
  // the invoice to the customer at all.
  const referenceOffered = customerReferenceOfferedAfterOrder(config)
  // Whether this shop lets the customer correct who the invoice is made out to.
  // The third reason to look the invoice up: what a change costs depends on
  // whether one has gone out (see lib/customer-billing.ts).
  const billingOffered = customerBillingEditOffered(config)
  // Every invoice this order has ever had, not just the live one. An order
  // whose company was corrected after invoicing has two - the one that was
  // credited and the one that replaced it - and the customer's own accountant
  // needs both, which is the whole reason the first was superseded rather than
  // voided.
  const invoiceRecords = showPaperwork || ((referenceOffered || billingOffered) && config.invoicesEnabled)
    ? await listInvoicesForOrder(order.id)
    : []
  // The live one: issued, and not since replaced. What "the invoice" means to
  // the reference rules, to the proforma and to the billing panel.
  const invoiceRecord = invoiceRecords.find((record) => record.status === 'ISSUED' && !record.supersededAt) ?? null
  // The one the paperwork links read. A shop that raises invoices and keeps them
  // to itself still has none to offer here, exactly as before.
  const invoice = showPaperwork ? invoiceRecord : null
  // Everything downloadable, oldest first so the story reads in order: the
  // invoice that went out, then the one that replaced it. Voided ones stay off
  // - a withdrawn document is the one thing a customer must not be handed a
  // fresh copy of.
  const issuedInvoices = showPaperwork
    ? invoiceRecords.filter((record) => record.status === 'ISSUED').slice().reverse()
    : []
  // Money that went back is paperwork the buyer is owed just as much as the
  // invoice - more so for a business buyer, whose own accountant needs the
  // document rather than a line on a card statement. Only read where there is
  // an invoice to credit, so an ordinary shop's order page costs what it did.
  const creditNotes = issuedInvoices.length > 0 ? await listCreditNotesForOrder(order.id) : []
  // Where "back" goes, which depends on where they came from. A member goes to
  // their order history - and on a one-page account that history is a stretch of
  // the account itself rather than a page of its own. A guest has no history to
  // go back to, so back means the place they look orders up.
  const backHref = member
    ? (membersConfig.accountSinglePage
        ? `/${getMemberAreaPath()}#${moduleAccountSectionAnchor('orders')}`
        : '/shop/account/orders')
    : orderTrackingBasePath(config)
  const backLabel = member ? 'All orders' : 'Track another order'
  // Whether the paperwork links hand over a file or open the document.
  const pdfDownloads = config.invoicePdfEnabled
  // Before one has been raised, say so rather than leaving a gap where the link
  // will be - "where is my invoice?" is the email this line exists to prevent.
  // The moment named is the one the shop actually issues on, and the tax label
  // is the shop's own, so a shop outside the UK is not made to say VAT.
  const invoicePromise = showPaperwork && !invoice ? INVOICE_WHEN[config.invoiceIssueOn] : null
  const status = ORDER_STATUS_DISPLAY[order.status]
  const completedRefunds = refunds.filter((refund) => refund.status === 'COMPLETED')
  const refundedTotal = completedRefunds.reduce((sum, refund) => sum + Number(refund.amount), 0)
  const itemsById = new Map(lines.map((line) => [line.item.id, line.item]))
  const decided = requests.filter((request) => request.status !== 'PENDING')
  const itemCount = lines.reduce((sum, line) => sum + line.item.quantity, 0)

  // The method to SPEAK about, which on an unpaid order is the one it was placed
  // with. A customer who started a card payment here and thought better of it
  // still wants the bank details on the page. See lib/order-pay-online.ts.
  const shownMethod = settlementMethod(order)
  const paymentInstructions = manualPaymentInstructions(shownMethod, config)
  const outstanding = paymentOutstanding(order)
  // The ways this order could be settled here and now, and the two things a
  // method's own on-page fields need to draw. Only looked up while money is
  // actually owed, so a settled order's page costs exactly what it always did.
  const payOnline = outstanding ? await payOnlineMethodsForOrder(order, config) : []
  const payOnlineFields = payOnline.length > 0 ? await getPaymentMethodClientFields() : {}
  // Every registered method's name, so a method a module contributed is named
  // rather than shouted in upper case.
  const methodLabels = await getPaymentMethodLabels()
  // The proforma, on a pay-later order, until the real invoice exists.
  //
  // A proforma is a request for money; a VAT invoice is the record of the sale,
  // and it is the one an accountant files and reclaims against. Offering both
  // side by side invites somebody to hand their bookkeeper the wrong one - and
  // the proforma says in as many words that it is not a VAT invoice, which is
  // not a document anybody needs once there is a VAT invoice sitting beside it.
  //
  // It is kept while the money is still owed, paid or not: a buyer who paid by
  // transfer but is waiting on despatch still needs the paperwork they paid
  // against. It goes when the invoice arrives, not when the money does.
  //
  // `invoice` is null on a shop that raises invoices but keeps them to itself,
  // and the proforma rightly stays there - it is then the only paperwork the
  // customer has, and taking it away would leave them with nothing.
  const proforma = config.proformaShowToCustomer && proformaAvailable(config, order) && !invoice

  // Their own reference for the order, and whether they may still move it.
  // Shown read-only on a shop that asks for one at checkout but does not take
  // changes afterwards: somebody who typed a purchase order number in on the day
  // should still be able to see it on their own order.
  const referenceLabel = customerReferenceLabel(config)
  const referenceEditable: { allowed: boolean; reason?: string } = referenceOffered
    ? customerCanSetReference({ config, order, invoiceReference: invoiceRecord?.customer?.reference ?? null })
    : { allowed: false }
  const showReference = config.customerReferenceFieldEnabled
    && (referenceOffered || Boolean(order.customerReference?.trim()))

  // The latest parcel out, which is what the rail dates its dispatch step from.
  const lastShippedAt = shipments.reduce<Date | null>(
    (latest, shipment) => (!latest || shipment.shippedAt > latest ? shipment.shippedAt : latest),
    null,
  )
  const stopped = orderStopped(order.status)
  const steps = orderProgressSteps({ order, lines, lastShippedAt })

  // How this order was settled, in a sentence rather than a status code.
  const methodName = PAYMENT_METHOD_LABELS[shownMethod] ?? methodLabels[shownMethod] ?? shownMethod
  const paymentWhen = order.paidAt
    ? `Paid on ${formatOrderDate(order.paidAt, timezone)}`
    : order.paymentStatus === 'PENDING'
      ? 'Not received yet'
      : order.paymentStatus === 'AWAITING_CONFIRMATION'
        ? 'Waiting to clear'
        : order.paymentStatus === 'FAILED'
          ? 'That payment did not go through'
          : null

  // Every piece of paper this order has, in the order it came into existence.
  // The receipt is always first because it is the only one every shop has.
  const documents: OrderDocument[] = [{
    key: 'receipt',
    name: 'Printable receipt',
    href: `/shop/account/orders/${order.id}/receipt`,
    action: 'Print',
    newTab: true,
    icon: 'print',
    internal: true,
  }]
  for (const record of issuedInvoices) {
    documents.push({
      key: record.id,
      name: `Invoice ${record.invoiceNumber}`,
      // Said plainly rather than left for somebody to work out from two invoice
      // numbers on one order.
      note: record.supersededAt ? 'Cancelled and replaced' : null,
      href: pdfDownloads ? invoicePdfPath(record.invoiceNumber) : invoicePath(record.invoiceNumber),
      action: pdfDownloads ? 'Download' : 'Open',
      icon: 'doc',
    })
  }
  if (proforma) {
    documents.push({
      key: 'proforma',
      name: 'Proforma invoice',
      href: pdfDownloads ? proformaPdfPath(order.orderNumber) : proformaPath(order.orderNumber),
      action: pdfDownloads ? 'Download' : 'Open',
      icon: 'doc',
    })
  }
  for (const note of creditNotes) {
    documents.push({
      key: note.id,
      name: `Credit note ${note.creditNoteNumber}`,
      href: pdfDownloads ? creditNotePdfPath(note.creditNoteNumber) : creditNotePath(note.creditNoteNumber),
      action: pdfDownloads ? 'Download' : 'Open',
      icon: 'doc',
    })
  }
  if (invoicePromise) {
    documents.push({
      key: 'invoice-promise',
      name: `Your ${config.invoiceTaxLabel || 'VAT'} invoice ${invoicePromise}`,
      icon: 'doc',
    })
  }

  const body = (
    <>
      <style dangerouslySetInnerHTML={{ __html: ORDER_DETAIL_CSS }} />
      {gate.staffPreview && <ShopStaffPreviewBanner />}

      <div className="sod">
        <Link href={backHref} prefetch={false} className="sod-back">
          <span aria-hidden="true">←</span> {backLabel}
        </Link>

        <header className="sod-head">
          <div className="sod-head-top">
            <h1 className="sod-title">Order {order.orderNumber}</h1>
            <span className={badgeClass(status.tone)}>{status.label}</span>
          </div>
          {/* The three facts that identify an order, and nothing to click. The
              links that used to live on this line have a card of their own. */}
          <p className="sod-facts">
            <span>Placed <strong>{formatOrderDate(order.createdAt, timezone)}</strong></span>
            <span><strong>{itemCount}</strong> {itemCount === 1 ? 'item' : 'items'}</span>
            <span>Total <strong>{formatMoney(order.total, symbol)}</strong></span>
            {showReference && order.customerReference?.trim() && (
              <span>{referenceLabel} <strong>{order.customerReference.trim()}</strong></span>
            )}
          </p>
        </header>

        {stopped ? (
          <OrderNote tone="warn">
            <p>{STOPPED_MESSAGE[order.status] ?? status.label}</p>
          </OrderNote>
        ) : (
          <OrderProgressRail steps={steps} timezone={timezone} />
        )}

        {order.status === 'ON_HOLD' && (
          <OrderNote tone="warn">
            <p>
              <strong>This order is on hold.</strong> We have paused it while something is sorted
              out, and we will be in touch as soon as it is moving again.
            </p>
          </OrderNote>
        )}

        {/* How to pay, for the methods where paying is still a job the shopper
            has to go and do. The thank-you page says this once, at a moment
            nobody is reading carefully; this is where they come back to it a
            week later with their banking app open, so it sits above everything
            else the page has to say.

            It is an outstanding task or it is nothing. Once the money has been
            marked as arrived there is no job left, and a panel of bank details
            on a settled order reads as a second demand for a bill already paid. */}
        {outstanding && (paymentInstructions || payOnline.length > 0) && (
          <OrderNote tone="warn">
            <p>
              <strong>How to pay - {formatMoney(order.total, symbol)} still to reach us</strong>
            </p>
            <p>Your order is awaiting payment confirmation. We will be in touch once it clears.</p>
            {paymentInstructions && <p className="sod-instructions">{paymentInstructions}</p>}
            {payOnline.length > 0 && (
              <>
                {/* Inside this callout rather than beside it: it is the same
                    question - how does this get paid - and two boxes asking it
                    would read as two different bills. */}
                <div className="sod-note-sep" />
                <OrderPayOnlinePanel
                  orderId={order.id}
                  amount={formatMoney(order.total, symbol)}
                  methods={payOnline}
                  // Who is paying, for a card SDK that has to send a name and an
                  // address with its 3D Secure request. The billing address where
                  // the order carries one, since that is the one the bank checks.
                  payer={{
                    email: order.customerEmail,
                    name: order.customerName,
                    address: order.billingAddress ?? order.shippingAddress,
                  }}
                  methodClientFields={payOnlineFields}
                  paymentFields={resolveCheckoutPaymentFields()}
                />
              </>
            )}
          </OrderNote>
        )}

        {openRequest && (
          <OrderNote tone="info">
            <p>
              <strong>{REQUEST_TYPE_LABEL[openRequest.type]} request sent.</strong>{' '}
              You asked on {formatOrderDate(openRequest.createdAt, timezone)} - reason given:{' '}
              {reasonLabel(openRequest.type, openRequest.reason)}. We will email you as soon as
              somebody has looked at it.
            </p>
            <div><WithdrawRequestButton requestId={openRequest.id} /></div>
          </OrderNote>
        )}

        {/* The receipt: what was bought and what it came to, in one card rather
            than two sections half a screen apart. */}
        <OrderCard
          title="What you ordered"
          flush
          foot={(
            <dl className="sod-totals">
              <TotalRow label="Items" value={formatMoney(order.subtotal, symbol)} />
              {Number(order.discountAmount) > 0 && (
                <TotalRow
                  variant="sod-discount"
                  label={
                    order.couponCode
                      ? <>Discount <span className="sod-code">({order.couponCode})</span></>
                      : 'Discount'
                  }
                  value={`-${formatMoney(order.discountAmount, symbol)}`}
                />
              )}
              <TotalRow
                label={order.shippingRateName || 'Delivery'}
                value={formatMoney(order.shippingAmount, symbol)}
              />
              {Number(order.taxAmount) > 0 && (
                <TotalRow
                  label={order.taxMode === 'INCLUSIVE' ? 'VAT (included)' : 'VAT'}
                  value={formatMoney(order.taxAmount, symbol)}
                />
              )}
              <TotalRow variant="sod-grand" label="Total" value={formatMoney(order.total, symbol)} />
              {refundedTotal > 0 && (
                <>
                  <TotalRow label="Refunded" value={`-${formatMoney(refundedTotal, symbol)}`} />
                  <TotalRow
                    variant="sod-after"
                    label="Left after refunds"
                    value={formatMoney(Number(order.total) - refundedTotal, symbol)}
                  />
                </>
              )}
            </dl>
          )}
        >
          <OrderItemList
            lines={lines}
            currencySymbol={symbol}
            productUrlStyle={config.productUrlStyle}
            buyAgainEnabled={config.buyAgainEnabled}
            timezone={timezone}
          />
        </OrderCard>

        {/* Everything that is reference rather than headline. Two columns on a
            desktop, one on a phone - see .sod-grid. */}
        <div className="sod-grid">
          {shipments.length > 0 && (
            <OrderCard
              title={shipments.length === 1 ? 'Your parcel' : 'Your parcels'}
              note={shipments.length > 1 ? 'Parcels sent separately can arrive a day or two apart.' : undefined}
              flush
            >
              <div>
                {shipments.map((shipment, index) => (
                  <div key={shipment.id} className="sod-parcel">
                    <span className="sod-parcel-when">
                      {shipments.length === 1 ? 'Sent' : `Parcel ${index + 1}, sent`}{' '}
                      {formatOrderDate(shipment.shippedAt, timezone)}
                      {shipment.carrier ? ` with ${shipment.carrier}` : ''}
                    </span>
                    {shipment.trackingNumber && (
                      <span className="sod-dim">Tracking number: {shipment.trackingNumber}</span>
                    )}
                    <ul className="sod-parcel-items">
                      {shipment.items.map((item) => (
                        <li key={item.id}>
                          {itemsById.get(item.orderItemId)?.productName ?? 'Item'} × {item.quantity}
                        </li>
                      ))}
                    </ul>
                    {/* The carrier's own page for this parcel. Re-checked here
                        rather than trusted: the dispatch route refuses anything
                        that is not http(s), but a row written before that check
                        existed has never been past it, and this is an href in
                        front of somebody who trusts the shop. */}
                    {safeTrackingUrl(shipment.trackingUrl) && (
                      <a
                        className="sod-btn sod-btn-ghost sod-track"
                        href={safeTrackingUrl(shipment.trackingUrl)}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Track {shipments.length === 1 ? 'your parcel' : `parcel ${index + 1}`}
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </OrderCard>
          )}

          {downloads.length > 0 && (
            <OrderCard title="Your downloads" flush>
              <ul className="sod-docs">
                {downloads.map((download, index) => (
                  <li key={download.id} className="sod-doc">
                    <Icon>{ICON_DOWNLOAD}</Icon>
                    <span className="sod-doc-name">
                      <a href={`/shop/downloads/${download.token}`}>
                        {downloads.length === 1 ? 'Your download' : `Download ${index + 1}`}
                      </a>
                    </span>
                    <span className="sod-doc-get" aria-hidden="true">Get it</span>
                  </li>
                ))}
              </ul>
            </OrderCard>
          )}

          <OrderCard title="Paperwork" flush>
            <OrderDocuments documents={documents} />
          </OrderCard>

          <OrderCard title="Payment">
            <p><strong>{methodName}</strong></p>
            {paymentWhen && <p className="sod-dim">{paymentWhen}</p>}
            {/* Their own reference for the order, under the money rather than in
                a card of its own. It exists so an accounts department can match
                this order to the payment it made for it, which is the same
                subject as everything above it - and a whole card holding one
                short line was the thinnest thing on the page. The rule and the
                small heading keep it from reading as another line about the
                payment method. */}
            {showReference && (
              <div className="sod-card-part">
                <p className="sod-sub">{referenceLabel}</p>
                <OrderReferencePanel
                  orderId={order.id}
                  label={referenceLabel}
                  reference={order.customerReference ?? ''}
                  editable={referenceEditable}
                />
              </div>
            )}
          </OrderCard>

          <OrderCard title="Delivery address">
            <address className="sod-lines">
              {addressLines(order.shippingAddress).map((line, i) => <span key={i}>{line}</span>)}
            </address>
          </OrderCard>

          {/* Where the invoice goes, in one card. This used to be two - a read-only
              "Billing address" beside a "Who your invoice is made out to" panel -
              which put the same address on the page twice under two headings and
              left the customer to work out which of them the paperwork obeyed.

              Always shown, including on an order billed to the delivery address:
              the invoice is made out to somewhere whether or not the shopper gave
              a second address, and a card that disappears on those orders is a
              card that looks like a missing detail. */}
          <OrderCard title="Billing address">
            {billingOffered ? (
              <OrderBillingPanel
                orderId={order.id}
                companyLabel={config.organisationLabel.trim() || 'Company name'}
                // What the invoice prints, which on an older order is not always
                // the order's own column - see orderCompanyName.
                company={orderCompanyName(order) ?? ''}
                // The address the paperwork actually prints: the billing one where
                // the order carries one, the delivery one where it does not, which
                // is exactly what buildCustomer does when the invoice is raised.
                address={order.billingAddress ?? order.shippingAddress}
                editable={customerCanEditBilling({ config, order })}
                invoiced={Boolean(invoiceRecord)}
              />
            ) : (
              // A shop that does not take corrections says the same thing without
              // the form, and reads the same address the panel would have.
              <address className="sod-lines">
                {addressLines(order.billingAddress ?? order.shippingAddress)
                  .map((line, i) => <span key={i}>{line}</span>)}
              </address>
            )}
          </OrderCard>

          {completedRefunds.length > 0 && (
            <OrderCard title="Refunds" flush>
              <ul className="sod-rows">
                {completedRefunds.map((refund) => (
                  <li key={refund.id} className="sod-rowitem">
                    <span className="sod-rowhead">
                      <span>{formatOrderDate(refund.createdAt, timezone)}</span>
                      <span className="sod-amount">{formatMoney(refund.amount, symbol)}</span>
                    </span>
                    <span className="sod-dim">
                      {refundItems
                        .filter((item) => item.refundId === refund.id)
                        .map((item) => `${itemsById.get(item.orderItemId)?.productName ?? 'Item'} × ${item.quantity}`)
                        .join(', ') || 'Order refund'}
                    </span>
                  </li>
                ))}
              </ul>
            </OrderCard>
          )}

          {decided.length > 0 && (
            <OrderCard title="Requests you have made" flush>
              <ul className="sod-rows">
                {decided.map((request) => {
                  const state = REQUEST_STATUS_DISPLAY[request.status]
                  return (
                    <li key={request.id} className="sod-rowitem">
                      <span className="sod-rowhead">
                        <strong>{REQUEST_TYPE_LABEL[request.type]}</strong>
                        <span className={badgeClass(state.tone)}>{state.label}</span>
                      </span>
                      <span className="sod-dim">
                        asked {formatOrderDate(request.createdAt, timezone)} - {reasonLabel(request.type, request.reason)}
                        {request.items.length > 0 && (
                          <>
                            {' · '}
                            {request.items
                              .map((item) => `${itemsById.get(item.orderItemId)?.productName ?? 'Item'} × ${item.quantity}`)
                              .join(', ')}
                          </>
                        )}
                      </span>
                      {request.adminNote && <span>{request.adminNote}</span>}
                    </li>
                  )
                })}
              </ul>
            </OrderCard>
          )}
        </div>

        {/* Full width and last: it is the only thing on the page that starts
            something, and it opens into a form with a list of lines in it. */}
        {!openRequest && (
          <OrderRequestPanel
            orderId={order.id}
            cancel={{ allowed: detail.cancel.allowed, reason: detail.cancel.allowed ? undefined : detail.cancel.reason }}
            return={{ allowed: detail.return.allowed, reason: detail.return.allowed ? undefined : detail.return.reason }}
            cancelReasons={SHP_CANCEL_REASONS}
            returnReasons={SHP_RETURN_REASONS}
            lines={lines.map((line) => ({
              orderItemId: line.item.id,
              productName: line.item.productName,
              returnableQty: line.returnableQty,
            }))}
            returnBy={detail.returnBy ? formatOrderDate(detail.returnBy, timezone) : null}
          />
        )}

        {/* The offer of an account, to a guest who has just proved a postcode to
            get here. Last on the page on purpose: they came for the order, not
            for this, and they have now done by hand the very thing an account
            would have saved them - which is the best argument for one there is.
            Nothing is shown to a member, who has one. */}
        {!member && !order.memberId && (
          <GuestOrderAccountOffer config={config} customerEmail={order.customerEmail} />
        )}
      </div>
    </>
  )

  // A member's order sits inside the account, tab bar and all. A guest has no
  // account for it to sit inside, so it gets the same container on its own -
  // the width and the margins are MemberAccountShell's own, so the page does
  // not visibly change size depending on who is looking at it.
  return member ? (
    <MemberAccountShell member={member} maxWidth={880}>{body}</MemberAccountShell>
  ) : (
    <div style={{ maxWidth: 880, margin: '3rem auto', padding: '0 1.5rem' }}>{body}</div>
  )
}
