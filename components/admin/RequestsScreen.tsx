'use client'

import { useCallback, useEffect, useState } from 'react'
import { TabStrip } from '@/components/admin/TabStrip'
import { useAdminPath } from '@/components/admin/AdminPathContext'
import { useCurrencySymbol } from '@/modules/shop/components/admin/use-currency-symbol'
import { formatMoney } from '@/modules/shop/lib/money'
import { reasonLabel } from '@/modules/shop/lib/order-requests'
import { REQUEST_DECISION_LABEL, REQUEST_STATUS_DISPLAY, REQUEST_TYPE_LABEL, badgeClass } from '@/modules/shop/lib/order-display'
import type { ShpOrderRequestStatus, ShpOrderRequestType } from '@/modules/shop/lib/types'

// The queue: every cancellation, return and damage report a customer has
// raised, oldest pending first, with the two buttons that settle it.
//
// Approving is deliberately a two-step: the panel opens, the refund tickbox is
// shown with what it would cost, and only then does the approve button do
// anything. A refund is money leaving the business and it should never be one
// stray click away.
//
// The three types share this screen because they share a decision, but they do
// not read the same. A damage report arrives with photographs and is "put
// right" rather than approved; a return can carry a collection charge; a
// cancellation has neither.

type RequestRow = {
  id: string
  orderId: string
  type: ShpOrderRequestType
  status: ShpOrderRequestStatus
  reason: string
  customerNote: string | null
  adminNote: string | null
  createdAt: string
  decidedAt: string | null
  orderNumber: string
  customerName: string
  customerEmail: string
  orderTotal: string
  returnCharge: string | null
  /** Something on this request was sold on the understanding that taking it
   *  back would be a favour rather than a right - so saying no is genuinely on
   *  the table. */
  discretionary: boolean
  items: Array<{ id: string; orderItemId: string; quantity: number }>
  photos: Array<{ id: string; url: string }>
}

const FILTERS: Array<{ key: 'PENDING' | 'ALL' | ShpOrderRequestStatus; label: string }> = [
  { key: 'PENDING', label: 'Waiting' },
  { key: 'APPROVED', label: 'Approved' },
  { key: 'DECLINED', label: 'Declined' },
  { key: 'ALL', label: 'Everything' },
]

