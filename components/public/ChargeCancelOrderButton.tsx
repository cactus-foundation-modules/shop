'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

// The other way out of an extra charge: cancel the order, and be refunded what
// was paid less the charge. Money moves the moment it is confirmed, so it asks
// twice, in words that say exactly what will happen - the refund figure is the
// server's own (lib/order-charges.ts), and the route works it out again rather
// than trusting this one.

export function ChargeCancelOrderButton({
  orderId, chargeId, refund, charge,
}: {
  orderId: string
  chargeId: string
  /** What would come back, already formatted. */
  refund: string
  /** The charge being kept, already formatted. */
  charge: string
}) {
  const router = useRouter()
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function cancel() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/m/shop/member/orders/${encodeURIComponent(orderId)}/charges/${encodeURIComponent(chargeId)}/cancel-order`,
        { method: 'POST' },
      )
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? 'That did not go through. Try again in a moment.')
        return
      }
      router.refresh()
    } catch {
      setError('That did not go through. Try again in a moment.')
    } finally {
      setBusy(false)
    }
  }

  if (!asking) {
    return (
      <div>
        <button type="button" className="btn btn-sm" onClick={() => setAsking(true)}>
          Cancel my order instead
        </button>
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gap: '0.5rem' }}>
      <p style={{ margin: 0 }}>
        <strong>Cancel the whole order?</strong> We will refund {refund} straight away - what you paid, less the{' '}
        {charge}. This cannot be undone.
      </p>
      {error && <p style={{ margin: 0, color: 'var(--color-danger)' }}>{error}</p>}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
        <button type="button" className="btn btn-sm btn-danger" onClick={() => { void cancel() }} disabled={busy}>
          {busy ? 'Cancelling…' : `Yes, cancel and refund ${refund}`}
        </button>
        <button type="button" className="btn btn-sm" onClick={() => setAsking(false)} disabled={busy}>
          Keep my order
        </button>
      </div>
    </div>
  )
}
