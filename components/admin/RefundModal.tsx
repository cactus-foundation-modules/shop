'use client'

import { useState } from 'react'
import { formatMoney } from '@/modules/shop/lib/money'
import { useCurrencySymbol } from '@/modules/shop/components/admin/use-currency-symbol'
import { refundNoticeText, type ShpRefundNoticeSource } from '@/modules/shop/lib/payments/refund-notice'
import { paidPerUnit } from '@/modules/shop/lib/request-refund-lines'

type OrderItem = { id: string; productName: string; quantity: number; unitPrice: string; total: string; taxAmount: string; refundedQty: number; isPreOrder: boolean }

// What one unit of a line actually cost the customer - VAT included on an
// EXCLUSIVE shop, and less its share of any order-level discount. The same
// figure approving a customer's cancellation sends back (paidPerUnit in
// lib/request-refund-lines.ts has the reasoning). Without the discount, a full
// refund of a discounted order asked for more than the order took, and the
// refund caps turned the whole thing down.

// Per-item refund modal: quantity per item pre-filled against the remaining
// refundable amount, a reason, and provider-aware copy for manual methods.
export function RefundModal({ orderId, items, paymentMethod, refundNotice, taxMode, subtotal, discountAmount, refundableDelivery, onClose, onDone }: {
  orderId: string
  items: OrderItem[]
  paymentMethod: string
  // How the provider that took this payment handles refunds, from the order
  // route. Optional so an older response - or a screen that has not been taught
  // to pass it - still renders: the wording then promises nothing rather than
  // guessing, which is the whole point of the change.
  refundNotice?: ShpRefundNoticeSource
  taxMode: 'INCLUSIVE' | 'EXCLUSIVE'
  /** The order's goods subtotal and discount, which decide each line's share. */
  subtotal: string
  discountAmount: string
  /** How much of the delivery charge is still the customer's to be given back,
   *  tax included. Zero where there was none or it has all gone back. */
  refundableDelivery: number
  onClose: () => void
  onDone: () => void
}) {
  const perUnit = (item: OrderItem) => paidPerUnit(item, { taxMode, subtotal, discountAmount })
  const currencySymbol = useCurrencySymbol()
  const notice = refundNoticeText(paymentMethod, refundNotice ?? null)
  // A refund somebody has to send themselves is the one worth reading, so it
  // keeps the boxed treatment the two hardcoded methods used to get - and now
  // any provider that declares itself manual gets it, as does a method whose
  // provider cannot be found at all, where the owner has something to check.
  const isManualRefund = !refundNotice || refundNotice.mode === 'manual'
  const refundable = items.filter((i) => i.refundedQty < i.quantity)
  const [quantities, setQuantities] = useState<Record<string, number>>(Object.fromEntries(refundable.map((i) => [i.id, 0])))
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // The delivery charge, all of what is left of it or none. A cancelled order
  // is owed its delivery back; a single returned chair usually is not - so it
  // is the owner's tick, never assumed.
  const [withDelivery, setWithDelivery] = useState(false)
  // A refund already made in the provider's own dashboard. The provider never
  // says which items it was for, so this is how the owner tells the shop - and
  // then the stock, the credit note and the books follow as for any refund,
  // without asking the provider for the money a second time.
  const [alreadyRefunded, setAlreadyRefunded] = useState(false)

  const selected = refundable
    .map((item) => ({ item, quantity: quantities[item.id] ?? 0 }))
    .filter((x) => x.quantity > 0)
  const deliveryAmount = withDelivery ? refundableDelivery : 0
  const totalAmount = selected.reduce((sum, x) => sum + perUnit(x.item) * x.quantity, 0) + deliveryAmount

  async function submit() {
    if (selected.length === 0 && !(deliveryAmount > 0)) return
    setSaving(true)
    setError(null)
    const res = await fetch(`/api/m/shop/admin/orders/${orderId}/refund`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reason: reason || null,
        items: selected.map((x) => ({
          orderItemId: x.item.id,
          quantity: x.quantity,
          amount: Number((perUnit(x.item) * x.quantity).toFixed(2)),
        })),
        shippingAmount: deliveryAmount > 0 ? Number(deliveryAmount.toFixed(2)) : undefined,
        alreadyRefunded: alreadyRefunded || undefined,
      }),
    })
    setSaving(false)
    // The catch matters. A 500 does not necessarily carry a JSON body, and
    // without this res.json() throws INSIDE the click handler - so the modal
    // showed nothing at all, which is exactly how a hard failure came to look
    // like "I pressed refund and nothing happened".
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      setError(body.error ?? `Refund failed (${res.status}). Nothing has been refunded.`)
      return
    }
    onDone()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'var(--color-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{ background: 'var(--color-surface)', borderRadius: 8, width: '90vw', maxWidth: 560, maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0,0,0,.25)' }}>
        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>Refund order</h3>
          <button type="button" aria-label="Close" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.25rem', color: 'var(--color-text-secondary)' }}>×</button>
        </div>
        <div style={{ padding: '1.25rem', overflowY: 'auto', display: 'grid', gap: '0.75rem' }}>
          {isManualRefund ? (
            <p style={{ fontSize: '0.8125rem', background: 'var(--color-bg-subtle)', borderRadius: 6, padding: '0.5rem 0.75rem' }}>{notice}</p>
          ) : (
            <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>{notice}</p>
          )}
          {error && <p style={{ color: 'var(--color-danger)', fontSize: '0.875rem' }}>{error}</p>}
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ textAlign: 'left', borderBottom: '1px solid var(--color-border)' }}><th style={{ padding: '0.375rem' }}>Item</th><th>Remaining</th><th>Refund qty</th></tr></thead>
            <tbody>
              {refundable.map((item) => {
                const remaining = item.quantity - item.refundedQty
                return (
                  <tr key={item.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <td style={{ padding: '0.375rem' }}>{item.productName}</td>
                    <td>{remaining}</td>
                    <td>
                      <input
                        type="number" min={0} max={remaining} value={quantities[item.id] ?? 0}
                        onChange={(e) => setQuantities((prev) => ({ ...prev, [item.id]: Math.max(0, Math.min(remaining, Number(e.target.value))) }))}
                        style={{ width: 60, padding: '0.25rem 0.5rem', borderRadius: 6, border: '1px solid var(--color-border)' }}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {refundableDelivery > 0 && (
            <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <input type="checkbox" checked={withDelivery} onChange={(e) => setWithDelivery(e.target.checked)} />
              Refund the delivery charge too ({formatMoney(refundableDelivery, currencySymbol)})
            </label>
          )}
          {!isManualRefund && (
            <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', fontSize: '0.875rem' }}>
              <input type="checkbox" checked={alreadyRefunded} onChange={(e) => setAlreadyRefunded(e.target.checked)} style={{ marginTop: '0.2rem' }} />
              <span>
                Already refunded in {refundNotice?.label ?? 'the payment provider'}&rsquo;s own dashboard - just record it here.
                <span style={{ display: 'block', color: 'var(--color-text-secondary)' }}>
                  No money is sent. The items, stock and credit note follow as for any refund.
                </span>
              </span>
            </label>
          )}
          <label>Reason (optional)<textarea value={reason} onChange={(e) => setReason(e.target.value)} style={{ width: '100%', padding: '0.5rem', borderRadius: 6, border: '1px solid var(--color-border)', marginTop: '0.25rem' }} /></label>
          <p style={{ fontWeight: 600 }}>Total refund: {formatMoney(totalAmount, currencySymbol)}</p>
        </div>
        <div style={{ padding: '0.75rem 1.25rem', borderTop: '1px solid var(--color-border)', display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" disabled={saving || (selected.length === 0 && !(deliveryAmount > 0))} onClick={submit}>{saving ? 'Refunding…' : alreadyRefunded ? 'Record refund' : 'Confirm refund'}</button>
        </div>
      </div>
    </div>
  )
}
