import { getSiteTimezone } from '@/lib/config/timezone'
import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { getMemberFromCookie } from '@/lib/members/session'
import { getMembersConfig } from '@/lib/members/config'
import { getMemberAreaPath } from '@/lib/members/paths'
import { moduleAccountSectionAnchor } from '@/lib/members/account-layout'
import MemberAccountShell from '@/components/members/account/MemberAccountShell'
import { getMemberOrderDetail } from '@/modules/shop/lib/member-orders'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import { productHref } from '@/modules/shop/lib/product-url'
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
} from '@/modules/shop/lib/order-display'
import { getInvoiceForOrder } from '@/modules/shop/lib/db/invoices'
import { listCreditNotesForOrder } from '@/modules/shop/lib/db/credit-notes'
import {
  creditNotePath, creditNotePdfPath, invoicePath, invoicePdfPath, proformaPath, proformaPdfPath,
} from '@/modules/shop/lib/invoice-token'
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
import BuyAgainButton from '@/modules/shop/components/public/BuyAgainButton'

export const metadata = { title: 'Order detail' }
export const dynamic = 'force-dynamic'

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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card" style={{ padding: 'var(--space-4)', display: 'grid', gap: 'var(--space-3)' }}>
      <h2 className="card-title" style={{ margin: 0 }}>{title}</h2>
      {children}
    </div>
  )
}

// How to pay, for the methods where paying is still a job the shopper has to go
// and do. The thank-you page says this once, at a moment nobody is reading
// carefully; this is where they come back to it a week later with their banking
// app open, so it sits above everything else the page has to say.
//
// It is an outstanding task or it is nothing. Once the money has been marked as
// arrived there is no job left, and a panel of bank details on a settled order
// reads as a second demand for a bill already paid - so the whole thing goes
// rather than softening into a "how you paid" note nobody asked for.
function PaymentInstructions({ instructions, amount, payNow }: {
  instructions: string
  amount: string
  /** The offer to settle it here and now, where the shop makes one. Inside this
   *  panel rather than beside it: it is the same question - how does this get
   *  paid - and two boxes asking it would read as two different bills. */
  payNow?: React.ReactNode
}) {
  return (
    <div
      className="alert alert-warning"
      // `.alert` carries its own bottom margin, which inside this grid would sit
      // on top of the gap and open a hole under the panel. The grid decides the
      // spacing here, as it does for every other block on the page.
      style={{ padding: 'var(--space-4)', marginBottom: 0, display: 'grid', gap: 'var(--space-2)' }}
    >
      <strong>How to pay - {amount} still to reach us</strong>
      <p style={{ margin: 0 }}>
        Your order is awaiting payment confirmation. We will be in touch once it clears.
      </p>
      {instructions && <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{instructions}</p>}
      {payNow && (
        <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 'var(--space-3)', marginTop: 'var(--space-1)' }}>
          {payNow}
        </div>
      )}
    </div>
  )
}

function TotalRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: strong ? 'var(--font-semibold)' : undefined }}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  )
}

