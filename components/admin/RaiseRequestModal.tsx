'use client'

import { useState } from 'react'
import {
  SHP_CANCEL_REASONS,
  SHP_DAMAGE_REASONS,
  SHP_ISSUE_KINDS,
  SHP_RETURN_REASONS,
  type ShpIssueKind,
} from '@/modules/shop/lib/order-requests'
import type { ShpMissingKind, ShpOrderRequestType } from '@/modules/shop/lib/types'

// Staff raising a request on the customer's behalf - after a phone call, an
// email, a word at the door. The same three things the customer can raise from
// their order page, asked the same way, so a request reads the same in the queue
// whoever typed it. The server checks the lines exactly as it checks the
// customer's; the numbers offered here are only where the boxes stop.

export type RaiseRequestLine = {
  orderItemId: string
  productName: string
  quantity: number
  refundedQty: number
  dispatchedQty: number
  outstandingQty: number
}

const TYPES: Array<{ type: ShpOrderRequestType; label: string }> = [
  { type: 'DAMAGE', label: 'Issue report' },
  { type: 'CANCEL', label: 'Cancellation' },
  { type: 'RETURN', label: 'Return' },
]

const field: React.CSSProperties = { padding: '0.375rem 0.5rem', borderRadius: 6, border: '1px solid var(--color-border)' }
const small: React.CSSProperties = { display: 'grid', gap: '0.25rem', fontSize: '0.8125rem' }
const hint: React.CSSProperties = { margin: 0, fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }

/** How many of a line this kind of request may name. Cancelling stops what has
 *  not gone; returning and reporting are about what has arrived. */
function maxFor(type: ShpOrderRequestType, line: RaiseRequestLine): number {
  if (type === 'CANCEL') return Math.max(line.outstandingQty, 0)
  if (type === 'RETURN') return Math.max(Math.min(line.dispatchedQty, line.quantity - line.refundedQty), 0)
  return Math.max(line.dispatchedQty, 0)
}

