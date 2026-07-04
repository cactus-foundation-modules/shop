'use client'

import { useEffect, useState } from 'react'
import { RefundModal } from '@/modules/shop/components/admin/RefundModal'

type OrderItem = { id: string; productName: string; quantity: number; unitPrice: string; total: string; refundedQty: number; isPreOrder: boolean }
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

const STATUSES = ['PENDING', 'PROCESSING', 'SHIPPED', 'COMPLETED', 'CANCELLED', 'ON_HOLD']

export function OrderDetailScreen({ orderId, children }: { orderId: string; children?: React.ReactNode }) {
  const [data, setData] = useState<OrderDetail | null>(null)
  const [note, setNote] = useState('')
  const [sendEmailOnChange, setSendEmailOnChange] = useState(true)
  const [refundOpen, setRefundOpen] = useState(false)

  function refresh() {
    fetch(`/api/m/shop/admin/orders/${orderId}`).then(async (r) => { if (r.ok) setData(await r.json()) })
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

  return (
    <div style={{ display: 'grid', gap: '1.5rem', maxWidth: 700 }}>
      <div className="page-header"><h1 className="page-title">Order {order.orderNumber}</h1></div>

      <section>
        <label>
          Status
          <select value={order.status} onChange={(e) => setStatus(e.target.value)} style={{ marginLeft: '0.5rem' }}>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
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
            <th style={{ padding: '0.5rem' }}>Item</th><th>Qty</th><th>Total</th><th>Refunded</th>
          </tr>
        </thead>
        <tbody>
          {data.items.map((item) => (
            <tr key={item.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
              <td style={{ padding: '0.5rem' }}>{item.productName}{item.isPreOrder && ' (pre-order)'}</td>
              <td>{item.quantity}</td>
              <td>{item.total}</td>
              <td>{item.refundedQty}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {hasRefundableItems && (
        <button onClick={() => setRefundOpen(true)} style={{ ...buttonSecondary, justifySelf: 'start' }}>Refund items</button>
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
        <dt>Subtotal</dt><dd style={{ margin: 0 }}>{order.subtotal}</dd>
        <dt>Discount</dt><dd style={{ margin: 0 }}>-{order.discountAmount}</dd>
        <dt>Shipping</dt><dd style={{ margin: 0 }}>{order.shippingAmount}</dd>
        <dt>Tax</dt><dd style={{ margin: 0 }}>{order.taxAmount}</dd>
        <dt style={{ fontWeight: 600 }}>Total</dt><dd style={{ margin: 0, fontWeight: 600 }}>{order.total}</dd>
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

const buttonPrimary: React.CSSProperties = { background: 'var(--color-primary)', color: 'var(--color-primary-contrast, #fff)', border: 'none', borderRadius: 8, padding: '0.625rem 1.25rem', fontWeight: 600, cursor: 'pointer', justifySelf: 'start' }
const buttonSecondary: React.CSSProperties = { background: 'var(--color-surface-muted)', border: '1px solid var(--color-border)', borderRadius: 6, padding: '0.5rem 1rem', cursor: 'pointer' }
