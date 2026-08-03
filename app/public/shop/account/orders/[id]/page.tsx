import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { getMemberFromCookie } from '@/lib/members/session'
import { getMembersConfig } from '@/lib/members/config'
import { getMemberAreaPath } from '@/lib/members/paths'
import MemberAccountShell from '@/components/members/account/MemberAccountShell'
import { getMemberOrderDetail } from '@/modules/shop/lib/member-orders'
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
} from '@/modules/shop/lib/order-display'
import OrderRequestPanel from '@/modules/shop/components/public/OrderRequestPanel'
import WithdrawRequestButton from '@/modules/shop/components/public/WithdrawRequestButton'
import BuyAgainButton from '@/modules/shop/components/public/BuyAgainButton'

export const metadata = { title: 'Order detail' }
export const dynamic = 'force-dynamic'

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  STRIPE: 'Card',
  PAYPAL: 'PayPal',
  BANK_TRANSFER: 'Bank transfer',
  CASH: 'Cash',
}

// The manual methods, and which setting holds the words that tell a shopper how
// to actually hand the money over. Named one by one rather than read off the
// provider registry's `confirmMode`, because a manual method contributed by a
// module keeps its instructions in its own settings, not in either of these two
// boxes - matching on "manual" alone would have printed the cash wording under
// somebody else's method.
const MANUAL_INSTRUCTION_KEYS = {
  BANK_TRANSFER: 'bankTransferInstructions',
  CASH: 'cashInstructions',
} as const

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
function PaymentInstructions({ instructions, amount }: { instructions: string; amount: string }) {
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
      <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{instructions}</p>
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
  const status = ORDER_STATUS_DISPLAY[order.status]
  const completedRefunds = refunds.filter((refund) => refund.status === 'COMPLETED')
  const refundedTotal = completedRefunds.reduce((sum, refund) => sum + Number(refund.amount), 0)
  const itemsById = new Map(lines.map((line) => [line.item.id, line.item]))
  const decided = requests.filter((request) => request.status !== 'PENDING')

  const instructionsKey = MANUAL_INSTRUCTION_KEYS[order.paymentMethod as keyof typeof MANUAL_INSTRUCTION_KEYS]
  const paymentInstructions = instructionsKey ? config[instructionsKey].trim() : ''
  // Outstanding, as against settled or written off. A cancelled or refunded
  // order asking to be paid would be worse than saying nothing at all, so both
  // fall out of the warning band even while the payment sits at PENDING - which
  // is exactly where a cancelled bank transfer stays, since nobody ever paid it.
  const paymentOutstanding =
    (order.paymentStatus === 'PENDING' || order.paymentStatus === 'AWAITING_CONFIRMATION') &&
    order.status !== 'CANCELLED' &&
    order.status !== 'REFUNDED'

  return (
    <MemberAccountShell member={member} maxWidth={880}>
      {gate.staffPreview && <ShopStaffPreviewBanner />}

      <div style={{ marginBottom: 'var(--space-4)' }}>
        <Link href="/shop/account/orders" prefetch={false} style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)', textDecoration: 'none' }}>
          ← All orders
        </Link>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', alignItems: 'center', marginTop: 'var(--space-2)' }}>
          <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-semibold)', margin: 0, color: 'var(--color-text)' }}>
            Order {order.orderNumber}
          </h1>
          <span className={badgeClass(status.tone)}>{status.label}</span>
        </div>
        <p style={{ color: 'var(--color-text-muted)', margin: '0.25rem 0 0', fontSize: 'var(--text-sm)' }}>
          Placed {formatOrderDate(order.createdAt)}
          {' · '}
          <Link href={`/shop/account/orders/${order.id}/receipt`} prefetch={false} style={{ color: 'var(--color-primary)' }}>
            Printable receipt
          </Link>
        </p>
      </div>

      <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
        {paymentInstructions && paymentOutstanding && (
          <PaymentInstructions instructions={paymentInstructions} amount={formatMoney(order.total, symbol)} />
        )}

        {openRequest && (
          <div className="alert alert-warning">
            <strong>{REQUEST_TYPE_LABEL[openRequest.type]} request sent.</strong>{' '}
            You asked on {formatOrderDate(openRequest.createdAt)} - reason given: {reasonLabel(openRequest.type, openRequest.reason)}.
            We will email you as soon as somebody has looked at it.
            <div style={{ marginTop: 'var(--space-2)' }}>
              <WithdrawRequestButton requestId={openRequest.id} />
            </div>
          </div>
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
                        <Link href={`/shop/products/${line.productSlug}`} prefetch={false} style={{ color: 'inherit' }}>
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
                        Pre-order{line.item.preOrderDispatchDate ? ` · expected ${formatOrderDate(line.item.preOrderDispatchDate)}` : ''}
                      </span>
                    )}
                    {config.buyAgainEnabled && (
                      <BuyAgainButton
                        productId={line.item.productId}
                        productSlug={line.productSlug}
                        quantity={line.item.quantity}
                        personalised={!!line.item.lineMeta?.fields?.length}
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
                    {shipments.length === 1 ? 'Sent' : `Parcel ${index + 1}, sent`} {formatOrderDate(shipment.shippedAt)}
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
            Paid by {PAYMENT_METHOD_LABELS[order.paymentMethod] ?? order.paymentMethod}
            {order.paidAt
              ? ` on ${formatOrderDate(order.paidAt)}`
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
                    <span>{formatOrderDate(refund.createdAt)}</span>
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

        <div style={{ display: 'grid', gap: 'var(--space-4)', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
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
            returnBy={detail.returnBy ? formatOrderDate(detail.returnBy) : null}
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
                        asked {formatOrderDate(request.createdAt)}
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