export function RaiseRequestModal({ orderId, orderNumber, lines, onClose, onDone }: {
  orderId: string
  orderNumber: string
  /** Null while the order's dispatch position is still loading. */
  lines: RaiseRequestLine[] | null
  onClose: () => void
  onDone: (message: string) => void
}) {
  const [type, setType] = useState<ShpOrderRequestType>('DAMAGE')
  const [kind, setKind] = useState<ShpIssueKind>('DAMAGE')
  const [reason, setReason] = useState('')
  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const [missing, setMissing] = useState<Record<string, ShpMissingKind>>({})
  const [note, setNote] = useState('')
  const [notifyCustomer, setNotifyCustomer] = useState(false)
  const [requestPhotos, setRequestPhotos] = useState(false)
  const [photoNote, setPhotoNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const issue = SHP_ISSUE_KINDS.find((one) => one.kind === kind)!
  const reasons = type === 'CANCEL'
    ? SHP_CANCEL_REASONS
    : type === 'RETURN'
      ? SHP_RETURN_REASONS
      : SHP_DAMAGE_REASONS.filter((option) => issue.reasons.includes(option.code))
  // A kind with a single code files under it without asking.
  const effectiveReason = type === 'DAMAGE' && reasons.length === 1 ? reasons[0]!.code : reason
  const offered = (lines ?? []).filter((line) => maxFor(type, line) > 0)

  function reset(nextType: ShpOrderRequestType, nextKind: ShpIssueKind) {
    setType(nextType)
    setKind(nextKind)
    setReason('')
    setQuantities({})
    setMissing({})
    setError(null)
  }

  async function submit() {
    const items = Object.entries(quantities)
      .filter(([, quantity]) => quantity > 0)
      .map(([orderItemId, quantity]) => ({
        orderItemId,
        quantity,
        ...(type === 'DAMAGE' && kind === 'MISSING' ? { missing: missing[orderItemId] ?? null } : {}),
      }))
    if (!effectiveReason) { setError('Pick a reason.'); return }
    if (type !== 'CANCEL' && items.length === 0) { setError('Pick at least one item.'); return }

    setSaving(true)
    setError(null)
    const res = await fetch(`/api/m/shop/admin/orders/${orderId}/requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type,
        reason: effectiveReason,
        customerNote: note.trim() || null,
        items,
        notifyCustomer,
        requestPhotos: type === 'DAMAGE' && requestPhotos,
        photoRequestNote: type === 'DAMAGE' && requestPhotos ? photoNote.trim() || null : null,
      }),
    }).catch(() => null)
    setSaving(false)
    if (!res || !res.ok) {
      const body = (await res?.json().catch(() => ({})) ?? {}) as { error?: string }
      setError(body.error ?? 'That did not go through. Nothing has been raised.')
      return
    }
    const word = type === 'DAMAGE' ? 'Issue report' : type === 'CANCEL' ? 'Cancellation' : 'Return'
    onDone(`${word} raised on the customer's behalf${notifyCustomer ? ' and emailed to them' : ''}. It is in the requests queue.`)
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'var(--color-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div style={{ background: 'var(--color-surface)', borderRadius: 8, width: '90vw', maxWidth: 640, maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: 'var(--shadow-lg)' }}>
        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>Raise a request for {orderNumber}</h3>
          <button type="button" aria-label="Close" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.25rem', color: 'var(--color-text-secondary)' }}>×</button>
        </div>

        <div style={{ padding: '1.25rem', overflowY: 'auto', display: 'grid', gap: '0.875rem' }}>
          <p style={hint}>
            On the customer&apos;s behalf - after a call or an email. It lands in the requests queue like one they raised
            themselves, marked as raised by staff.
          </p>

          <div role="radiogroup" aria-label="What kind of request" style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', fontSize: '0.875rem' }}>
            {TYPES.map((option) => (
              <label key={option.type} style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                <input type="radio" name="raise-type" checked={type === option.type} onChange={() => reset(option.type, kind)} />
                <span>{option.label}</span>
              </label>
            ))}
          </div>

          {type === 'DAMAGE' && (
            <div role="radiogroup" aria-label="What kind of issue" style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', fontSize: '0.875rem' }}>
              {SHP_ISSUE_KINDS.map((option) => (
                <label key={option.kind} style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                  <input type="radio" name="raise-kind" checked={kind === option.kind} onChange={() => reset('DAMAGE', option.kind)} />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
          )}

          {(type !== 'DAMAGE' || reasons.length > 1) && (
            <label style={small}>
              <span>Reason</span>
              <select value={reason} onChange={(e) => setReason(e.target.value)} style={field}>
                <option value="">Choose a reason…</option>
                {reasons.map((option) => <option key={option.code} value={option.code}>{option.label}</option>)}
              </select>
            </label>
          )}

          <div style={{ display: 'grid', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.8125rem', fontWeight: 600 }}>
              {type === 'CANCEL' ? 'Calling off' : type === 'RETURN' ? 'Coming back' : 'Affected'}
            </span>
            {lines === null && <p style={hint}>Checking what has been sent…</p>}
            {lines !== null && offered.length === 0 && (
              <p style={hint}>
                {type === 'CANCEL'
                  ? 'Nothing on this order is still waiting to go out.'
                  : 'Nothing on this order has been sent yet.'}
              </p>
            )}
            {offered.map((line) => {
              const max = maxFor(type, line)
              return (
                <div key={line.orderItemId} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', fontSize: '0.875rem' }}>
                  <input
                    type="number" min={0} max={max}
                    value={quantities[line.orderItemId] ?? 0}
                    onChange={(e) => setQuantities((current) => ({
                      ...current,
                      [line.orderItemId]: Math.max(0, Math.min(max, Number(e.target.value) || 0)),
                    }))}
                    aria-label={`Quantity of ${line.productName}`}
                    style={{ ...field, width: 72 }}
                  />
                  <span style={{ flex: 1, minWidth: 160 }}>
                    {line.productName} <span style={{ color: 'var(--color-text-secondary)' }}>(up to {max})</span>
                  </span>
                  {type === 'DAMAGE' && kind === 'MISSING' && (quantities[line.orderItemId] ?? 0) > 0 && (
                    <select
                      value={missing[line.orderItemId] ?? ''}
                      onChange={(e) => setMissing((current) => ({ ...current, [line.orderItemId]: e.target.value as ShpMissingKind }))}
                      aria-label={`Is all of ${line.productName} missing?`}
                      style={field}
                    >
                      <option value="">Whole or parts?</option>
                      <option value="WHOLE">The whole item</option>
                      <option value="PARTS">Just parts of it</option>
                    </select>
                  )}
                </div>
              )
            })}
            {type === 'CANCEL' && <p style={hint}>Leave every box at nought to call off the whole order, where none of it has gone yet.</p>}
          </div>

          <label style={small}>
            <span>
              {type === 'DAMAGE' && kind === 'OTHER'
                ? 'What is wrong'
                : type === 'DAMAGE' && kind === 'MISSING'
                  ? 'What they told us (say which parts, if parts are missing)'
                  : 'What they told us (optional)'}
            </span>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={2000} style={field} />
          </label>

          {type === 'DAMAGE' && (
            <div style={{ display: 'grid', gap: '0.5rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem' }}>
                <input type="checkbox" checked={requestPhotos} onChange={(e) => setRequestPhotos(e.target.checked)} />
                <span>Ask them for photographs</span>
              </label>
              {requestPhotos && (
                <label style={small}>
                  <span>What do you need a photograph of? (optional)</span>
                  <textarea
                    value={photoNote} onChange={(e) => setPhotoNote(e.target.value)} rows={2} maxLength={1000}
                    placeholder="The label on the end of the box, say" style={field}
                  />
                  <span className="field-hint">
                    Shows beside the upload button on their order page.{notifyCustomer ? ' The confirmation email asks for them too, with a link straight to the report.' : ' Tick the email below to ask them by email as well.'}
                  </span>
                </label>
              )}
            </div>
          )}

          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem' }}>
            <input type="checkbox" checked={notifyCustomer} onChange={(e) => setNotifyCustomer(e.target.checked)} />
            <span>
              Email the customer the usual confirmation
              {type === 'DAMAGE' && requestPhotos ? ', asking for the photographs' : ''}
            </span>
          </label>

          {error && <p style={{ color: 'var(--color-danger)', fontSize: '0.875rem', margin: 0 }}>{error}</p>}
        </div>

        <div style={{ padding: '0.75rem 1.25rem', borderTop: '1px solid var(--color-border)', display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" disabled={saving || lines === null} onClick={() => void submit()}>
            {saving ? 'Raising…' : 'Raise it'}
          </button>
        </div>
      </div>
    </div>
  )
}
