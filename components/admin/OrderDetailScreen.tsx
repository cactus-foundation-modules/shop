'use client'

import { useEffect, useState } from 'react'
import { RefundModal } from '@/modules/shop/components/admin/RefundModal'
import { DispatchModal } from '@/modules/shop/components/admin/DispatchModal'
import { formatMoney } from '@/modules/shop/lib/money'
import { useCurrencySymbol } from '@/modules/shop/components/admin/use-currency-symbol'

type LineMetaField = { label: string; value: string; href?: string }
type OrderItem = { id: string; productName: string; quantity: number; unitPrice: string; total: string; refundedQty: number; isPreOrder: boolean; lineMeta?: { fields: LineMetaField[] } | null }
type OrderDetail = {
  order: {
    id: string; orderNumber: string; status: string; paymentStatus: string; paymentMethod: string
    customerName: string; customerEmail: string; subtotal: string; discountAmount: string; shippingAmount: string; taxAmount: string; total: string
    shippingAddress: { line1: string; line2?: string; city: string; postcode: string; country: string }
  }
  items: OrderItem[]
  notes: Array<{ id: string; content: string; isInternal: boolean; createdAt: string }>
  emails: Array<{ id: string; subject: string; to: string; sentAt: string; trigger: string }>
  downloads: Array<{ id: string; token: string }>
}

// Dispatch progress is worked out from the shipment lines every time it is
// asked for - there is no dispatched status on the order, and the status list
// below is fixed - so it arrives on its own call alongside the order.
type DispatchLine = { orderItemId: string; productName: string; quantity: number; refundedQty: number; dispatchedQty: number; outstandingQty: number }
type ShipmentDetail = { id: string; shippedAt: string; trackingNumber: string | null; carrier: string | null; notes: string | null; items: Array<{ id: string; orderItemId: string; quantity: number }> }
type DispatchDetail = {
  summary: { lines: DispatchLine[]; fullyDispatched: boolean; partiallyDispatched: boolean }
  shipments: ShipmentDetail[]
  // Surfaced only. The shop's hold-everything policy is enforced when the
  // status is changed, not here.
  preOrderHold: { active: boolean; outstandingCount: number; expectedDate: string | null }
}

const STATUSES = ['PENDING', 'PROCESSING', 'SHIPPED', 'COMPLETED', 'CANCELLED', 'ON_HOLD']

