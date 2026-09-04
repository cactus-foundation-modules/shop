'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { ShpOrderRequestType } from '@/modules/shop/lib/types'

// The customer's side of a cancel or return: which of the two they may ask for,
// why, and (for a return) how much of what.
//
// Eligibility is decided on the server and handed down as a message, never
// re-derived here - lib/order-requests.ts is the one copy of those rules, so a
// button that appears and an endpoint that accepts can never disagree.

export type RequestLine = {
  orderItemId: string
  productName: string
  returnableQty: number
}

type Props = {
  orderId: string
  cancel: { allowed: boolean; reason?: string }
  return: { allowed: boolean; reason?: string }
  cancelReasons: ReadonlyArray<{ code: string; label: string }>
  returnReasons: ReadonlyArray<{ code: string; label: string }>
  lines: RequestLine[]
  returnBy: string | null
}

export default function OrderRequestPanel(props: Props) {
  const router = useRouter()
  const [open, setOpen] = useState<ShpOrderRequestType | null>(null)
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const returnable = props.lines.filter((line) => line.returnableQty > 0)
  const reasons = open === 'CANCEL' ? props.cancelReasons : props.returnReasons

  function start(type: ShpOrderRequestType) {
    setOpen(type)
    setReason('')
    setNote('')
    setError(null)
    // Everything still returnable, pre-ticked: sending back the lot is the
    // common case, and un-ticking is less work than ticking.
    setQuantities(Object.fromEntries(returnable.map((line) => [line.orderItemId, line.returnableQty])))
  }

  async function submit() {
    if (!open) return
    if (!reason) {
      setError('Pick a reason so we know what happened.')
      return
    }
    const items = Object.entries(quantities)
      .filter(([, quantity]) => quantity > 0)
      .map(([orderItemId, quantity]) => ({ orderItemId, quantity }))
    if (open === 'RETURN' && items.length === 0) {
      setError('Choose at least one item to send back.')
      return
    }

    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/m/shop/member/orders/${props.orderId}/requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: open, reason, customerNote: note || null, items: open === 'RETURN' ? items : [] }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error ?? 'That did not go through. Try again in a moment.')
        return
      }
      setOpen(null)
      router.refresh()
    } catch {
      setError('That did not go through. Try again in a moment.')
    } finally {
      setBusy(false)
    }
  }

  if (open) {
    return (
      <section className="sod-card">
        <div className="sod-card-head">
          <h2 className="sod-card-title">
            {open === 'CANCEL' ? 'Cancel this order' : 'Send something back'}
          </h2>
        </div>
        <div className="sod-card-body">

        {open === 'RETURN' && (
          <div style={{ display: 'grid', gap: '0.5rem' }}>
            <span style={{ fontWeight: 'var(--font-medium)' }}>What are you sending back?</span>
            {returnable.map((line) => (
              <label key={line.orderItemId} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <input
                  type="number"
                  min={0}
                  max={line.returnableQty}
                  value={quantities[line.orderItemId] ?? 0}
                  onChange={(e) =>
                    setQuantities((current) => ({
                      ...current,
                      [line.orderItemId]: Math.max(0, Math.min(line.returnableQty, Number(e.target.value) || 0)),
                    }))
                  }
                  style={{ width: '4.5rem' }}
                  aria-label={`Quantity of ${line.productName} to return`}
                />
                <span>
                  {line.productName}{' '}
                  <span style={{ color: 'var(--color-text-muted)' }}>(up to {line.returnableQty})</span>
                </span>
              </label>
            ))}
          </div>
        )}

        <label style={{ display: 'grid', gap: '0.25rem' }}>
          <span style={{ fontWeight: 'var(--font-medium)' }}>Why?</span>
          <select value={reason} onChange={(e) => setReason(e.target.value)}>
            <option value="">Choose a reason…</option>
            {reasons.map((option) => (
              <option key={option.code} value={option.code}>{option.label}</option>
            ))}
          </select>
        </label>

        <label style={{ display: 'grid', gap: '0.25rem' }}>
          <span style={{ fontWeight: 'var(--font-medium)' }}>Anything else we should know? (optional)</span>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={2000} />
        </label>

        {error && <p style={{ color: 'var(--color-error)', margin: 0 }}>{error}</p>}

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button type="button" className="btn btn-primary" onClick={submit} disabled={busy}>
            {busy ? 'Sending…' : 'Send request'}
          </button>
          <button type="button" className="btn" onClick={() => setOpen(null)} disabled={busy}>
            Never mind
          </button>
        </div>
        </div>
      </section>
    )
  }

  return (
    <section className="sod-card">
      <div className="sod-card-head">
        <h2 className="sod-card-title">Something not right?</h2>
      </div>
      <div className="sod-card-body">

      {props.cancel.allowed ? (
        <div>
          <button type="button" className="btn" onClick={() => start('CANCEL')}>Cancel this order</button>
        </div>
      ) : (
        props.cancel.reason && (
          <p style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>{props.cancel.reason}</p>
        )
      )}

      {props.return.allowed && returnable.length > 0 ? (
        <div>
          <button type="button" className="btn" onClick={() => start('RETURN')}>Return something</button>
          {props.returnBy && (
            <p style={{ margin: '0.375rem 0 0', color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>
              Returns for this order are open until {props.returnBy}.
            </p>
          )}
        </div>
      ) : (
        props.return.reason && (
          <p style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>{props.return.reason}</p>
        )
      )}
      </div>
    </section>
  )
}
