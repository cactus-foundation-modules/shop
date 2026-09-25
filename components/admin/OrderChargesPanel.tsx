'use client'

import { useCallback, useEffect, useState } from 'react'
import { formatMoney } from '@/modules/shop/lib/money'
import { useAlert, useConfirm } from '@/modules/shop/components/admin/dialogs'
import type { ShpOrderCharge } from '@/modules/shop/lib/types'

// Extra charges on this order - a redelivery fee after a failed delivery, say.
//
// Raising one puts the order on hold (unless told not to) and emails the
// customer, whose own order page then offers to take the payment or to cancel
// the order and refund what they paid less the charge. See
// lib/order-charges.ts. Staff can do either on the customer's behalf from here,
// for the customer who rings rather than clicks, or waive it.
//
// Its own card with its own data, rather than more fields on the order payload:
// most orders never have a charge, and the screen should not grow a column of
// figures for all of them to carry an empty array.

type ChargesData = {
  charges: ShpOrderCharge[]
  suggestedTaxRate: number
  taxLabel: string
  payMethods: string[]
  cancellation: { ok: true; refund: number; held: number; kept: number } | { ok: false; error: string } | null
}

const STATUS_LABEL: Record<ShpOrderCharge['status'], { label: string; badge: string }> = {
  PENDING: { label: 'Waiting to be paid', badge: 'badge-warning' },
  PAID: { label: 'Paid', badge: 'badge-success' },
  KEPT: { label: 'Kept from refund', badge: 'badge-info' },
  WAIVED: { label: 'Waived', badge: 'badge-default' },
}

