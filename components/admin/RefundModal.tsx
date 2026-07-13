'use client'

import { useState } from 'react'
import { formatMoney } from '@/modules/shop/lib/money'
import { useCurrencySymbol } from '@/modules/shop/components/admin/use-currency-symbol'

type OrderItem = { id: string; productName: string; quantity: number; unitPrice: string; total: string; refundedQty: number; isPreOrder: boolean }

const MANUAL_METHOD_COPY: Record<string, string> = {
  BANK_TRANSFER: 'This is a bank transfer order - refunding here just records it. You still need to send the money back yourself.',
  CASH: 'This is a cash order - refunding here just records it. You still need to hand back the cash yourself.',
}

// Per-item refund modal: quantity per item pre-filled against the remaining
// refundable amount, a reason, and provider-aware copy for manual methods.
export function RefundModal({ orderId, items, paymentMethod, onClose, onDone }: {
  orderId: string
  items: OrderItem[]
  paymentMethod: string
  onClose: () => void
  onDone: () => void
}) {
  const currencySymbol = useCurrencySymbol()
  const refundable = items.filter((i) => i.refundedQty < i.quantity)
  const [quantities, setQuantities] = useState<Record<string, number>>(Object.fromEntries(refundable.map((i) => [i.id, 0])))
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selected = refundable
    .map((item) => ({ item, quantity: quantities[item.id] ?? 0 }))
    .filter((x) => x.quantity > 0)
  const totalAmount = selected.reduce((sum, x) => sum + Number(x.item.unitPrice) * x.quantity, 0)

  async function submit() {
    if (selected.length === 0) return
    setSaving(true)
    setError(null)
    const res = await fetch(`/api/m/shop/admin/orders/${orderId}/refund`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reason: reason || null,
        items: selected.map((x) => ({ orderItemId: x.item.id, quantity: x.quantity, amount: Number((Number(x.item.unitPrice) * x.quantity).toFixed(2)) })),
      }),
    })
    setSaving(false)
    if (!res.ok) { setError((await res.json()).error ?? 'Refund failed'); return }
    onDone()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'var(--color-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{ background: 'var(--color-surface)', borderRadius: 8, width: '90vw', maxWidth: 560, maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0,0,0,.25)' }}>
        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>Refund order</h3>
          <button type="button" aria-label="Close" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.25rem', color: 'var(--color-text-muted)' }}>×</button>
        </div>
        <div style={{ padding: '1.25rem', overflowY: 'auto', display: 'grid', gap: '0.75rem' }}>
          {MANUAL_METHOD_COPY[paymentMethod] && (
            <p style={{ fontSize: '0.8125rem', background: 'var(--color-bg-subtle)', borderRadius: 6, padding: '0.5rem 0.75rem' }}>{MANUAL_METHOD_COPY[paymentMethod]}</p>
          )}
          {!MANUAL_METHOD_COPY[paymentMethod] && (
            <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>This will be refunded automatically via {paymentMethod === 'STRIPE' ? 'Stripe' : 'PayPal'}.</p>
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
          <label>Reason (optional)<textarea value={reason} onChange={(e) => setReason(e.target.value)} style={{ width: '100%', padding: '0.5rem', borderRadius: 6, border: '1px solid var(--color-border)', marginTop: '0.25rem' }} /></label>
          <p style={{ fontWeight: 600 }}>Total refund: {formatMoney(totalAmount, currencySymbol)}</p>
        </div>
        <div style={{ padding: '0.75rem 1.25rem', borderTop: '1px solid var(--color-border)', display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" disabled={saving || selected.length === 0} onClick={submit}>{saving ? 'Refunding…' : 'Confirm refund'}</button>
        </div>
      </div>
    </div>
  )
}
