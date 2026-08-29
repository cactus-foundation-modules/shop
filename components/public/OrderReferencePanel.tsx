'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CUSTOMER_REFERENCE_MAX_LENGTH } from '@/modules/shop/lib/customer-reference'

// The customer's own reference on an order they have already placed - their
// purchase order number, nine times out of ten, raised by their own finance team
// the week after they bought.
//
// Eligibility is decided on the server and handed down as a message, never
// re-derived here: lib/customer-reference.ts is the one copy of those rules, so
// the box that appears and the route that accepts can never disagree.
//
// The heading is the panel's own section title, so nothing here repeats it.

type Props = {
  orderId: string
  /** What this shop calls it - "Purchase order number", "Job reference". Used
   *  for the box's accessible name, since the visible heading is the section's. */
  label: string
  /** What is on the order now, blank where nothing has been given. */
  reference: string
  /** Whether they may change it, and what to say where they may not. No reason
   *  means say nothing - the shop simply does not offer the box. */
  editable: { allowed: boolean; reason?: string }
}

export default function OrderReferencePanel({ orderId, label, reference, editable }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(reference)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/m/shop/member/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerReference: draft.trim() }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? 'That did not go through. Try again in a moment.')
        return
      }
      setOpen(false)
      // The saved value shows on the order, on the invoice and on the paperwork
      // links, so the page is asked for again rather than this one line patched.
      router.refresh()
    } catch {
      setError('That did not go through. Try again in a moment.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
      {!open && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)', alignItems: 'baseline' }}>
          <strong style={{ color: 'var(--color-text)' }}>
            {reference.trim() || <span style={{ color: 'var(--color-text-muted)', fontWeight: 'var(--font-normal)' }}>Not given</span>}
          </strong>
          {editable.allowed && (
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => { setDraft(reference); setError(null); setOpen(true) }}
            >
              {reference.trim() ? 'Change it' : 'Add it'}
            </button>
          )}
        </div>
      )}

      {open && (
        <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
          <input
            type="text"
            aria-label={label}
            value={draft}
            maxLength={CUSTOMER_REFERENCE_MAX_LENGTH}
            onChange={(e) => setDraft(e.target.value)}
            disabled={busy}
            style={{ maxWidth: 320 }}
          />
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <button type="button" className="btn btn-primary btn-sm" onClick={save} disabled={busy}>
              {busy ? 'Saving…' : 'Save'}
            </button>
            <button type="button" className="btn btn-sm" onClick={() => { setOpen(false); setError(null) }} disabled={busy}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Why they cannot change it, where there is a reason worth giving - an
          invoice already sent with a number on it, most often. */}
      {!editable.allowed && editable.reason && (
        <p style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>{editable.reason}</p>
      )}

      {editable.allowed && !open && (
        <p style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>
          Your own number for this order. It goes on your invoice, so your accounts department can match the two up.
        </p>
      )}

      {error && <p style={{ margin: 0, color: 'var(--color-error)', fontSize: 'var(--text-sm)' }}>{error}</p>}
    </div>
  )
}
