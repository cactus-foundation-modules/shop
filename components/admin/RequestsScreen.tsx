'use client'

import { useCallback, useEffect, useState } from 'react'
import { TabStrip } from '@/components/admin/TabStrip'
import { useAdminPath } from '@/components/admin/AdminPathContext'
import { useCurrencySymbol } from '@/modules/shop/components/admin/use-currency-symbol'
import { formatMoney } from '@/modules/shop/lib/money'
import { reasonLabel } from '@/modules/shop/lib/order-requests'
import { REQUEST_STATUS_DISPLAY, REQUEST_TYPE_LABEL, badgeClass } from '@/modules/shop/lib/order-display'
import type { ShpOrderRequestStatus, ShpOrderRequestType } from '@/modules/shop/lib/types'

// The queue: every cancel and return a customer has asked for, oldest pending
// first, with the two buttons that settle it.
//
// Approving is deliberately a two-step: the panel opens, the refund tickbox is
// shown with what it would cost, and only then does the approve button do
// anything. A refund is money leaving the business and it should never be one
// stray click away.

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
  items: Array<{ id: string; orderItemId: string; quantity: number }>
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
        body: JSON.stringify({ decision, adminNote: note || null, refund: decision === 'APPROVED' && refund }),
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
        setMessage({
          tone: 'success',
          text: decision === 'APPROVED'
            ? data.refundedAmount
              ? `Approved, and ${formatMoney(data.refundedAmount, currencySymbol)} refunded.`
              : 'Approved. The customer has been emailed.'
            : 'Declined. The customer has been emailed.',
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
        <h1 className="page-title">Cancellations &amp; returns</h1>
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

      {loading && <p style={{ color: 'var(--color-text-muted)' }}>Loading…</p>}

      {rows !== null && rows.length === 0 && (
        <p style={{ color: 'var(--color-text-muted)' }}>
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
                  <span style={{ color: 'var(--color-text-muted)' }}>
                    {row.orderNumber} · {row.customerName} ({row.customerEmail})
                  </span>
                </div>
                <span style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>
                  asked {new Date(row.createdAt).toLocaleDateString('en-GB')}
                </span>
              </div>

              <div style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>
                {reasonLabel(row.type, row.reason)}
                {row.items.length > 0 && ` · ${row.items.reduce((sum, item) => sum + item.quantity, 0)} item(s) to come back`}
                {` · order total ${formatMoney(row.orderTotal, currencySymbol)}`}
              </div>

              {row.customerNote && (
                <p style={{ margin: 0, fontStyle: 'italic' }}>&ldquo;{row.customerNote}&rdquo;</p>
              )}

              {row.adminNote && row.status !== 'PENDING' && (
                <p style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>
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

                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <input type="checkbox" checked={refund} onChange={(e) => setRefund(e.target.checked)} />
                    <span>
                      Refund as part of approving
                      {row.type === 'CANCEL'
                        ? ' (everything not already refunded)'
                        : ' (just the items being sent back)'}
                    </span>
                  </label>
                  {refund && (
                    <p className="field-hint" style={{ margin: 0 }}>
                      This sends money back through the original payment method now. Leave it unticked to approve first
                      and refund once the goods are back.
                    </p>
                  )}

                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button type="button" className="btn btn-primary" onClick={() => decide(row, 'APPROVED')} disabled={busy}>
                      {busy ? 'Working…' : 'Approve'}
                    </button>
                    <button type="button" className="btn btn-danger" onClick={() => decide(row, 'DECLINED')} disabled={busy}>
                      Decline
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
