'use client'

import { useState, type CSSProperties } from 'react'

// Reporting a delivery that is not going to happen when the customer was told,
// and later giving it its new day. See lib/delivery-delay.ts for the kinds and
// app/api/admin/orders/[id]/dispatch/delay/route.ts for what each one does.
//
// Two modes, picked by the parcel:
//
//   report    no delay open. Running late today, delayed with the new day to
//             follow, or delayed to a day already known.
//   new-date  a delay is open, waiting on a new day. Give it - or, for one that
//             was running late today, say it will not make it after all.

type Kind = 'today' | 'rebooking' | 'new-date'

export type DelayableParcel = {
  id: string
  /** The delay as it stands today, from the dispatch GET. */
  delayOpen?: 'today' | 'rebooking' | null
  quietCustomerEmails?: boolean
}

export function DeliveryDelayModal({ orderId, parcel, onClose, onDone }: {
  orderId: string
  parcel: DelayableParcel
  onClose: () => void
  onDone: () => void
}) {
  const open = parcel.delayOpen ?? null
  const [kind, setKind] = useState<Kind>(open === 'rebooking' ? 'new-date' : open === 'today' ? 'rebooking' : 'today')
  const [date, setDate] = useState('')
  const [slotStart, setSlotStart] = useState('')
  const [slotEnd, setSlotEnd] = useState('')
  const [note, setNote] = useState('')
  const [emailCustomer, setEmailCustomer] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const quiet = Boolean(parcel.quietCustomerEmails)
  // Giving the day an open delay promised is its own message ('Delayed
  // delivery: new date'), not a second "your delivery is delayed".
  const givingPromisedDay = open !== null && kind === 'new-date'
  const needsDate = kind === 'new-date'

  async function save() {
    setSaving(true)
    setError(null)
    const res = await fetch(`/api/m/shop/admin/orders/${orderId}/dispatch/delay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shipmentId: parcel.id,
        kind: givingPromisedDay ? 'rebooked' : kind,
        deliveryDate: needsDate ? date || null : null,
        deliverySlotStart: needsDate ? slotStart || null : null,
        deliverySlotEnd: needsDate ? slotEnd || null : null,
        note: givingPromisedDay ? null : note.trim() || null,
        emailCustomer: !quiet && emailCustomer,
      }),
    })
    setSaving(false)
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? 'Could not record the delay')
      return
    }
    onDone()
  }

  const choices: Array<{ value: Kind; label: string; hint: string }> = open === 'rebooking'
    ? []
    : [
        ...(open === null
          ? [{
              value: 'today' as const,
              label: 'Running late today',
              hint: 'Still trying to get there today. The customer is told that if it cannot be today, you will be in touch with a new date.',
            }]
          : []),
        {
          value: 'rebooking',
          label: open === 'today' ? 'Not going to make it today' : 'Delayed - new date not known yet',
          hint: 'The booked day is cleared and the customer is told a new date will follow. Give it here once you have it, and they are emailed again.',
        },
        {
          value: 'new-date',
          label: 'Delayed - new date known',
          hint: 'The customer is told the delivery has moved, and to which day.',
        },
      ]

  const emailLabel = givingPromisedDay
    ? 'Email the customer their new delivery date'
    : kind === 'today'
      ? 'Email the customer that it is running late'
      : 'Email the customer about the delay'

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'var(--color-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div style={{ background: 'var(--color-surface)', borderRadius: 8, width: '90vw', maxWidth: 560, maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0,0,0,.25)' }}>
        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>
            {open === 'rebooking' ? 'New delivery date' : 'Report a delay'}
          </h3>
          <button type="button" aria-label="Close" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.25rem', color: 'var(--color-text-secondary)' }}>×</button>
        </div>

        <div style={{ padding: '1.25rem', overflowY: 'auto', display: 'grid', gap: '0.75rem' }}>
          {error && <p style={{ color: 'var(--color-danger)', fontSize: '0.875rem' }}>{error}</p>}

          {open === 'rebooking' && (
            <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
              The customer has been told this delivery is delayed and a new date will follow.
            </p>
          )}

          {choices.length > 0 && (
            <div style={{ display: 'grid', gap: '0.5rem' }} role="radiogroup" aria-label="What has happened">
              {choices.map((c) => (
                <label key={c.value} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                  <input type="radio" name="delay-kind" checked={kind === c.value} onChange={() => setKind(c.value)} style={{ marginTop: '0.2rem' }} />
                  <span>
                    {c.label}
                    <span style={hintStyle}>{c.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          )}

          {needsDate && (
            <>
              <label>New delivery date
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={fieldStyle} />
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <label>Window starts (optional)
                  <input type="time" value={slotStart} onChange={(e) => setSlotStart(e.target.value)} style={fieldStyle} />
                </label>
                <label>Window ends (optional)
                  <input type="time" value={slotEnd} onChange={(e) => setSlotEnd(e.target.value)} style={fieldStyle} />
                </label>
              </div>
              <span style={hintStyle}>
                Without a window, the customer is told the time will follow, and the usual
                delivery-time email goes once you add one.
              </span>
            </>
          )}

          {!givingPromisedDay && (
            <label>Note for the customer (optional)
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                maxLength={500}
                placeholder="The van has been held up by a breakdown on the M25."
                style={{ ...fieldStyle, resize: 'vertical' }}
              />
              <span style={hintStyle}>Shown in the email and on their order page.</span>
            </label>
          )}

          {quiet ? (
            <p style={{ fontSize: '0.8125rem', background: 'var(--color-bg-subtle)', borderRadius: 6, padding: '0.5rem 0.75rem' }}>
              This parcel was recorded without telling the customer, so they will not be emailed.
              Their order page still shows the delay.
            </p>
          ) : (
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input type="checkbox" checked={emailCustomer} onChange={(e) => setEmailCustomer(e.target.checked)} />
              {emailLabel}
            </label>
          )}
        </div>

        <div style={{ padding: '0.75rem 1.25rem', borderTop: '1px solid var(--color-border)', display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" disabled={saving || (needsDate && !date)} onClick={save}>
            {saving ? 'Saving…' : givingPromisedDay ? 'Save new date' : 'Report delay'}
          </button>
        </div>
      </div>
    </div>
  )
}

const fieldStyle: CSSProperties = {
  width: '100%', padding: '0.5rem', borderRadius: 6, border: '1px solid var(--color-border)',
  marginTop: '0.25rem', background: 'var(--color-surface)', color: 'var(--color-text)',
}

const hintStyle: CSSProperties = {
  display: 'block', marginTop: '0.25rem', fontSize: '0.75rem', color: 'var(--color-text-secondary)',
}