export function RequestsScreen() {
  const currencySymbol = useCurrencySymbol()
  const adminPath = useAdminPath()
  const [filter, setFilter] = useState<'PENDING' | 'ALL' | ShpOrderRequestStatus>('PENDING')
  // null = not fetched yet, which is also what drives the loading line. A
  // separate `loading` boolean would have to be set synchronously inside the
  // effect, and cascading renders is exactly what that rule is there to stop.
  const [rows, setRows] = useState<RequestRow[] | null>(null)
  const [pendingCount, setPendingCount] = useState(0)
  const [reloadToken, setReloadToken] = useState(0)
  const [openId, setOpenId] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [refund, setRefund] = useState(false)
  // Held as a string, like every other money box in the admin: a number state
  // fights the cursor the moment somebody types "12." on the way to 12.50.
  const [charge, setCharge] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null)

  const loading = rows === null

  useEffect(() => {
    // `active` guards a filter change landing while an older fetch is still in
    // flight - otherwise the slower one wins and the list disagrees with the tab.
    let active = true
    const params = new URLSearchParams()
    if (filter !== 'ALL') params.set('status', filter)
    fetch(`/api/m/shop/admin/requests?${params}`)
      .then(async (res) => {
        if (!res.ok) throw new Error('failed')
        const data = await res.json()
        if (!active) return
        setRows(data.requests ?? [])
        setPendingCount(data.pendingCount ?? 0)
      })
      .catch(() => { if (active) setRows([]) })
    return () => { active = false }
  }, [filter, reloadToken])

  const reload = useCallback(() => setReloadToken((token) => token + 1), [])

  function openPanel(row: RequestRow) {
    setOpenId(row.id)
    setNote('')
    setCharge('')
    // Pre-ticked only when there is money to send back at all. A cancellation
    // of an unpaid order has nothing to refund, so offering it ticked would be
    // an invitation to a confusing error.
    setRefund(Number(row.orderTotal) > 0)
    setMessage(null)
  }

  async function decide(row: RequestRow, decision: 'APPROVED' | 'DECLINED') {
    setBusy(true)
    setMessage(null)
    try {
      const res = await fetch(`/api/m/shop/admin/requests/${row.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decision,
          adminNote: note || null,
          refund: decision === 'APPROVED' && refund,
          // Only ever sent on a return being approved. The server refuses it on
          // anything else anyway - there is nothing to collect on a cancelled
          // order, and a shop does not charge somebody for coming to look at
          // something it broke.
          returnCharge:
            decision === 'APPROVED' && row.type === 'RETURN' && charge.trim() !== ''
              ? Number(charge)
              : null,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setMessage({ tone: 'error', text: data.error ?? 'That did not go through.' })
        return
      }
      if (data.refundError) {
        // The decision stands - saying only "done" here would hide a refund
        // that never happened.
        setMessage({
          tone: 'error',
          text: `Recorded as ${decision === 'APPROVED' ? 'approved' : 'declined'}, but the refund did not go through: ${data.refundError}`,
        })
      } else {
        const settled = decision === 'APPROVED'
          ? row.type === 'DAMAGE' ? 'Marked as being put right' : 'Approved'
          : row.type === 'DAMAGE' ? 'Turned down' : 'Declined'
        setMessage({
          tone: 'success',
          text: data.refundedAmount
            ? `${settled}, and ${formatMoney(data.refundedAmount, currencySymbol)} refunded.`
            : `${settled}. The customer has been emailed.`,
        })
      }
      setOpenId(null)
      reload()
    } catch {
      setMessage({ tone: 'error', text: 'That did not go through.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Cancellations, returns &amp; damage</h1>
      </div>

      <TabStrip
        items={FILTERS.map((option) => ({
          key: option.key,
          label: option.key === 'PENDING' && pendingCount > 0 ? `${option.label} (${pendingCount})` : option.label,
          active: filter === option.key,
          onClick: () => setFilter(option.key),
        }))}
      />

      {message && (
        <div className={message.tone === 'error' ? 'alert alert-danger' : 'alert alert-success'} style={{ marginBottom: 'var(--space-4)' }}>
          {message.text}
        </div>
      )}

      {loading && <p style={{ color: 'var(--color-text-secondary)' }}>Loading…</p>}

      {rows !== null && rows.length === 0 && (
        <p style={{ color: 'var(--color-text-secondary)' }}>
          {filter === 'PENDING' ? 'Nothing waiting. Enjoy it while it lasts.' : 'Nothing here.'}
        </p>
      )}

      <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
        {(rows ?? []).map((row) => {
          const state = REQUEST_STATUS_DISPLAY[row.status]
          const isOpen = openId === row.id
          return (
            <div key={row.id} className="card" style={{ padding: 'var(--space-4)', display: 'grid', gap: 'var(--space-2)' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
                  <strong>{REQUEST_TYPE_LABEL[row.type]}</strong>
                  <span className={badgeClass(state.tone)}>{state.label}</span>
                  {/* The flag that says the decision is genuinely open. Without
                      it an owner has to open the order and read the lines to
                      find out whether they are allowed to say no. */}
                  {row.discretionary && row.type !== 'DAMAGE' && (
                    <span className={badgeClass('warning')}>Your call</span>
                  )}
                  <span style={{ color: 'var(--color-text-secondary)' }}>
                    {row.orderNumber} · {row.customerName} ({row.customerEmail})
                  </span>
                </div>
                <span style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}>
                  asked {new Date(row.createdAt).toLocaleDateString('en-GB')}
                </span>
              </div>

              <div style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}>
                {reasonLabel(row.type, row.reason)}
                {row.items.length > 0 && (
                  row.type === 'DAMAGE'
                    ? ` · ${row.items.reduce((sum, item) => sum + item.quantity, 0)} item(s) affected`
                    : row.type === 'CANCEL'
                      // A cancellation naming lines is a part-cancellation. One
                      // naming none is still the whole order, and says nothing
                      // here rather than "0 item(s)".
                      ? ` · ${row.items.reduce((sum, item) => sum + item.quantity, 0)} item(s) to call off`
                      : ` · ${row.items.reduce((sum, item) => sum + item.quantity, 0)} item(s) to come back`
                )}
                {row.type === 'CANCEL' && row.items.length === 0 && ' · the whole order'}
                {` · order total ${formatMoney(row.orderTotal, currencySymbol)}`}
                {row.returnCharge != null && ` · ${formatMoney(row.returnCharge, currencySymbol)} return charge kept back`}
              </div>

              {/* Full size behind a click, because the whole decision rests on
                  what the photographs actually show and a thumbnail of a scuff
                  settles nothing. */}
              {row.photos.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  {row.photos.map((photo) => (
                    <a key={photo.id} href={photo.url} target="_blank" rel="noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element -- a
                          customer's upload on whichever provider domain the shop
                          uses; not page furniture the loader is configured for. */}
                      <img
                        src={photo.url}
                        alt="Damage reported by the customer"
                        style={{ width: 96, height: 96, objectFit: 'cover', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}
                      />
                    </a>
                  ))}
                </div>
              )}

              {row.customerNote && (
                <p style={{ margin: 0, fontStyle: 'italic' }}>&ldquo;{row.customerNote}&rdquo;</p>
              )}

              {row.adminNote && row.status !== 'PENDING' && (
                <p style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}>
                  You replied: {row.adminNote}
                </p>
              )}

              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <a className="btn btn-sm" href={`/${adminPath}/m/shop/orders/${row.orderId}`}>Open the order</a>
                {row.status === 'PENDING' && !isOpen && (
                  <button type="button" className="btn btn-sm btn-primary" onClick={() => openPanel(row)}>
                    Decide
                  </button>
                )}
              </div>

              {isOpen && (
                <div style={{ display: 'grid', gap: 'var(--space-2)', borderTop: '1px solid var(--color-border)', paddingTop: 'var(--space-3)' }}>
                  <label style={{ display: 'grid', gap: '0.25rem' }}>
                    <span style={{ fontWeight: 'var(--font-medium)' }}>A line for the customer (optional)</span>
                    <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={2000} />
                    <span className="field-hint">This goes in the email either way, so it is worth a sentence.</span>
                  </label>

                  {row.type === 'RETURN' && (
                    <div className="field" style={{ margin: 0, maxWidth: 220 }}>
                      <label>Return charge (optional)</label>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={charge}
                        placeholder="0.00"
                        onChange={(e) => setCharge(e.target.value)}
                      />
                      <p className="field-hint">
                        What it costs you to collect this, kept back from the refund. Recorded either way, so you can
                        approve now and refund the balance when the van comes back.
                      </p>
                    </div>
                  )}

                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <input type="checkbox" checked={refund} onChange={(e) => setRefund(e.target.checked)} />
                    <span>
                      Refund as part of {row.type === 'DAMAGE' ? 'this' : 'approving'}
                      {row.type === 'CANCEL'
                        ? row.items.length === 0
                          ? ' (everything not already refunded)'
                          : ' (just the items being called off)'
                        : row.type === 'DAMAGE'
                          ? ' (just the items reported)'
                          : ' (just the items being sent back)'}
                    </span>
                  </label>
                  {refund && (
                    <p className="field-hint" style={{ margin: 0 }}>
                      This sends money back through the original payment method now
                      {row.type === 'RETURN' && charge.trim() !== '' && ', less the charge above'}. Leave it unticked to
                      {row.type === 'DAMAGE' ? ' sort a replacement instead' : ' approve first and refund once the goods are back'}.
                    </p>
                  )}

                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button type="button" className="btn btn-primary" onClick={() => decide(row, 'APPROVED')} disabled={busy}>
                      {busy ? 'Working…' : REQUEST_DECISION_LABEL[row.type].approve}
                    </button>
                    <button type="button" className="btn btn-danger" onClick={() => decide(row, 'DECLINED')} disabled={busy}>
                      {REQUEST_DECISION_LABEL[row.type].decline}
                    </button>
                    <button type="button" className="btn" onClick={() => setOpenId(null)} disabled={busy}>
                      Not now
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
