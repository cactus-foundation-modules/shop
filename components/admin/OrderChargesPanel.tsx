'use client'

import { useCallback, useEffect, useState } from 'react'
import { formatMoney } from '@/modules/shop/lib/money'
import { useAlert, useConfirm } from '@/modules/shop/components/admin/dialogs'
import type { ShpOrderCharge } from '@/modules/shop/lib/types'

// The redelivery charge on this order, after a failed delivery.
//
// Raising one puts the order on hold (unless told not to) and emails the
// customer, whose own order page then offers to take the payment or to cancel
// the order and refund what they paid less the fee - which is owed either way,
// the failed attempt having already happened - and less any cancellation charge
// set here. See lib/order-charges.ts. Staff can do either on the customer's
// behalf from here, for the customer who rings rather than clicks, change the
// figures while it is still waiting, or waive it.
//
// Its own card with its own data, rather than more fields on the order payload:
// most orders never have a charge, and the screen should not grow a column of
// figures for all of them to carry an empty array.

type ChargesData = {
  charges: ShpOrderCharge[]
  suggestedTaxRate: number
  taxLabel: string
  /** The shop's words for its last cancellation charge, to start the next from. */
  lastCancellationNote: string | null
  payMethods: string[]
  cancellation: { ok: true; refund: number; held: number; kept: number } | { ok: false; error: string } | null
}

const STATUS_LABEL: Record<ShpOrderCharge['status'], { label: string; badge: string }> = {
  PENDING: { label: 'Waiting to be paid', badge: 'badge-warning' },
  PAID: { label: 'Paid', badge: 'badge-success' },
  KEPT: { label: 'Kept from refund', badge: 'badge-info' },
  WAIVED: { label: 'Waived', badge: 'badge-default' },
  REPLACED: { label: 'Changed', badge: 'badge-default' },
}

