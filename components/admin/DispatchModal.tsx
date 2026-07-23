'use client'

import { useState } from 'react'

type DispatchLine = {
  orderItemId: string
  productName: string
  quantity: number
  refundedQty: number
  dispatchedQty: number
  outstandingQty: number
}

// Per-item dispatch modal, built on the same bones as RefundModal: a quantity
// per line capped at what is still owed, a few optional parcel details, and any
// rejection from the server shown as it came back.
//
// Nothing is validated twice here. The input caps stop the obvious mistakes,
// but the real caps are enforced server-side under an order-wide lock, so a
// refund landing while this modal is open is caught there rather than here.
export function DispatchModal({ orderId, lines, onClose, onDone }: {
  orderId: string
  lines: DispatchLine[]
  onClose: () => void
  onDone: () => void
}) {
  const [quantities, setQuantities] = useState<Record<string, number>>(
    Object.fromEntries(lines.map((l) => [l.orderItemId, 0]))
  )
  const [trackingNumber, setTrackingNumber] = useState('')
  const [carrier, setCarrier] = useState('')
  const [notes, setNotes] = useState('')
  const [emailCustomer, setEmailCustomer] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selected = lines
    .map((line) => ({ line, quantity: quantities[line.orderItemId] ?? 0 }))
    .filter((x) => x.quantity > 0)
  const totalUnits = selected.reduce((sum, x) => sum + x.quantity, 0)
  const nothingOutstanding = lines.every((l) => l.outstandingQty === 0)

  async function submit() {
    if (selected.length === 0) return
    setSaving(true)
    setError(null)
    const res = await fetch(`/api/m/shop/admin/orders/${orderId}/dispatch`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: selected.map((x) => ({ orderItemId: x.line.orderItemId, quantity: x.quantity })),
        trackingNumber: trackingNumber.trim() || null,
        carrier: carrier.trim() || null,
        notes: notes.trim() || null,
        emailCustomer,
      }),
    })
    setSaving(false)
    if (!res.ok) { setError((await res.json()).error ?? 'Could not record this dispatch'); return }
    onDone()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'var(--color-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{ background: 'var(--color-surface)', borderRadius: 8, width: '90vw', maxWidth: 560, maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0,0,0,.25)' }}>
        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>Dispatch items</h3>
          <button type="button" aria-label="Close" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.25rem', color: 'var(--color-text-muted)' }}>×</button>
        </div>
        <div style={{ padding: '1.25rem', overflowY: 'auto', display: 'grid', gap: '0.75rem' }}>
          <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
            Record what has actually gone out. You can send the rest later - the order keeps track of what is still owed.
          </p>
          {nothingOutstanding && (
            <p style={{ fontSize: '0.8125rem', background: 'var(--color-bg-subtle)', borderRadius: 6, padding: '0.5rem 0.75rem' }}>
              Everything on this order has either gone out or been refunded, so there is nothing left to dispatch.
            </p>
          )}
          {error && <p style={{ color: 'var(--color-danger)', fontSize: '0.875rem' }}>{error}</p>}
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--color-border)' }}>
                <th style={{ padding: '0.375rem' }}>Item</th><th>Bought</th><th>Dispatched</th><th>Refunded</th><th>Dispatch now</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => {
                const outstanding = line.outstandingQty
                return (
                  <tr key={line.orderItemId} style={{ borderBottom: '1px solid var(--color-border)', color: outstanding === 0 ? 'var(--color-text-muted)' : undefined }}>
                    <td style={{ padding: '0.375rem' }}>{line.productName}</td>
                    <td>{line.quantity}</td>
                    <td>{line.dispatchedQty}</td>
                    <td>{line.refundedQty}</td>
                    <td>
                      {outstanding === 0 ? (
                        <span style={{ fontSize: '0.8125rem' }}>Nothing left</span>
                      ) : (
                        <input
                          type="number" min={0} max={outstanding} value={quantities[line.orderItemId] ?? 0}
                          aria-label={`Quantity of ${line.productName} to dispatch now`}
                          onChange={(e) => setQuantities((prev) => ({ ...prev, [line.orderItemId]: Math.max(0, Math.min(outstanding, Number(e.target.value))) }))}
                          style={{ width: 60, padding: '0.25rem 0.5rem', borderRadius: 6, border: '1px solid var(--color-border)' }}
                        />
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <label>Tracking number (optional)
            <input value={trackingNumber} onChange={(e) => setTrackingNumber(e.target.value)} style={fieldStyle} />
          </label>
          <label>Carrier (optional)
            <input value={carrier} onChange={(e) => setCarrier(e.target.value)} placeholder="Royal Mail, DPD, Evri…" style={fieldStyle} />
          </label>
          <label>Notes (optional)
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} style={fieldStyle} />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <input type="checkbox" checked={emailCustomer} onChange={(e) => setEmailCustomer(e.target.checked)} />
            Email the customer to say this part of their order is on its way
          </label>
          <p style={{ fontWeight: 600 }}>
            {totalUnits === 0 ? 'Nothing selected yet' : `Dispatching ${totalUnits} ${totalUnits === 1 ? 'item' : 'items'}`}
          </p>
        </div>
        <div style={{ padding: '0.75rem 1.25rem', borderTop: '1px solid var(--color-border)', display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" disabled={saving || selected.length === 0} onClick={submit}>{saving ? 'Recording…' : 'Mark as dispatched'}</button>
        </div>
      </div>
    </div>
  )
}

const fieldStyle: React.CSSProperties = { width: '100%', padding: '0.5rem', borderRadius: 6, border: '1px solid var(--color-border)', marginTop: '0.25rem', background: 'var(--color-surface)', color: 'var(--color-text)' }
