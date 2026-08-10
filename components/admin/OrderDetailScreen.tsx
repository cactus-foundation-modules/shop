'use client'

import { useCallback, useEffect, useState } from 'react'
import { useAdminPath } from '@/components/admin/AdminPathContext'
import { RefundModal } from '@/modules/shop/components/admin/RefundModal'
import { DispatchModal } from '@/modules/shop/components/admin/DispatchModal'
import { EmailCustomerModal } from '@/modules/shop/components/admin/EmailCustomerModal'
import { ordersScreenCss } from '@/modules/shop/components/admin/orders-screen-css'
import {
  ORDER_STATUS_BADGE,
  PAYMENT_STATUS_BADGE,
  SETTABLE_STATUSES,
  badgeFor,
  fulfilmentBadge,
  formatDate,
  formatDateTime,
  paymentMethodLabel,
  relativeTime,
} from '@/modules/shop/components/admin/order-labels'
import { formatMoney } from '@/modules/shop/lib/money'
import { useCurrencySymbol } from '@/modules/shop/components/admin/use-currency-symbol'
import { useAlert, useConfirm } from '@/modules/shop/components/admin/dialogs'

type LineMetaField = { label: string; value: string; href?: string }
type OrderItem = {
  id: string; productId: string | null; productName: string; productSku: string | null; productType: string
  quantity: number; unitPrice: string; taxRate: string; taxAmount: string; total: string
  refundedQty: number; isPreOrder: boolean; preOrderDispatchDate: string | null
  lineMeta?: { fields: LineMetaField[] } | null
}
type Address = { firstName?: string; lastName?: string; company?: string; line1: string; line2?: string; city: string; county?: string; postcode: string; country: string; phone?: string }
type OrderDetail = {
  order: {
    id: string; orderNumber: string; status: string; paymentStatus: string; paymentMethod: string; paymentReference: string | null
    memberId: string | null; customerName: string; customerEmail: string; customerPhone: string | null
    subtotal: string; discountAmount: string; shippingAmount: string; taxAmount: string; total: string
    taxMode: string; currency: string; couponCode: string | null; shippingRateName: string | null
    shippingAddress: Address; billingAddress: Address | null
    paidAt: string | null; createdAt: string; updatedAt: string
    // What the buyer was asked to tick at checkout, worded as they saw it.
    // Null on an order placed while the shop had no tickboxes switched on -
    // which is a different fact from "asked and ticked nothing", so it renders
    // as no section at all rather than an empty one.
    agreements?: Array<{ id: string; statement: string; linkUrl: string; required: boolean; accepted: boolean; acceptedAt: string | null }> | null
  }
  items: OrderItem[]
  notes: Array<{ id: string; content: string; isInternal: boolean; createdBy: string | null; createdAt: string }>
  emails: Array<{ id: string; subject: string; to: string; sentAt: string; trigger: string }>
  refunds: Array<{ id: string; amount: string; reason: string | null; status: string; createdBy: string; createdAt: string }>
  refundItems: Array<{ id: string; refundId: string; orderItemId: string; quantity: number; amount: string }>
  downloads: Array<{ id: string; token: string; orderItemId: string; downloadCount: number; expiresAt: string | null }>
  customer: { orderCount: number; paidOrderCount: number; totalSpent: string; firstOrderAt: string | null }
  authors: Record<string, string>
}

// Dispatch progress is worked out from the shipment lines every time it is
// asked for - there is no dispatched status on the order - so it arrives on its
// own call alongside the order.
type DispatchLine = { orderItemId: string; productName: string; quantity: number; refundedQty: number; dispatchedQty: number; outstandingQty: number }
type ShipmentDetail = { id: string; shippedAt: string; trackingNumber: string | null; carrier: string | null; notes: string | null; items: Array<{ id: string; orderItemId: string; quantity: number }> }
type DispatchDetail = {
  summary: { lines: DispatchLine[]; fullyDispatched: boolean; partiallyDispatched: boolean }
  shipments: ShipmentDetail[]
  // Surfaced only. The shop's hold-everything policy is enforced when the
  // status is changed, not here.
  preOrderHold: { active: boolean; outstandingCount: number; expectedDate: string | null }
}

