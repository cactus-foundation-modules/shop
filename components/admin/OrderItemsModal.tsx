'use client'

import { useEffect, useRef, useState } from 'react'
import { formatMoney } from '@/modules/shop/lib/money'
import type { OrderItemsPreview } from '@/modules/shop/lib/order-items-preview'

// What was in an order, opened from the item count on the orders list: enough
// to answer "which chairs were those?" without leaving the list and losing
// one's place in it. The full order is a link away for anything more.
// Styled by the `sox-im-` rules in orders-screen-css.

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready'; preview: OrderItemsPreview }

export function OrderItemsModal({ orderId, orderNumber, orderHref, currencySymbol, onClose }: {
  orderId: string
  orderNumber: string
  orderHref: string
  currencySymbol: string
  onClose: () => void
}) {
  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/m/shop/admin/orders/${encodeURIComponent(orderId)}/items`)
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status))
        const preview = (await r.json()) as OrderItemsPreview
        if (!cancelled) setState({ kind: 'ready', preview })
      })
      .catch(() => { if (!cancelled) setState({ kind: 'error' }) })
    return () => { cancelled = true }
  }, [orderId])

  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const lines = state.kind === 'ready' ? state.preview.lines : []
  const unitCount = lines.reduce((n, l) => n + l.quantity, 0)

  return (
    <div className="sox-im-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="sox-im" role="dialog" aria-modal="true" aria-labelledby="sox-im-title">
        <div className="sox-im-head">
          <h2 id="sox-im-title" className="sox-im-title">Order {orderNumber}</h2>
          {state.kind === 'ready' && (
            <p className="sox-sub">{unitCount} item{unitCount === 1 ? '' : 's'} across {lines.length} product{lines.length === 1 ? '' : 's'}</p>
          )}
        </div>

        <div className="sox-im-body">
          {state.kind === 'loading' && <p className="sox-im-note">Fetching what was ordered…</p>}
          {state.kind === 'error' && <p className="sox-im-note">Those products could not be loaded. Try again in a moment, or open the order.</p>}
          {state.kind === 'ready' && lines.length === 0 && <p className="sox-im-note">This order has no products on it.</p>}
          {lines.length > 0 && (
            <ul className="sox-im-list">
              {lines.map((line) => (
                <li key={line.id} className="sox-im-line">
                  {line.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- media can live on any storage host
                    <img className="sox-im-thumb" src={line.imageUrl} alt="" loading="lazy" />
                  ) : (
                    <span className="sox-im-thumb sox-im-thumb-empty" aria-hidden="true" />
                  )}
                  <span className="sox-im-qty">{line.quantity} ×</span>
                  <div className="sox-im-main">
                    <span className="sox-im-name">{line.productName}</span>
                    {line.productSku && <p className="sox-sub sox-mono">{line.productSku}</p>}
                    {line.options.map((o, i) => (
                      <p key={i} className="sox-sub"><span className="sox-im-opt">{o.label}:</span> {o.value}</p>
                    ))}
                    {(line.isPreOrder || line.refundedQty > 0) && (
                      <div className="sox-badges sox-im-badges">
                        {line.isPreOrder && <span className="badge badge-info">Pre-order</span>}
                        {line.refundedQty > 0 && <span className="badge badge-warning">{line.refundedQty} refunded</span>}
                      </div>
                    )}
                  </div>
                  <span className="sox-im-total">{formatMoney(line.total, currencySymbol)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="sox-im-foot">
          <a className="btn btn-secondary btn-sm" href={orderHref}>Open order</a>
          <button ref={closeRef} type="button" className="btn btn-primary btn-sm" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}