function formatDate(value: string | Date | null): string {
  if (!value) return ''
  return new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** Raising a new charge, or changing the one waiting. */
type FormMode = { kind: 'raise' } | { kind: 'edit'; charge: ShpOrderCharge }

/** The same sum the server does (lib/order-charge-money.ts), for the preview
 *  only - the server works it out again and its figure is the one stored. */
function taxed(net: number, rate: number): { tax: number; total: number } {
  const tax = Math.round(net * rate) / 100
  return { tax, total: Math.round((net + tax) * 100) / 100 }
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
  const [mode, setMode] = useState<FormMode | null>(null)
  const [note, setNote] = useState('')
  const [net, setNet] = useState('')
  const [cancellationNet, setCancellationNet] = useState('')
  const [cancellationNote, setCancellationNote] = useState('')
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
  const cancellationNumber = cancellationNet.trim() === '' ? 0 : Number(cancellationNet)
  const rateNumber = taxRate === '' ? data.suggestedTaxRate : Number(taxRate)
  const ratesOk = Number.isFinite(rateNumber)
  const previewFee = Number.isFinite(netNumber) && ratesOk ? taxed(netNumber, rateNumber) : { tax: 0, total: 0 }
  const previewCancellation = Number.isFinite(cancellationNumber) && ratesOk ? taxed(cancellationNumber, rateNumber) : { tax: 0, total: 0 }

  function openRaise() {
    setNote('')
    setNet('')
    setCancellationNet('')
    setCancellationNote(data?.lastCancellationNote ?? '')
    setTaxRate(String(data?.suggestedTaxRate ?? 0))
    setHoldOrder(true)
    setEmailCustomer(true)
    setMode({ kind: 'raise' })
  }

  function openEdit(charge: ShpOrderCharge) {
    setNote(charge.note ?? '')
    setNet(String(Number(charge.netAmount)))
    setCancellationNet(Number(charge.cancellationNet) > 0 ? String(Number(charge.cancellationNet)) : '')
    setCancellationNote(charge.cancellationNote ?? data?.lastCancellationNote ?? '')
    setTaxRate(String(Number(charge.taxRate)))
    // A change is usually the owner putting right what they typed, and the
    // customer has already had one email about it.
    setEmailCustomer(false)
    setMode({ kind: 'edit', charge })
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

  async function save() {
    if (!mode) return
    if (!(netNumber > 0)) { await alert(`Enter the redelivery fee, before ${data?.taxLabel ?? 'tax'}.`); return }
    if (!Number.isFinite(cancellationNumber) || cancellationNumber < 0) { await alert('The cancellation charge must be nothing, or an amount.'); return }
    if (!ratesOk || rateNumber < 0 || rateNumber > 100) { await alert('The tax rate must be between 0 and 100.'); return }
    const figures = {
      note: note.trim() || null,
      netAmount: netNumber,
      cancellationNet: cancellationNumber,
      cancellationNote: cancellationNumber > 0 ? cancellationNote.trim() || null : null,
      taxRate: rateNumber,
      emailCustomer,
    }
    const ok = mode.kind === 'raise'
      ? await send(
          `/api/m/shop/admin/orders/${orderId}/charges`,
          { method: 'POST', body: JSON.stringify({ ...figures, holdOrder }) },
          'That charge could not be raised.',
        )
      : await send(
          `/api/m/shop/admin/orders/${orderId}/charges/${mode.charge.id}`,
          { method: 'PATCH', body: JSON.stringify({ action: 'edit', ...figures }) },
          'That charge could not be changed.',
        )
    if (ok) setMode(null)
  }

  async function act(charge: ShpOrderCharge, action: 'waive' | 'mark-paid' | 'cancel-order' | 'resend') {
    const total = money(charge.total)
    if (action === 'waive') {
      if (!(await confirm({
        title: 'Waive the redelivery fee?',
        message: `The customer will no longer be asked for the ${total}${charge.heldFromStatus ? ', and the order comes off hold' : ''}. They are not emailed.`,
        confirmLabel: 'Waive it',
      }))) return
    }
    if (action === 'mark-paid') {
      if (!(await confirm({
        title: 'Record the redelivery fee as paid?',
        message: `For a ${total} payment taken some other way - over the phone, say. Nothing is charged from here. The customer is emailed a receipt${charge.heldFromStatus ? ' and the order comes off hold' : ''}.`,
        confirmLabel: 'Record as paid',
      }))) return
    }
    if (action === 'cancel-order') {
      const plan = data?.cancellation
      if (!plan?.ok) return
      if (!(await confirm({
        title: 'Cancel the order and keep the charges?',
        message: `This refunds ${money(plan.refund)} - the ${money(plan.held)} paid, less ${keptWords(charge)} - cancels the order and emails the customer. It cannot be undone.`,
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

  /** "the £48.00 redelivery fee and the £30.00 cancellation charge" */
  function keptWords(charge: ShpOrderCharge): string {
    const fee = `the ${money(charge.total)} ${charge.reason.toLowerCase()}`
    return Number(charge.cancellationTotal) > 0 ? `${fee} and the ${money(charge.cancellationTotal)} cancellation charge` : fee
  }

  const taxText = (amount: string | number, tax: string | number, rate: string | number) =>
    Number(tax) > 0 ? `${money(amount)} + ${money(tax)} ${data.taxLabel} at ${Number(rate)}%` : `No ${data.taxLabel}`

  return (
    <section className="sox-card sox-noprint">
      <div className="sox-card-head">
        <h2>Redelivery charge</h2>
        {!pending && !mode && (
          <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={openRaise}>Charge for redelivery</button>
        )}
      </div>
      <div className="sox-card-body" style={{ display: 'grid', gap: '0.75rem' }}>
        {data.charges.length === 0 && !mode && (
          <p className="sox-muted" style={{ margin: 0, fontSize: '0.8125rem' }}>
            For a delivery that failed because nobody was in. The customer can pay the redelivery fee from their order
            page to have it sent again, or cancel instead - in which case the fee for the failed attempt is still kept,
            plus any cancellation charge you set.
          </p>
        )}

        {data.charges.map((charge) => charge.status === 'REPLACED' ? (
          <p key={charge.id} className="sox-muted" style={{ margin: 0, fontSize: '0.75rem' }}>
            {charge.reason} of {money(charge.total)}
            {Number(charge.cancellationTotal) > 0 ? ` (cancellation charge ${money(charge.cancellationTotal)})` : ''}
            {' '}changed on {formatDate(charge.resolvedAt)}.
          </p>
        ) : (
          <div key={charge.id} style={{ display: 'grid', gap: '0.375rem' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center', justifyContent: 'space-between' }}>
              <strong style={{ fontSize: '0.875rem' }}>{charge.reason} · {money(charge.total)}</strong>
              <span className={`badge ${STATUS_LABEL[charge.status].badge}`}>{STATUS_LABEL[charge.status].label}</span>
            </div>
            <p className="sox-muted" style={{ margin: 0, fontSize: '0.75rem' }}>
              {taxText(charge.netAmount, charge.taxAmount, charge.taxRate)}
              {' · raised '}{formatDate(charge.createdAt)}
              {charge.status === 'PAID' && ` · paid ${formatDate(charge.paidAt)}${charge.paymentMethod === 'MANUAL' ? ' (recorded by hand)' : ''}`}
              {charge.paymentReference ? ` · ${charge.paymentReference}` : ''}
            </p>
            {Number(charge.cancellationTotal) > 0 && (
              <p className="sox-muted" style={{ margin: 0, fontSize: '0.75rem' }}>
                Cancellation charge {money(charge.cancellationTotal)} ({taxText(charge.cancellationNet, charge.cancellationTax, charge.taxRate)})
                {charge.status === 'KEPT' ? ', kept with the fee.' : ', kept on top of the fee only if they cancel.'}
              </p>
            )}
            {Number(charge.cancellationTotal) > 0 && charge.cancellationNote && (
              <p className="sox-muted" style={{ margin: 0, fontSize: '0.75rem', whiteSpace: 'pre-wrap' }}>
                Why, as the customer sees it: {charge.cancellationNote}
              </p>
            )}
            {charge.note && <p style={{ margin: 0, fontSize: '0.8125rem', whiteSpace: 'pre-wrap' }}>{charge.note}</p>}
            {charge.status === 'PAID' && (
              <p className="sox-muted" style={{ margin: 0, fontSize: '0.75rem' }}>
                Paid separately from the order, so it is not on the order&rsquo;s invoice. Record it in your books.
              </p>
            )}

            {charge.status === 'PENDING' && !(mode?.kind === 'edit' && mode.charge.id === charge.id) && (
              <>
                <p className="sox-muted" style={{ margin: 0, fontSize: '0.75rem' }}>
                  {data.payMethods.length > 0
                    ? `The customer can pay it from their order page by ${data.payMethods.join(' or ')}.`
                    : 'No payment method this shop has switched on can take it online, so the customer is asked to get in touch - record the payment here once it is in.'}
                  {data.cancellation?.ok
                    ? ` Or they can cancel: ${money(data.cancellation.kept)} is kept back (${keptWords(charge)}) and ${money(data.cancellation.refund)} refunded.`
                    : data.cancellation ? ` Cancelling is not on offer: ${data.cancellation.error}` : ''}
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => act(charge, 'mark-paid')}>Record as paid</button>
                  {data.cancellation?.ok && (
                    <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => act(charge, 'cancel-order')}>
                      Cancel order, keep charges
                    </button>
                  )}
                  <button type="button" className="btn btn-ghost btn-sm" disabled={busy || mode !== null} onClick={() => openEdit(charge)}>Change</button>
                  <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => act(charge, 'resend')}>Email again</button>
                  <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => act(charge, 'waive')}>Waive</button>
                </div>
              </>
            )}
          </div>
        ))}

        {mode && (
          <div style={{ display: 'grid', gap: '0.625rem', fontSize: '0.8125rem' }}>
            {mode.kind === 'edit' && <strong style={{ fontSize: '0.875rem' }}>Change the redelivery charge</strong>}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 120px), 1fr))', gap: '0.5rem' }}>
              <label style={{ display: 'grid', gap: '0.25rem' }}>
                Redelivery fee before {data.taxLabel} ({currencySymbol})
                <input className="sox-input" inputMode="decimal" value={net} placeholder="40.00" onChange={(e) => setNet(e.target.value)} />
              </label>
              <label style={{ display: 'grid', gap: '0.25rem' }}>
                {data.taxLabel} rate (%)
                <input className="sox-input" inputMode="decimal" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} />
              </label>
            </div>
            <label style={{ display: 'grid', gap: '0.25rem' }}>
              Cancellation charge before {data.taxLabel} ({currencySymbol}, optional)
              <input className="sox-input" inputMode="decimal" value={cancellationNet} placeholder="0.00" onChange={(e) => setCancellationNet(e.target.value)} />
              <span className="sox-muted" style={{ fontSize: '0.75rem' }}>
                Kept on top of the redelivery fee, and only if they cancel instead of paying. Leave empty for none.
              </span>
            </label>
            {cancellationNumber > 0 && (
              <label style={{ display: 'grid', gap: '0.25rem' }}>
                Why there is a cancellation charge (the customer sees this)
                <textarea
                  className="sox-input"
                  style={{ height: 'auto', minHeight: '4.5rem', padding: '0.5rem' }}
                  value={cancellationNote}
                  maxLength={2000}
                  placeholder="This is what our supplier charges us to cover the administration of a cancelled order. We pass it on at cost and add nothing on top."
                  onChange={(e) => setCancellationNote(e.target.value)}
                />
              </label>
            )}
            {netNumber > 0 && (
              <p className="sox-muted" style={{ margin: 0 }}>
                To have it delivered again, the customer pays <strong>{money(previewFee.total)}</strong>
                {previewFee.tax > 0 ? ` (${money(netNumber)} + ${money(previewFee.tax)} ${data.taxLabel})` : ''}.
                {' '}If they cancel instead, <strong>{money(previewFee.total + previewCancellation.total)}</strong> is kept back:
                the {money(previewFee.total)} redelivery fee for the failed attempt
                {cancellationNumber > 0 ? `, plus the ${money(previewCancellation.total)} cancellation charge` : ''}.
              </p>
            )}
            <label style={{ display: 'grid', gap: '0.25rem' }}>
              A note for the customer (optional)
              <textarea
                className="sox-input"
                style={{ height: 'auto', minHeight: '4.5rem', padding: '0.5rem' }}
                value={note}
                maxLength={2000}
                placeholder="The courier tried to deliver on Tuesday, but nobody was in to take it."
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
            {mode.kind === 'raise' && (
              <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <input type="checkbox" checked={holdOrder} onChange={(e) => setHoldOrder(e.target.checked)} />
                Put the order on hold until it is settled
              </label>
            )}
            <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <input type="checkbox" checked={emailCustomer} onChange={(e) => setEmailCustomer(e.target.checked)} />
              {mode.kind === 'raise' ? 'Email the customer asking them to pay it' : 'Email the customer the new figures'}
            </label>
            {mode.kind === 'edit' && !emailCustomer && (
              <p className="sox-muted" style={{ margin: 0, fontSize: '0.75rem' }}>
                The customer is not emailed. Their order page shows the new figures straight away.
              </p>
            )}
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={save}>
                {mode.kind === 'raise' ? 'Raise charge' : 'Save changes'}
              </button>
              <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setMode(null)}>Cancel</button>
            </div>
          </div>
        )}
      </div>
      {confirmDialog}
      {alertDialog}
    </section>
  )
}