function formatDate(value: string | Date | null): string {
  if (!value) return ''
  return new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function OrderChargesPanel({
  orderId, orderStatus, currencySymbol, onChanged,
}: {
  orderId: string
  /** Re-read when the order moves, since whether cancelling is still on offer
   *  depends on it. */
  orderStatus: string
  currencySymbol: string
  /** Tell the order screen something changed - its status, its refunds. */
  onChanged: () => void
}) {
  const [data, setData] = useState<ChargesData | null>(null)
  const [busy, setBusy] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  const [net, setNet] = useState('')
  const [taxRate, setTaxRate] = useState('')
  const [holdOrder, setHoldOrder] = useState(true)
  const [emailCustomer, setEmailCustomer] = useState(true)
  const [confirm, confirmDialog] = useConfirm()
  const [alert, alertDialog] = useAlert()

  const load = useCallback(() => {
    fetch(`/api/m/shop/admin/orders/${orderId}/charges`)
      .then(async (r) => { if (r.ok) setData(await r.json()) })
      .catch(() => {})
  }, [orderId])

  // orderStatus is the reason to read again, not an input to the read.
  useEffect(load, [load, orderStatus])

  if (!data) return null

  const pending = data.charges.find((charge) => charge.status === 'PENDING') ?? null
  const money = (value: string | number) => formatMoney(value, currencySymbol)
  const netNumber = Number(net)
  const rateNumber = taxRate === '' ? data.suggestedTaxRate : Number(taxRate)
  const previewTax = Number.isFinite(netNumber) && Number.isFinite(rateNumber) ? Math.round(netNumber * rateNumber) / 100 : 0
  const previewTotal = Number.isFinite(netNumber) ? netNumber + previewTax : 0

  function openForm() {
    setReason('')
    setNote('')
    setNet('')
    setTaxRate(String(data?.suggestedTaxRate ?? 0))
    setHoldOrder(true)
    setEmailCustomer(true)
    setFormOpen(true)
  }

  async function send(url: string, init: RequestInit, failure: string): Promise<boolean> {
    setBusy(true)
    try {
      const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...init })
      if (!res.ok) {
        await alert(((await res.json().catch(() => ({}))) as { error?: string }).error ?? failure)
        return false
      }
      load()
      onChanged()
      return true
    } finally {
      setBusy(false)
    }
  }

  async function raise() {
    if (!reason.trim()) { await alert('Say what the charge is for.'); return }
    if (!(netNumber > 0)) { await alert('Enter the amount to charge, before tax.'); return }
    if (!Number.isFinite(rateNumber) || rateNumber < 0 || rateNumber > 100) { await alert('The tax rate must be between 0 and 100.'); return }
    const ok = await send(
      `/api/m/shop/admin/orders/${orderId}/charges`,
      {
        method: 'POST',
        body: JSON.stringify({
          reason: reason.trim(),
          note: note.trim() || null,
          netAmount: netNumber,
          taxRate: rateNumber,
          holdOrder,
          emailCustomer,
        }),
      },
      'That charge could not be raised.',
    )
    if (ok) setFormOpen(false)
  }

  async function act(charge: ShpOrderCharge, action: 'waive' | 'mark-paid' | 'cancel-order' | 'resend') {
    const total = money(charge.total)
    if (action === 'waive') {
      if (!(await confirm({
        title: 'Waive this charge?',
        message: `The customer will no longer be asked for the ${total}${charge.heldFromStatus ? ', and the order comes off hold' : ''}. They are not emailed.`,
        confirmLabel: 'Waive it',
      }))) return
    }
    if (action === 'mark-paid') {
      if (!(await confirm({
        title: 'Record this charge as paid?',
        message: `For a ${total} payment taken some other way - over the phone, say. Nothing is charged from here. The customer is emailed a receipt${charge.heldFromStatus ? ' and the order comes off hold' : ''}.`,
        confirmLabel: 'Record as paid',
      }))) return
    }
    if (action === 'cancel-order') {
      const plan = data?.cancellation
      if (!plan?.ok) return
      if (!(await confirm({
        title: 'Cancel the order and keep the charge?',
        message: `This refunds ${money(plan.refund)} - the ${money(plan.held)} paid, less the ${money(plan.kept)} - cancels the order and emails the customer. It cannot be undone.`,
        confirmLabel: `Refund ${money(plan.refund)} and cancel`,
        danger: true,
      }))) return
    }
    await send(
      `/api/m/shop/admin/orders/${orderId}/charges/${charge.id}`,
      { method: 'PATCH', body: JSON.stringify({ action }) },
      'That charge could not be updated.',
    )
  }

  return (
    <section className="sox-card sox-noprint">
      <div className="sox-card-head">
        <h2>Extra charges</h2>
        {!pending && !formOpen && (
          <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={openForm}>Raise a charge</button>
        )}
      </div>
      <div className="sox-card-body" style={{ display: 'grid', gap: '0.75rem' }}>
        {data.charges.length === 0 && !formOpen && (
          <p className="sox-muted" style={{ margin: 0, fontSize: '0.8125rem' }}>
            For something the customer owes on top of the order - a redelivery fee after a missed delivery, say.
            They can pay it from their order page, or cancel and be refunded less it.
          </p>
        )}

        {data.charges.map((charge) => (
          <div key={charge.id} style={{ display: 'grid', gap: '0.375rem' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center', justifyContent: 'space-between' }}>
              <strong style={{ fontSize: '0.875rem' }}>{charge.reason} · {money(charge.total)}</strong>
              <span className={`badge ${STATUS_LABEL[charge.status].badge}`}>{STATUS_LABEL[charge.status].label}</span>
            </div>
            <p className="sox-muted" style={{ margin: 0, fontSize: '0.75rem' }}>
              {Number(charge.taxAmount) > 0
                ? `${money(charge.netAmount)} + ${money(charge.taxAmount)} ${data.taxLabel} at ${Number(charge.taxRate)}%`
                : `No ${data.taxLabel}`}
              {' · raised '}{formatDate(charge.createdAt)}
              {charge.status === 'PAID' && ` · paid ${formatDate(charge.paidAt)}${charge.paymentMethod === 'MANUAL' ? ' (recorded by hand)' : ''}`}
              {charge.paymentReference ? ` · ${charge.paymentReference}` : ''}
            </p>
            {charge.note && <p style={{ margin: 0, fontSize: '0.8125rem', whiteSpace: 'pre-wrap' }}>{charge.note}</p>}
            {charge.status === 'PAID' && (
              <p className="sox-muted" style={{ margin: 0, fontSize: '0.75rem' }}>
                Paid separately from the order, so it is not on the order&rsquo;s invoice. Record it in your books.
              </p>
            )}

            {charge.status === 'PENDING' && (
              <>
                <p className="sox-muted" style={{ margin: 0, fontSize: '0.75rem' }}>
                  {data.payMethods.length > 0
                    ? `The customer can pay it from their order page by ${data.payMethods.join(' or ')}.`
                    : 'No payment method this shop has switched on can take it online, so the customer is asked to get in touch - record the payment here once it is in.'}
                  {data.cancellation?.ok
                    ? ` Or they can cancel, and be refunded ${money(data.cancellation.refund)}.`
                    : data.cancellation ? ` Cancelling is not on offer: ${data.cancellation.error}` : ''}
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => act(charge, 'mark-paid')}>Record as paid</button>
                  {data.cancellation?.ok && (
                    <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => act(charge, 'cancel-order')}>
                      Cancel order, keep charge
                    </button>
                  )}
                  <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => act(charge, 'resend')}>Email again</button>
                  <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => act(charge, 'waive')}>Waive</button>
                </div>
              </>
            )}
          </div>
        ))}

        {formOpen && (
          <div style={{ display: 'grid', gap: '0.625rem', fontSize: '0.8125rem' }}>
            <label style={{ display: 'grid', gap: '0.25rem' }}>
              What it is for (the customer sees this)
              <input className="sox-input" value={reason} maxLength={120} placeholder="Redelivery fee" onChange={(e) => setReason(e.target.value)} />
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 120px), 1fr))', gap: '0.5rem' }}>
              <label style={{ display: 'grid', gap: '0.25rem' }}>
                Amount before {data.taxLabel} ({currencySymbol})
                <input className="sox-input" inputMode="decimal" value={net} placeholder="39.00" onChange={(e) => setNet(e.target.value)} />
              </label>
              <label style={{ display: 'grid', gap: '0.25rem' }}>
                {data.taxLabel} rate (%)
                <input className="sox-input" inputMode="decimal" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} />
              </label>
            </div>
            {netNumber > 0 && (
              <p className="sox-muted" style={{ margin: 0 }}>
                The customer pays <strong>{money(previewTotal)}</strong>
                {previewTax > 0 ? ` (${money(netNumber)} + ${money(previewTax)} ${data.taxLabel})` : ''}.
              </p>
            )}
            <label style={{ display: 'grid', gap: '0.25rem' }}>
              A note for the customer (optional)
              <textarea
                className="sox-input"
                style={{ height: 'auto', minHeight: '4.5rem', padding: '0.5rem' }}
                value={note}
                maxLength={2000}
                placeholder="The courier could not deliver on the day, and charges us for a second attempt."
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
            <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <input type="checkbox" checked={holdOrder} onChange={(e) => setHoldOrder(e.target.checked)} />
              Put the order on hold until it is settled
            </label>
            <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <input type="checkbox" checked={emailCustomer} onChange={(e) => setEmailCustomer(e.target.checked)} />
              Email the customer asking them to pay it
            </label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={raise}>Raise charge</button>
              <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setFormOpen(false)}>Cancel</button>
            </div>
          </div>
        )}
      </div>
      {confirmDialog}
      {alertDialog}
    </section>
  )
}
