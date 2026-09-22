'use client'

import { useState } from 'react'
import {
  EMPTY_PARCEL_DETAILS,
  ParcelDetailsFields,
  parcelDetailsPayload,
  type CourierOption,
  type ParcelDetails,
} from '@/modules/shop/components/admin/ParcelDetailsFields'

type DispatchLine = {
  orderItemId: string
  productName: string
  quantity: number
  refundedQty: number
  dispatchedQty: number
  outstandingQty: number
  /** Units the customer has asked to call off that nobody has decided on yet.
   *  Optional because only the dispatch route's own read carries it. */
  pendingCancelQty?: number
  /** Units the customer has asked to send back, likewise undecided. */
  pendingReturnQty?: number
}

// Per-item dispatch modal, built on the same bones as RefundModal: a quantity
// per line capped at what is still owed, a few optional parcel details, and any
// rejection from the server shown as it came back.
//
// Nothing is validated twice here. The input caps stop the obvious mistakes,
// but the real caps are enforced server-side under an order-wide lock, so a
// refund landing while this modal is open is caught there rather than here.
export function DispatchModal({ orderId, lines, couriers, onClose, onDone }: {
  orderId: string
  lines: DispatchLine[]
  couriers: CourierOption[]
  onClose: () => void
  onDone: () => void
}) {
  const [quantities, setQuantities] = useState<Record<string, number>>(
    Object.fromEntries(lines.map((l) => [l.orderItemId, 0]))
  )
  const [details, setDetails] = useState<ParcelDetails>(EMPTY_PARCEL_DETAILS)
  const [emailCustomer, setEmailCustomer] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selected = lines
    .map((line) => ({ line, quantity: quantities[line.orderItemId] ?? 0 }))
    .filter((x) => x.quantity > 0)
  const totalUnits = selected.reduce((sum, x) => sum + x.quantity, 0)
  const nothingOutstanding = lines.every((l) => l.outstandingQty === 0)
  // Lines still to go out that the customer has asked to call off. The server
  // will not stop this dispatch - an ask is not an approval, and the owner may
  // yet say no - so this is the one place the person packing finds out before
  // the van does rather than after the refund.
  const askedToCancel = lines.some((l) => (l.pendingCancelQty ?? 0) > 0 && l.outstandingQty > 0)
  const askedToReturn = lines.some((l) => (l.pendingReturnQty ?? 0) > 0)

  async function submit() {
    if (selected.length === 0) return
    setSaving(true)
    setError(null)
    const res = await fetch(`/api/m/shop/admin/orders/${orderId}/dispatch`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: selected.map((x) => ({ orderItemId: x.line.orderItemId, quantity: x.quantity })),
        ...parcelDetailsPayload(details),
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
          <button type="button" aria-label="Close" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.25rem', color: 'var(--color-text-secondary)' }}>×</button>
        </div>
        <div style={{ padding: '1.25rem', overflowY: 'auto', display: 'grid', gap: '0.75rem' }}>
          <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
            Record what has actually gone out. You can send the rest later - the order keeps track of what is still owed.
          </p>
          {nothingOutstanding && (
            <p style={{ fontSize: '0.8125rem', background: 'var(--color-bg-subtle)', borderRadius: 6, padding: '0.5rem 0.75rem' }}>
              Everything on this order has either gone out or been refunded, so there is nothing left to dispatch.
            </p>
          )}
          {askedToCancel && (
            <div className="alert alert-warning" style={{ margin: 0, fontSize: '0.8125rem' }}>
              The customer has asked to call off some of what is left on this order, and nobody has decided yet. Check
              the request before sending the lines marked below - if it is approved, anything that has gone out has to
              come back before the money does.
            </div>
          )}
          {!askedToCancel && askedToReturn && (
            <p style={{ fontSize: '0.8125rem', background: 'var(--color-bg-subtle)', borderRadius: 6, padding: '0.5rem 0.75rem' }}>
              The customer has asked to send some of this order back. It is worth a look at their request before more of
              the same goes out.
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
                  <tr key={line.orderItemId} style={{ borderBottom: '1px solid var(--color-border)', color: outstanding === 0 ? 'var(--color-text-secondary)' : undefined }}>
                    <td style={{ padding: '0.375rem' }}>
                      {line.productName}
                      {(line.pendingCancelQty ?? 0) > 0 && outstanding > 0 && (
                        <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--color-warning)' }}>
                          Customer has asked to call off {line.pendingCancelQty}
                        </span>
                      )}
                      {(line.pendingReturnQty ?? 0) > 0 && (
                        <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                          Customer has asked to send back {line.pendingReturnQty}
                        </span>
                      )}
                    </td>
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
          <ParcelDetailsFields couriers={couriers} value={details} onChange={setDetails} />
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