const EMAIL_TRIGGER_LABEL: Record<string, string> = {
  ORDER_CONFIRMED: 'Order confirmation',
  STATUS_PROCESSING: 'Status update',
  STATUS_SHIPPED: 'Dispatch notice',
  STATUS_COMPLETED: 'Status update',
  STATUS_CANCELLED: 'Cancellation',
  PARTIAL_SHIPPED: 'Part dispatched',
  ADMIN_NEW_ORDER: 'Your own new-order alert',
  MANUAL: 'Sent by you',
  REPLY_CATCHER: 'Reply',
}

type TimelineEvent = { id: string; at: string; icon: string; title: string; note?: string }

export function OrderDetailScreen({ orderId, children }: { orderId: string; children?: React.ReactNode }) {
  const adminPath = useAdminPath()
  const currencySymbol = useCurrencySymbol()
  const [alert, alertNode] = useAlert()
  const [confirm, confirmNode] = useConfirm()

  const [data, setData] = useState<OrderDetail | null>(null)
  const [dispatch, setDispatch] = useState<DispatchDetail | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [sendEmailOnChange, setSendEmailOnChange] = useState(true)
  const [busy, setBusy] = useState(false)
  const [refundOpen, setRefundOpen] = useState(false)
  const [dispatchOpen, setDispatchOpen] = useState(false)
  const [emailOpen, setEmailOpen] = useState(false)

  const refresh = useCallback(() => {
    fetch(`/api/m/shop/admin/orders/${orderId}`)
      .then(async (r) => {
        if (!r.ok) { setLoadError('This order could not be loaded.'); return }
        setData(await r.json())
        setLoadError(null)
      })
      .catch(() => setLoadError('This order could not be loaded.'))
    fetch(`/api/m/shop/admin/orders/${orderId}/dispatch`)
      .then(async (r) => { if (r.ok) setDispatch(await r.json()) })
      .catch(() => {})
  }, [orderId])

  useEffect(refresh, [refresh])

  if (loadError) return <div className="alert alert-danger">{loadError}</div>
  if (!data) return <div className="sox-loading">Loading order…</div>

  const { order } = data

  async function setStatus(status: string) {
    setBusy(true)
    const res = await fetch(`/api/m/shop/admin/orders/${orderId}/status`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, sendEmail: sendEmailOnChange }),
    })
    setBusy(false)
    if (!res.ok) {
      // The server's refusals (the pre-order hold in particular) are already
      // written for a shop owner, so they are shown as they came back.
      await alert(((await res.json().catch(() => ({}))) as { error?: string }).error ?? 'That status could not be set.', 'This order was left as it was')
      return
    }
    refresh()
  }

  async function addNote() {
    if (!note.trim()) return
    setBusy(true)
    const res = await fetch(`/api/m/shop/admin/orders/${orderId}/notes`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: note.trim() }),
    })
    setBusy(false)
    if (!res.ok) { await alert('That note could not be saved.'); return }
    setNote('')
    refresh()
  }

  async function confirmPayment() {
    if (!(await confirm({
      title: 'Mark this order as paid?',
      message: 'Only do this once the money has actually landed. It sets the order going: stock comes off, any downloads are released and the customer is emailed.',
      confirmLabel: 'Payment received',
      danger: false,
    }))) return
    setBusy(true)
    const res = await fetch(`/api/m/shop/admin/orders/${orderId}/confirm-payment`, { method: 'POST' })
    setBusy(false)
    if (!res.ok) { await alert('That payment could not be confirmed.'); return }
    refresh()
  }

  async function undoDispatch(shipment: ShipmentDetail) {
    if (!(await confirm({
      title: 'Undo this dispatch?',
      message: 'The items go straight back to being outstanding, and any stock this parcel took off is put back. The customer is not told.',
      confirmLabel: 'Undo dispatch',
    }))) return
    setBusy(true)
    const res = await fetch(`/api/m/shop/admin/orders/${orderId}/dispatch?shipmentId=${shipment.id}`, { method: 'DELETE' })
    setBusy(false)
    if (!res.ok) {
      await alert(((await res.json().catch(() => ({}))) as { error?: string }).error ?? 'That dispatch could not be undone.')
      return
    }
    refresh()
  }

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      await alert(`${what} could not be copied - your browser would not allow it. It is: ${text}`)
    }
  }

  const dispatchByItem = new Map((dispatch?.summary.lines ?? []).map((l) => [l.orderItemId, l]))
  const itemNames = new Map(data.items.map((i) => [i.id, i.productName]))
  const hasRefundableItems = data.items.some((i) => i.refundedQty < i.quantity)
  const hasOutstandingItems = (dispatch?.summary.lines ?? []).some((l) => l.outstandingQty > 0)
  const hold = dispatch?.preOrderHold
  const totalUnits = data.items.reduce((sum, i) => sum + i.quantity, 0)
  const dispatchedUnits = (dispatch?.summary.lines ?? []).reduce((sum, l) => sum + l.dispatchedQty, 0)
  const outstandingUnits = (dispatch?.summary.lines ?? []).reduce((sum, l) => sum + l.outstandingQty, 0)
  const refundedTotal = data.refunds
    .filter((r) => r.status !== 'FAILED')
    .reduce((sum, r) => sum + Number(r.amount), 0)

  const statusBadge = badgeFor(ORDER_STATUS_BADGE, order.status)
  const paymentBadge = badgeFor(PAYMENT_STATUS_BADGE, order.paymentStatus)
  const dispatchBadge = fulfilmentBadge(dispatch ? { dispatchedUnits, outstandingUnits } : undefined)
  const awaitingManualPayment =
    (order.paymentMethod === 'BANK_TRANSFER' || order.paymentMethod === 'CASH') &&
    (order.paymentStatus === 'AWAITING_CONFIRMATION' || order.paymentStatus === 'PENDING')

  // Everything that has happened to this order, in one list, newest first.
  // Notes, emails, parcels and refunds each used to have a section of their own,
  // which meant answering "what happened here?" by reading four lists and doing
  // the chronology in your head.
  const events: TimelineEvent[] = [
    { id: 'created', at: order.createdAt, icon: '🧾', title: 'Order placed', note: `${totalUnits} item${totalUnits === 1 ? '' : 's'} · ${formatMoney(order.total, currencySymbol)}` },
    ...(order.paidAt ? [{
      id: 'paid',
      at: order.paidAt,
      icon: '💷',
      title: `Payment received by ${paymentMethodLabel(order.paymentMethod).toLowerCase()}`,
      note: order.paymentReference ? `Reference ${order.paymentReference}` : undefined,
    }] : []),
    ...data.notes.map((n) => ({
      id: `note-${n.id}`,
      at: n.createdAt,
      icon: '📝',
      title: n.createdBy ? `Note from ${data.authors[n.createdBy] ?? 'a member of staff'}` : 'Note',
      note: n.content,
    })),
    ...data.emails.map((e) => ({
      id: `email-${e.id}`,
      at: e.sentAt,
      icon: '✉️',
      title: `Email: ${e.subject}`,
      note: `${EMAIL_TRIGGER_LABEL[e.trigger] ?? e.trigger} · to ${e.to}`,
    })),
    ...(dispatch?.shipments ?? []).map((s) => ({
      id: `parcel-${s.id}`,
      at: s.shippedAt,
      icon: '📦',
      title: 'Parcel dispatched',
      note: [
        s.items.map((si) => `${si.quantity} × ${itemNames.get(si.orderItemId) ?? 'an item no longer on this order'}`).join(', '),
        [s.carrier, s.trackingNumber].filter(Boolean).join(' · '),
        s.notes,
      ].filter(Boolean).join('\n'),
    })),
    ...data.refunds.map((r) => ({
      id: `refund-${r.id}`,
      at: r.createdAt,
      icon: '↩️',
      title: r.status === 'FAILED'
        ? `Refund of ${formatMoney(r.amount, currencySymbol)} failed`
        : `Refunded ${formatMoney(r.amount, currencySymbol)}`,
      note: [
        r.reason,
        data.refundItems
          .filter((ri) => ri.refundId === r.id)
          .map((ri) => `${ri.quantity} × ${itemNames.get(ri.orderItemId) ?? 'an item no longer on this order'}`)
          .join(', ') || null,
        r.createdBy ? `By ${data.authors[r.createdBy] ?? 'a member of staff'}` : null,
      ].filter(Boolean).join('\n'),
    })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())

  function addressLines(address: Address): string[] {
    return [
      [address.firstName, address.lastName].filter(Boolean).join(' '),
      address.company,
      address.line1,
      address.line2,
      address.city,
      address.county,
      address.postcode,
      address.country,
    ].filter((line): line is string => Boolean(line && line.trim()))
  }

  return (
    <div>
      <style dangerouslySetInnerHTML={{ __html: ordersScreenCss }} />

      <a className="sox-back" href={`/${adminPath}/m/shop/orders`}>← All orders</a>

      <div className="sox-orderhead">
        <div>
          <h1>Order {order.orderNumber}</h1>
          <p className="sox-orderhead-meta">
            Placed {formatDateTime(order.createdAt)} ({relativeTime(order.createdAt)})
          </p>
          <div className="sox-badges" style={{ marginTop: '0.5rem' }}>
            <span className={`badge ${statusBadge.cls}`}>{statusBadge.label}</span>
            <span className={`badge ${paymentBadge.cls}`}>{paymentBadge.label}</span>
            <span className={`badge ${dispatchBadge.cls}`}>{dispatchBadge.label}</span>
            {data.items.some((i) => i.isPreOrder) && <span className="badge badge-info">Has a pre-order</span>}
          </div>
        </div>
        <div className="sox-orderhead-actions">
          {hasOutstandingItems && (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setDispatchOpen(true)}>Dispatch items</button>
          )}
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEmailOpen(true)}>Email customer</button>
          {hasRefundableItems && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setRefundOpen(true)}>Refund</button>
          )}
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => window.print()}>Print</button>
        </div>
      </div>

      {hold?.active && (
        <p className="sox-notice sox-noprint" style={{ marginBottom: '1rem' }}>
          Your shop is set to hold the whole order until every item is in stock.{' '}
          {hold.outstandingCount === 1 ? '1 item is' : `${hold.outstandingCount} items are`} still on pre-order
          {hold.expectedDate
            ? `, ${hold.outstandingCount === 1 ? 'expected' : 'the last of them expected'} on ${formatDate(hold.expectedDate)}`
            : ', with no expected date yet'}
          , so this order is not due to go out yet.
        </p>
      )}

      <div className="sox-cols">
        <div className="sox-col">
          <section className="sox-card">
            <div className="sox-card-head">
              <h2>Items</h2>
              <span className="sox-muted" style={{ fontSize: '0.8125rem' }}>
                {totalUnits} item{totalUnits === 1 ? '' : 's'}
                {dispatch ? ` · ${dispatchedUnits} sent · ${outstandingUnits} still to go` : ''}
              </span>
            </div>
            <div className="sox-card-body is-flush">
              <table className="sox-items">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th className="sox-num">Unit price</th>
                    <th className="sox-num">Qty</th>
                    <th className="sox-num">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((item) => {
                    const line = dispatchByItem.get(item.id)
                    return (
                      <tr key={item.id}>
                        <td>
                          {item.productId ? (
                            <a className="sox-item-name" href={`/${adminPath}/m/shop/products/${item.productId}`}>{item.productName}</a>
                          ) : (
                            <span className="sox-item-name">{item.productName}</span>
                          )}
                          {item.productSku && <p className="sox-sub sox-mono">{item.productSku}</p>}
                          {item.lineMeta?.fields?.length ? (
                            <ul className="sox-meta-list">
                              {item.lineMeta.fields.map((f, i) => (
                                <li key={i}>
                                  <b>{f.label}:</b>{' '}
                                  {f.href ? <a href={f.href} target="_blank" rel="noopener noreferrer">{f.value}</a> : f.value}
                                </li>
                              ))}
                            </ul>
                          ) : null}
                          <div className="sox-linepills">
                            {item.isPreOrder && (
                              <span className="badge badge-info">
                                Pre-order{item.preOrderDispatchDate ? ` · due ${formatDate(item.preOrderDispatchDate)}` : ''}
                              </span>
                            )}
                            {line && line.dispatchedQty > 0 && <span className="badge badge-success">{line.dispatchedQty} sent</span>}
                            {line && line.outstandingQty > 0 && line.dispatchedQty > 0 && <span className="badge badge-warning">{line.outstandingQty} to go</span>}
                            {item.refundedQty > 0 && <span className="badge badge-warning">{item.refundedQty} refunded</span>}
                          </div>
                        </td>
                        <td className="sox-num">{formatMoney(item.unitPrice, currencySymbol)}</td>
                        <td className="sox-num">{item.quantity}</td>
                        <td className="sox-num">{formatMoney(item.total, currencySymbol)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {dispatch && dispatch.shipments.length > 0 && (
            <section className="sox-card">
              <div className="sox-card-head"><h2>Parcels</h2></div>
              <div className="sox-card-body">
                <ul className="sox-list">
                  {dispatch.shipments.map((shipment) => (
                    <li key={shipment.id}>
                      <div className="sox-list-main">
                        <p className="sox-list-title">
                          {formatDate(shipment.shippedAt)}
                          {shipment.carrier ? ` · ${shipment.carrier}` : ''}
                          {shipment.trackingNumber ? ` · ${shipment.trackingNumber}` : ''}
                        </p>
                        <p className="sox-list-sub">
                          {shipment.items.map((si) => `${si.quantity} × ${itemNames.get(si.orderItemId) ?? 'an item no longer on this order'}`).join(', ')}
                          {shipment.notes ? ` - ${shipment.notes}` : ''}
                        </p>
                      </div>
                      <button type="button" className="btn btn-ghost btn-sm sox-noprint" disabled={busy} onClick={() => undoDispatch(shipment)}>Undo</button>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          )}

          {data.downloads.length > 0 && (
            <section className="sox-card sox-noprint">
              <div className="sox-card-head"><h2>Digital downloads</h2></div>
              <div className="sox-card-body">
                <ul className="sox-list">
                  {data.downloads.map((d) => (
                    <li key={d.id}>
                      <div className="sox-list-main">
                        <p className="sox-list-title">{itemNames.get(d.orderItemId) ?? 'Download'}</p>
                        <p className="sox-list-sub">
                          Downloaded {d.downloadCount} time{d.downloadCount === 1 ? '' : 's'}
                          {d.expiresAt ? ` · link expires ${formatDate(d.expiresAt)}` : ' · link does not expire'}
                        </p>
                      </div>
                      <button type="button" className="sox-copy" onClick={() => copy(`${window.location.origin}/shop/downloads/${d.token}`, 'The download link')}>Copy link</button>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          )}

          {/* The point of storing what was ticked is being able to look at it, so
              it is on the order rather than buried in an export. The statement is
              the one the shopper actually saw, not today's wording. */}
          {order.agreements && order.agreements.length > 0 && (
            <section className="sox-card">
              <div className="sox-card-head"><h2>Agreed at checkout</h2></div>
              <div className="sox-card-body">
                <ul className="sox-list">
                  {order.agreements.map((agreement) => (
                    <li key={agreement.id}>
                      <div className="sox-list-main" style={{ display: 'flex', gap: '0.5rem', alignItems: 'baseline' }}>
                        <span aria-hidden="true" style={{ color: agreement.accepted ? 'var(--color-success)' : 'var(--color-text-secondary)' }}>
                          {agreement.accepted ? '✓' : '✗'}
                        </span>
                        <span>
                          {agreement.statement.replace(/\[([^\]]*)\]/g, '$1')}
                          {agreement.required && <span className="sox-muted"> (required)</span>}
                          {agreement.acceptedAt && <span className="sox-muted"> - {formatDateTime(agreement.acceptedAt)}</span>}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          )}

          <section className="sox-card">
            <div className="sox-card-head"><h2>History</h2></div>
            <div className="sox-card-body">
              <div className="sox-composer sox-noprint" style={{ marginTop: 0, paddingTop: 0, borderTop: 0 }}>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Add a note - only you and your team ever see these."
                  aria-label="Add a note to this order"
                />
                <div className="sox-composer-row">
                  <span className="sox-muted" style={{ fontSize: '0.75rem' }}>Notes are never shown to the customer.</span>
                  <button type="button" className="btn btn-secondary btn-sm" disabled={busy || !note.trim()} onClick={addNote}>Add note</button>
                </div>
              </div>
              <ul className="sox-timeline" style={{ marginTop: '1rem' }}>
                {events.map((event) => (
                  <li key={event.id} className="sox-event">
                    <span className="sox-event-icon" aria-hidden="true">{event.icon}</span>
                    <div className="sox-event-body">
                      <p className="sox-event-title">{event.title}</p>
                      {event.note && <p className="sox-event-note">{event.note}</p>}
                      <p className="sox-event-when">{formatDateTime(event.at)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {children}
        </div>

        <div className="sox-col">
          <section className="sox-card sox-noprint">
            <div className="sox-card-head"><h2>Status</h2></div>
            <div className="sox-card-body" style={{ display: 'grid', gap: '0.625rem' }}>
              <label style={{ display: 'grid', gap: '0.25rem', fontSize: '0.8125rem' }}>
                Order status
                <select className="sox-select" value={order.status} disabled={busy} onChange={(e) => setStatus(e.target.value)}>
                  {/* A refunded order's status is set by the refund, so it is
                      shown when it applies but never offered as a choice. */}
                  {!(SETTABLE_STATUSES as readonly string[]).includes(order.status) && (
                    <option value={order.status}>{badgeFor(ORDER_STATUS_BADGE, order.status).label}</option>
                  )}
                  {SETTABLE_STATUSES.map((s) => <option key={s} value={s}>{ORDER_STATUS_BADGE[s]?.label ?? s}</option>)}
                </select>
              </label>
              <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontSize: '0.8125rem' }}>
                <input type="checkbox" checked={sendEmailOnChange} onChange={(e) => setSendEmailOnChange(e.target.checked)} />
                Email the customer when this changes
              </label>
              {awaitingManualPayment && (
                <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={confirmPayment}>Payment received</button>
              )}
            </div>
          </section>

          <section className="sox-card">
            <div className="sox-card-head"><h2>Customer</h2></div>
            <div className="sox-card-body">
              <dl className="sox-detail">
                <div className="sox-detail-row">
                  <dt>Name</dt>
                  <dd>
                    {order.customerName}
                    {order.memberId ? <span className="badge badge-default" style={{ marginLeft: '0.375rem' }}>Has an account</span> : <span className="badge badge-default" style={{ marginLeft: '0.375rem' }}>Guest</span>}
                  </dd>
                </div>
                <div className="sox-detail-row">
                  <dt>Email</dt>
                  <dd>
                    <a href={`mailto:${order.customerEmail}`}>{order.customerEmail}</a>{' '}
                    <button type="button" className="sox-copy sox-noprint" onClick={() => copy(order.customerEmail, 'The email address')}>Copy</button>
                  </dd>
                </div>
                {order.customerPhone && (
                  <div className="sox-detail-row">
                    <dt>Phone</dt>
                    <dd><a href={`tel:${order.customerPhone.replace(/\s+/g, '')}`}>{order.customerPhone}</a></dd>
                  </div>
                )}
                <div className="sox-detail-row">
                  <dt>History</dt>
                  <dd>
                    {data.customer.orderCount === 1
                      ? 'Their first order'
                      : `${data.customer.orderCount} orders · ${formatMoney(data.customer.totalSpent, currencySymbol)} spent`}
                    {data.customer.firstOrderAt && data.customer.orderCount > 1 && (
                      <span className="sox-muted"> · since {formatDate(data.customer.firstOrderAt)}</span>
                    )}
                  </dd>
                </div>
              </dl>
              <a
                className="btn btn-secondary btn-sm sox-noprint"
                style={{ marginTop: '0.75rem' }}
                href={`/${adminPath}/m/shop/customers/${encodeURIComponent(order.customerEmail)}`}
              >
                All their orders
              </a>
            </div>
          </section>

          <section className="sox-card">
            <div className="sox-card-head">
              <h2>Delivery address</h2>
              <button type="button" className="sox-copy sox-noprint" onClick={() => copy(addressLines(order.shippingAddress).join('\n'), 'The address')}>Copy</button>
            </div>
            <div className="sox-card-body">
              <address className="sox-address">
                {addressLines(order.shippingAddress).map((line, i) => <span key={i}>{line}<br /></span>)}
              </address>
              {order.shippingAddress.phone && <p className="sox-sub">{order.shippingAddress.phone}</p>}
            </div>
          </section>

          {order.billingAddress && (
            <section className="sox-card">
              <div className="sox-card-head"><h2>Billing address</h2></div>
              <div className="sox-card-body">
                <address className="sox-address">
                  {addressLines(order.billingAddress).map((line, i) => <span key={i}>{line}<br /></span>)}
                </address>
              </div>
            </section>
          )}

          <section className="sox-card">
            <div className="sox-card-head"><h2>Payment</h2></div>
            <div className="sox-card-body">
              <dl className="sox-detail">
                <div className="sox-detail-row">
                  <dt>Method</dt>
                  <dd>{paymentMethodLabel(order.paymentMethod)}</dd>
                </div>
                <div className="sox-detail-row">
                  <dt>State</dt>
                  <dd><span className={`badge ${paymentBadge.cls}`}>{paymentBadge.label}</span></dd>
                </div>
                {order.paidAt && (
                  <div className="sox-detail-row">
                    <dt>Paid</dt>
                    <dd>{formatDateTime(order.paidAt)}</dd>
                  </div>
                )}
                {order.paymentReference && (
                  <div className="sox-detail-row">
                    <dt>Reference</dt>
                    <dd className="sox-mono" style={{ fontSize: '0.8125rem' }}>{order.paymentReference}</dd>
                  </div>
                )}
              </dl>
            </div>
          </section>

          <section className="sox-card">
            <div className="sox-card-head"><h2>Totals</h2></div>
            <div className="sox-card-body">
              <dl className="sox-totals">
                <dt>Subtotal</dt><dd>{formatMoney(order.subtotal, currencySymbol)}</dd>
                {Number(order.discountAmount) > 0 && (
                  <>
                    <dt>Discount{order.couponCode ? ` (${order.couponCode})` : ''}</dt>
                    <dd>-{formatMoney(order.discountAmount, currencySymbol)}</dd>
                  </>
                )}
                <dt>Delivery{order.shippingRateName ? ` (${order.shippingRateName})` : ''}</dt>
                <dd>{formatMoney(order.shippingAmount, currencySymbol)}</dd>
                <dt>Tax{order.taxMode === 'INCLUSIVE' ? ' (included)' : ''}</dt>
                <dd>{formatMoney(order.taxAmount, currencySymbol)}</dd>
                <dt className="sox-total-row">Total</dt>
                <dd className="sox-total-row">{formatMoney(order.total, currencySymbol)}</dd>
                {refundedTotal > 0 && (
                  <>
                    <dt>Refunded</dt><dd>-{formatMoney(refundedTotal, currencySymbol)}</dd>
                    <dt style={{ fontWeight: 600 }}>Kept</dt>
                    <dd style={{ fontWeight: 600 }}>{formatMoney(Number(order.total) - refundedTotal, currencySymbol)}</dd>
                  </>
                )}
              </dl>
            </div>
          </section>
        </div>
      </div>

      {dispatchOpen && dispatch && (
        <DispatchModal
          orderId={orderId}
          lines={dispatch.summary.lines}
          onClose={() => setDispatchOpen(false)}
          onDone={() => { setDispatchOpen(false); refresh() }}
        />
      )}
      {refundOpen && (
        <RefundModal
          orderId={orderId}
          items={data.items}
          paymentMethod={order.paymentMethod}
          onClose={() => setRefundOpen(false)}
          onDone={() => { setRefundOpen(false); refresh() }}
        />
      )}
      {emailOpen && (
        <EmailCustomerModal
          orderId={orderId}
          orderNumber={order.orderNumber}
          customerEmail={order.customerEmail}
          customerName={order.customerName}
          onClose={() => setEmailOpen(false)}
          onDone={() => { setEmailOpen(false); refresh() }}
        />
      )}

      {alertNode}
      {confirmNode}
    </div>
  )
}