export default async function ShopAccountOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const timezone = await getSiteTimezone()
  const membersConfig = await getMembersConfig()
  if (!membersConfig.enabled) notFound()

  const gate = await getShopGate()
  if (gate.blocked) return <ShopClosedNotice message={gate.message} />

  const member = await getMemberFromCookie()
  if (!member) redirect(`/${getMemberAreaPath()}/login?redirect=/shop/account/orders`)

  const { id } = await params
  const [detail, config] = await Promise.all([getMemberOrderDetail(id, member), getShopConfigCached()])
  // Someone else's order is a 404, not a 403: a "not yours" would confirm the
  // id exists, which is more than a stranger should be able to learn.
  if (!detail) notFound()

  const { order, lines, shipments, refunds, refundItems, downloads, requests, openRequest } = detail
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
  const invoiceRecord = showPaperwork || (referenceOffered && config.invoicesEnabled)
    ? await getInvoiceForOrder(order.id)
    : null
  // The one the paperwork links read. A shop that raises invoices and keeps them
  // to itself still has none to offer here, exactly as before.
  const invoice = showPaperwork ? invoiceRecord : null
  // Money that went back is paperwork the buyer is owed just as much as the
  // invoice - more so for a business buyer, whose own accountant needs the
  // document rather than a line on a card statement. Only read where there is
  // an invoice to credit, so an ordinary shop's order page costs what it did.
  const creditNotes = invoice ? await listCreditNotesForOrder(order.id) : []
  // Where "back" goes. On a one-page account the order history is a stretch of
  // the account itself and its own page is not in the tab bar any more, so back
  // means back to that stretch.
  const allOrdersHref = membersConfig.accountSinglePage
    ? `/${getMemberAreaPath()}#${moduleAccountSectionAnchor('orders')}`
    : '/shop/account/orders'
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

  return (
    <MemberAccountShell member={member} maxWidth={880}>
      {gate.staffPreview && <ShopStaffPreviewBanner />}

      <div style={{ marginBottom: 'var(--space-4)' }}>
        <Link href={allOrdersHref} prefetch={false} style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)', textDecoration: 'none' }}>
          ← All orders
        </Link>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', alignItems: 'center', marginTop: 'var(--space-2)' }}>
          <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-semibold)', margin: 0, color: 'var(--color-text)' }}>
            Order {order.orderNumber}
          </h1>
          <span className={badgeClass(status.tone)}>{status.label}</span>
        </div>
        <p style={{ color: 'var(--color-text-muted)', margin: '0.25rem 0 0', fontSize: 'var(--text-sm)' }}>
          Placed {formatOrderDate(order.createdAt, timezone)}
          {' · '}
          {/* Its own tab: printing is a detour, and a member who came to look at
              their order should still have it there when the print dialog has
              been dealt with. rel="noopener" as ever on a target of _blank. */}
          <Link
            href={`/shop/account/orders/${order.id}/receipt`}
            prefetch={false}
            target="_blank"
            rel="noopener"
            style={{ color: 'var(--color-primary)' }}
          >
            Printable receipt
          </Link>
          {/* The invoice, once one has been raised and the shop is willing to
              show it. Straight to the PDF where the shop makes them: somebody
              opening their own paperwork wants the file, not a web page to save
              it from. Off, it falls back to the on-screen copy.
              A plain <a>: both are signed rather than session-bound, so
              prefetching would put the token in the browser's speculation cache
              for no gain, and an attachment is not a route to prefetch at all. */}
          {invoice && (
            <>
              {' · '}
              <a
                href={pdfDownloads ? invoicePdfPath(invoice.invoiceNumber) : invoicePath(invoice.invoiceNumber)}
                style={{ color: 'var(--color-primary)' }}
              >
                Invoice {invoice.invoiceNumber}
              </a>
            </>
          )}
          {proforma && (
            <>
              {' · '}
              <a
                href={pdfDownloads ? proformaPdfPath(order.orderNumber) : proformaPath(order.orderNumber)}
                style={{ color: 'var(--color-primary)' }}
              >
                Proforma invoice
              </a>
            </>
          )}
          {invoicePromise && (
            <>
              {' · '}
              <span>
                Your {config.invoiceTaxLabel || 'VAT'} invoice {invoicePromise}
              </span>
            </>
          )}
          {creditNotes.map((note) => (
            <span key={note.id}>
              {' · '}
              <a
                href={pdfDownloads ? creditNotePdfPath(note.creditNoteNumber) : creditNotePath(note.creditNoteNumber)}
                style={{ color: 'var(--color-primary)' }}
              >
                Credit note {note.creditNoteNumber}
              </a>
            </span>
          ))}
        </p>
      </div>

      <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
        {outstanding && (paymentInstructions || payOnline.length > 0) && (
          <PaymentInstructions
            instructions={paymentInstructions}
            amount={formatMoney(order.total, symbol)}
            payNow={payOnline.length > 0 ? (
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
            ) : null}
          />
        )}

        {openRequest && (
          <div className="alert alert-warning">
            <strong>{REQUEST_TYPE_LABEL[openRequest.type]} request sent.</strong>{' '}
            You asked on {formatOrderDate(openRequest.createdAt, timezone)} - reason given: {reasonLabel(openRequest.type, openRequest.reason)}.
            We will email you as soon as somebody has looked at it.
            <div style={{ marginTop: 'var(--space-2)' }}>
              <WithdrawRequestButton requestId={openRequest.id} />
            </div>
          </div>
        )}

        {showReference && (
          <Section title={referenceLabel}>
            <OrderReferencePanel
              orderId={order.id}
              label={referenceLabel}
              reference={order.customerReference ?? ''}
              editable={referenceEditable}
            />
          </Section>
        )}

        <Section title="What you ordered">
          <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
            {lines.map((line) => (
              <div key={line.item.id} style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-start' }}>
                {line.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- storage-served product image, not a local asset next/image can optimise
                  <img
                    src={line.imageUrl}
                    alt=""
                    width={64}
                    height={64}
                    style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', flexShrink: 0 }}
                  />
                ) : (
                  <div aria-hidden style={{ width: 64, height: 64, borderRadius: 'var(--radius-md)', background: 'var(--color-bg-subtle)', border: '1px solid var(--color-border)', flexShrink: 0 }} />
                )}

                <div style={{ flex: 1, minWidth: 0, display: 'grid', gap: '0.25rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-2)' }}>
                    <span style={{ fontWeight: 'var(--font-medium)' }}>
                      {line.productSlug ? (
                        <Link href={productHref(line.productSlug, config.productUrlStyle)} prefetch={false} style={{ color: 'inherit' }}>
                          {line.item.productName}
                        </Link>
                      ) : (
                        line.item.productName
                      )}
                      {' '}× {line.item.quantity}
                    </span>
                    <span>{formatMoney(line.item.total, symbol)}</span>
                  </div>

                  {line.item.lineMeta?.fields?.length ? (
                    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.125rem' }}>
                      {line.item.lineMeta.fields.map((field, i) => (
                        <li key={i} style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
                          <span style={{ fontWeight: 'var(--font-medium)' }}>{field.label}:</span>{' '}
                          {field.href ? (
                            <a href={field.href} target="_blank" rel="noopener noreferrer">{field.value}</a>
                          ) : (
                            field.value
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem', alignItems: 'center', marginTop: '0.25rem' }}>
                    {line.dispatchedQty > 0 && (
                      <span className="badge badge-success">
                        {line.dispatchedQty >= line.item.quantity ? 'Dispatched' : `${line.dispatchedQty} of ${line.item.quantity} dispatched`}
                      </span>
                    )}
                    {line.item.refundedQty > 0 && <span className="badge badge-warning">{line.item.refundedQty} refunded</span>}
                    {line.item.isPreOrder && (
                      <span className="badge badge-info">
                        Pre-order{line.item.preOrderDispatchDate ? ` · expected ${formatOrderDate(line.item.preOrderDispatchDate, timezone)}` : ''}
                      </span>
                    )}
                    {config.buyAgainEnabled && (
                      <BuyAgainButton
                        productId={line.item.productId}
                        productSlug={line.productSlug}
                        quantity={line.item.quantity}
                        personalised={!!line.item.lineMeta?.fields?.length}
                        productUrlStyle={config.productUrlStyle}
                      />
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Section>

        {shipments.length > 0 && (
          <Section title={shipments.length === 1 ? 'Your parcel' : 'Your parcels'}>
            <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
              {shipments.map((shipment, index) => (
                <div key={shipment.id} style={{ display: 'grid', gap: '0.25rem' }}>
                  <span style={{ fontWeight: 'var(--font-medium)' }}>
                    {shipments.length === 1 ? 'Sent' : `Parcel ${index + 1}, sent`} {formatOrderDate(shipment.shippedAt, timezone)}
                    {shipment.carrier ? ` with ${shipment.carrier}` : ''}
                  </span>
                  {shipment.trackingNumber && (
                    <span style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>
                      Tracking number: {shipment.trackingNumber}
                    </span>
                  )}
                  <ul style={{ listStyle: 'none', margin: 0, padding: 0, color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>
                    {shipment.items.map((item) => (
                      <li key={item.id}>
                        {itemsById.get(item.orderItemId)?.productName ?? 'Item'} × {item.quantity}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              {shipments.length > 1 && (
                <p style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>
                  Parcels sent separately can arrive a day or two apart, so do not worry if they turn up at different times.
                </p>
              )}
            </div>
          </Section>
        )}

        {downloads.length > 0 && (
          <Section title="Your downloads">
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.375rem' }}>
              {downloads.map((download) => (
                <li key={download.id}>
                  <a href={`/shop/downloads/${download.token}`} style={{ color: 'var(--color-primary)' }}>Download</a>
                </li>
              ))}
            </ul>
          </Section>
        )}

        <Section title="What it came to">
          <div style={{ display: 'grid', gap: '0.375rem' }}>
            <TotalRow label="Items" value={formatMoney(order.subtotal, symbol)} />
            {Number(order.discountAmount) > 0 && (
              <TotalRow
                label={order.couponCode ? `Discount (${order.couponCode})` : 'Discount'}
                value={`-${formatMoney(order.discountAmount, symbol)}`}
              />
            )}
            <TotalRow label={order.shippingRateName || 'Delivery'} value={formatMoney(order.shippingAmount, symbol)} />
            {Number(order.taxAmount) > 0 && (
              <TotalRow
                label={order.taxMode === 'INCLUSIVE' ? 'VAT (included)' : 'VAT'}
                value={formatMoney(order.taxAmount, symbol)}
              />
            )}
            <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '0.375rem' }}>
              <TotalRow label="Total" value={formatMoney(order.total, symbol)} strong />
            </div>
            {refundedTotal > 0 && (
              <>
                <TotalRow label="Refunded" value={`-${formatMoney(refundedTotal, symbol)}`} />
                <TotalRow label="Left after refunds" value={formatMoney(Number(order.total) - refundedTotal, symbol)} strong />
              </>
            )}
          </div>
          <p style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>
            Paid by {PAYMENT_METHOD_LABELS[shownMethod] ?? methodLabels[shownMethod] ?? shownMethod}
            {order.paidAt
              ? ` on ${formatOrderDate(order.paidAt, timezone)}`
              : order.paymentStatus === 'PENDING'
                ? ' - not received yet'
                : ''}
          </p>
        </Section>

        {completedRefunds.length > 0 && (
          <Section title="Refunds">
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.5rem' }}>
              {completedRefunds.map((refund) => (
                <li key={refund.id} style={{ display: 'grid', gap: '0.125rem' }}>
                  <span style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>{formatOrderDate(refund.createdAt, timezone)}</span>
                    <span>{formatMoney(refund.amount, symbol)}</span>
                  </span>
                  <span style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>
                    {refundItems
                      .filter((item) => item.refundId === refund.id)
                      .map((item) => `${itemsById.get(item.orderItemId)?.productName ?? 'Item'} × ${item.quantity}`)
                      .join(', ') || 'Order refund'}
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* min(100%, 260px): the addresses stack on a phone rather than
            insisting on a 260px column the screen has not got, which would put
            a sideways scrollbar under the whole order. */}
        <div style={{ display: 'grid', gap: 'var(--space-4)', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))' }}>
          <Section title="Delivery address">
            <address style={{ fontStyle: 'normal', color: 'var(--color-text-muted)', display: 'grid', gap: '0.125rem' }}>
              {addressLines(order.shippingAddress).map((line, i) => <span key={i}>{line}</span>)}
            </address>
          </Section>
          {order.billingAddress && (
            <Section title="Billing address">
              <address style={{ fontStyle: 'normal', color: 'var(--color-text-muted)', display: 'grid', gap: '0.125rem' }}>
                {addressLines(order.billingAddress).map((line, i) => <span key={i}>{line}</span>)}
              </address>
            </Section>
          )}
        </div>

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

        {decided.length > 0 && (
          <Section title="Requests you have made">
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 'var(--space-2)' }}>
              {decided.map((request) => {
                const state = REQUEST_STATUS_DISPLAY[request.status]
                return (
                  <li key={request.id} style={{ display: 'grid', gap: '0.125rem' }}>
                    <span style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
                      <strong>{REQUEST_TYPE_LABEL[request.type]}</strong>
                      <span className={badgeClass(state.tone)}>{state.label}</span>
                      <span style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>
                        asked {formatOrderDate(request.createdAt, timezone)}
                      </span>
                    </span>
                    <span style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>
                      {reasonLabel(request.type, request.reason)}
                      {request.items.length > 0 && (
                        <>
                          {' · '}
                          {request.items
                            .map((item) => `${itemsById.get(item.orderItemId)?.productName ?? 'Item'} × ${item.quantity}`)
                            .join(', ')}
                        </>
                      )}
                    </span>
                    {request.adminNote && <span style={{ fontSize: 'var(--text-sm)' }}>{request.adminNote}</span>}
                  </li>
                )
              })}
            </ul>
          </Section>
        )}
      </div>
    </MemberAccountShell>
  )
}