export function OrderDetailScreen({ orderId, children }: { orderId: string; children?: React.ReactNode }) {
  const currencySymbol = useCurrencySymbol()
  const [data, setData] = useState<OrderDetail | null>(null)
  const [dispatch, setDispatch] = useState<DispatchDetail | null>(null)
  const [note, setNote] = useState('')
  const [sendEmailOnChange, setSendEmailOnChange] = useState(true)
  const [refundOpen, setRefundOpen] = useState(false)
  const [dispatchOpen, setDispatchOpen] = useState(false)

  function refresh() {
    fetch(`/api/m/shop/admin/orders/${orderId}`).then(async (r) => { if (r.ok) setData(await r.json()) })
    fetch(`/api/m/shop/admin/orders/${orderId}/dispatch`).then(async (r) => { if (r.ok) setDispatch(await r.json()) })
  }
  useEffect(refresh, [orderId])

  if (!data) return null

  async function setStatus(status: string) {
    await fetch(`/api/m/shop/admin/orders/${orderId}/status`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status, sendEmail: sendEmailOnChange }) })
    refresh()
  }

  async function addNote() {
    if (!note) return
    await fetch(`/api/m/shop/admin/orders/${orderId}/notes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: note }) })
    setNote('')
    refresh()
  }

  async function confirmPayment() {
    await fetch(`/api/m/shop/admin/orders/${orderId}/confirm-payment`, { method: 'POST' })
    refresh()
  }

  const { order } = data
  const hasRefundableItems = data.items.some((i) => i.refundedQty < i.quantity)

  const dispatchByItem = new Map((dispatch?.summary.lines ?? []).map((l) => [l.orderItemId, l]))
  const hasOutstandingItems = (dispatch?.summary.lines ?? []).some((l) => l.outstandingQty > 0)
  const dispatchMarker = dispatch?.summary.fullyDispatched
    ? 'All dispatched'
    : dispatch?.summary.partiallyDispatched
      ? 'Partly dispatched'
      : null
  const itemNames = new Map(data.items.map((i) => [i.id, i.productName]))
  const hold = dispatch?.preOrderHold

  return (
    <div style={{ display: 'grid', gap: '1.5rem', maxWidth: 700 }}>
      <div className="page-header"><h1 className="page-title">Order {order.orderNumber}</h1></div>

      {hold?.active && (
        <p style={holdBanner}>
          Your shop is set to hold the whole order until every item is in stock.{' '}
          {hold.outstandingCount === 1 ? '1 item is' : `${hold.outstandingCount} items are`} still on pre-order
          {hold.expectedDate
            ? `, ${hold.outstandingCount === 1 ? 'expected' : 'the last of them expected'} on ${new Date(hold.expectedDate).toLocaleDateString('en-GB')}`
            : ', with no expected date yet'}
          , so this order is not due to go out yet.
        </p>
      )}

      <section>
        <label>
          Status
          <select value={order.status} onChange={(e) => setStatus(e.target.value)} style={{ marginLeft: '0.5rem' }}>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        {/* Worked out from what has actually gone out, not a status of its own. */}
        {dispatchMarker && <span style={dispatchPill}>{dispatchMarker}</span>}
        <label style={{ marginLeft: '1rem' }}>
          <input type="checkbox" checked={sendEmailOnChange} onChange={(e) => setSendEmailOnChange(e.target.checked)} /> Email customer on change
        </label>
      </section>

      {(order.paymentMethod === 'BANK_TRANSFER' || order.paymentMethod === 'CASH') && order.paymentStatus === 'AWAITING_CONFIRMATION' && (
        <button onClick={confirmPayment} style={buttonPrimary}>Confirm payment received</button>
      )}

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--color-border)' }}>
            <th style={{ padding: '0.5rem' }}>Item</th><th>Qty</th><th>Total</th><th>Refunded</th><th>Dispatched</th>
          </tr>
        </thead>
        <tbody>
          {data.items.map((item) => (
            <tr key={item.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
              <td style={{ padding: '0.5rem' }}>
                {item.productName}{item.isPreOrder && ' (pre-order)'}
                {item.lineMeta?.fields?.length ? (
                  <ul style={{ listStyle: 'none', margin: '0.25rem 0 0', padding: 0, display: 'grid', gap: '0.125rem' }}>
                    {item.lineMeta.fields.map((f, i) => (
                      <li key={i} style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
                        <span style={{ fontWeight: 500 }}>{f.label}:</span>{' '}
                        {f.href ? <a href={f.href} target="_blank" rel="noopener noreferrer">{f.value}</a> : f.value}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </td>
              <td>{item.quantity}</td>
              <td>{formatMoney(item.total, currencySymbol)}</td>
              <td>{item.refundedQty}</td>
              <td>{dispatchByItem.get(item.id)?.dispatchedQty ?? 0}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {(hasRefundableItems || hasOutstandingItems) && (
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {hasRefundableItems && (
            <button onClick={() => setRefundOpen(true)} style={buttonSecondary}>Refund items</button>
          )}
          {hasOutstandingItems && (
            <button onClick={() => setDispatchOpen(true)} style={buttonSecondary}>Dispatch items</button>
          )}
        </div>
      )}
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

      <dl style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '0.25rem 1rem' }}>
        <dt>Subtotal</dt><dd style={{ margin: 0 }}>{formatMoney(order.subtotal, currencySymbol)}</dd>
        <dt>Discount</dt><dd style={{ margin: 0 }}>-{formatMoney(order.discountAmount, currencySymbol)}</dd>
        <dt>Shipping</dt><dd style={{ margin: 0 }}>{formatMoney(order.shippingAmount, currencySymbol)}</dd>
        <dt>Tax</dt><dd style={{ margin: 0 }}>{formatMoney(order.taxAmount, currencySymbol)}</dd>
        <dt style={{ fontWeight: 600 }}>Total</dt><dd style={{ margin: 0, fontWeight: 600 }}>{formatMoney(order.total, currencySymbol)}</dd>
      </dl>

      <section>
        <h3 style={{ fontSize: '0.9375rem' }}>Shipping address</h3>
        <p>{order.shippingAddress.line1}{order.shippingAddress.line2 ? `, ${order.shippingAddress.line2}` : ''}, {order.shippingAddress.city}, {order.shippingAddress.postcode}, {order.shippingAddress.country}</p>
      </section>

      {data.downloads.length > 0 && (
        <section>
          <h3 style={{ fontSize: '0.9375rem' }}>Digital downloads</h3>
          {data.downloads.map((d) => <div key={d.id}>{d.token}</div>)}
        </section>
      )}

      {dispatch && dispatch.shipments.length > 0 && (
        <section>
          <h3 style={{ fontSize: '0.9375rem' }}>Dispatches</h3>
          {dispatch.shipments.map((shipment) => (
            <p key={shipment.id} style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
              {new Date(shipment.shippedAt).toLocaleDateString('en-GB')}
              {shipment.carrier ? ` · ${shipment.carrier}` : ''}
              {shipment.trackingNumber ? ` · ${shipment.trackingNumber}` : ''}
              {': '}
              {shipment.items.map((si) => `${si.quantity} × ${itemNames.get(si.orderItemId) ?? 'item no longer on this order'}`).join(', ')}
              {shipment.notes ? ` - ${shipment.notes}` : ''}
            </p>
          ))}
        </section>
      )}

      <section>
        <h3 style={{ fontSize: '0.9375rem' }}>Notes</h3>
        {data.notes.map((n) => <p key={n.id} style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>{n.content}</p>)}
        <textarea value={note} onChange={(e) => setNote(e.target.value)} style={{ width: '100%', padding: '0.5rem', borderRadius: 6, border: '1px solid var(--color-border)' }} />
        <button onClick={addNote} style={{ ...buttonSecondary, marginTop: '0.5rem' }}>Add note</button>
      </section>

      <section>
        <h3 style={{ fontSize: '0.9375rem' }}>Email log</h3>
        {data.emails.map((e) => <p key={e.id} style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>{e.trigger}: {e.subject} → {e.to}</p>)}
      </section>

      {children}
    </div>
  )
}

const buttonPrimary: React.CSSProperties = { background: 'var(--color-primary)', color: 'var(--color-on-primary)', border: 'none', borderRadius: 8, padding: '0.625rem 1.25rem', fontWeight: 600, cursor: 'pointer', justifySelf: 'start' }
const buttonSecondary: React.CSSProperties = { background: 'var(--color-bg-subtle)', border: '1px solid var(--color-border)', borderRadius: 6, padding: '0.5rem 1rem', cursor: 'pointer' }
// Deliberately neutral: the hold is the shop's own policy working as intended,
// not a fault, so it reads as information rather than a warning.
const holdBanner: React.CSSProperties = { margin: 0, background: 'var(--color-bg-subtle)', border: '1px solid var(--color-border)', borderRadius: 6, padding: '0.75rem 1rem', fontSize: '0.875rem', color: 'var(--color-text)' }
const dispatchPill: React.CSSProperties = { marginLeft: '0.75rem', background: 'var(--color-bg-subtle)', border: '1px solid var(--color-border)', borderRadius: 999, padding: '0.125rem 0.625rem', fontSize: '0.8125rem', color: 'var(--color-text-muted)' }
