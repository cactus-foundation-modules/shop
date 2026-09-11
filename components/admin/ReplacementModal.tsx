'use client'

import { useEffect, useState } from 'react'
import { formatMoney } from '@/modules/shop/lib/money'
import { useCurrencySymbol } from '@/modules/shop/components/admin/use-currency-symbol'

export type ReplacementOrderLine = { id: string; productName: string; quantity: number }

type PartResult = { id: string; name: string; sku: string | null; stockCount: number | null; trackInventory: boolean }

type DraftLine = {
  key: string
  productId: string | null
  name: string
  quantity: number
  unitPrice: string
  replacesOrderItemId: string
}

// Sending a part out to put an order right.
//
// Deliberately not a copy of the refund modal, which works down the order's own
// lines because a refund can only ever be of something bought. A replacement is
// nearly always something else entirely - the gas lift out of the chair - so
// the lines here start empty and the order's own lines appear only as the
// "which one is this for" answer beside each.
//
// Free unless somebody types a price. That is the ordinary case by a mile, and
// a price box that started at the shelf price would invoice a customer for the
// shop's own mistake the first time anybody forgot to clear it.

let nextKey = 0
function blankLine(replacesOrderItemId: string): DraftLine {
  nextKey += 1
  return { key: `line-${nextKey}`, productId: null, name: '', quantity: 1, unitPrice: '', replacesOrderItemId }
}

export function ReplacementModal({ orderId, orderNumber, items, requestId, defaultItemIds, onClose, onDone }: {
  orderId: string
  orderNumber: string
  items: ReplacementOrderLine[]
  /** The damage report being answered, where the owner arrived from the queue. */
  requestId?: string | null
  /** The lines that report named, so the "which one is this for" box starts on
   *  the right answer instead of on nothing. */
  defaultItemIds?: string[]
  onClose: () => void
  onDone: (orderNumber: string) => void
}) {
  const currencySymbol = useCurrencySymbol()
  // The line a part is "for" when there is only one sensible answer: the one the
  // damage report named, or - on a single-line order - the only one there is.
  const defaultFor = defaultItemIds?.[0] ?? (items.length === 1 ? items[0]!.id : '')
  const [lines, setLines] = useState<DraftLine[]>([blankLine(defaultFor)])
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function patch(key: string, changes: Partial<DraftLine>) {
    setLines((prev) => prev.map((line) => (line.key === key ? { ...line, ...changes } : line)))
  }

  const ready = lines.some((line) => line.name.trim() !== '' || line.productId !== null)
  const chargeable = lines.reduce((sum, line) => sum + (Number(line.unitPrice) || 0) * line.quantity, 0)

  async function submit() {
    setSaving(true)
    setError(null)
    const res = await fetch(`/api/m/shop/admin/orders/${orderId}/replacement`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestId: requestId ?? null,
        note: note.trim() || null,
        lines: lines
          .filter((line) => line.name.trim() !== '' || line.productId !== null)
          .map((line) => ({
            productId: line.productId,
            name: line.name.trim() || null,
            quantity: line.quantity,
            // Empty means free, which is not the same statement as a typed 0 -
            // but both come to the same money, so there is nothing to preserve.
            unitPrice: line.unitPrice.trim() === '' ? null : Number(line.unitPrice),
            replacesOrderItemId: line.replacesOrderItemId || null,
          })),
      }),
    })
    setSaving(false)
    // Same catch as the refund modal, for the same reason: a 500 need not carry
    // a JSON body, and res.json() throwing inside the handler is how a hard
    // failure comes to look like "I pressed it and nothing happened".
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      setError(body.error ?? `That did not go through (${res.status}). Nothing has been sent.`)
      return
    }
    const body = (await res.json().catch(() => ({}))) as { orderNumber?: string }
    onDone(body.orderNumber ?? '')
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'var(--color-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div style={{ background: 'var(--color-surface)', borderRadius: 8, width: '90vw', maxWidth: 680, maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0,0,0,.25)' }}>
        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>Send a replacement for {orderNumber}</h3>
          <button type="button" aria-label="Close" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.25rem', color: 'var(--color-text-secondary)' }}>×</button>
        </div>

        <div style={{ padding: '1.25rem', overflowY: 'auto', display: 'grid', gap: '0.875rem' }}>
          <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
            This goes out as its own order, numbered off this one, and the customer can follow the parcel
            exactly as they followed the original. Free unless you put a price on it.
          </p>

          {error && <p style={{ color: 'var(--color-danger)', fontSize: '0.875rem', margin: 0 }}>{error}</p>}

          {lines.map((line) => (
            <div key={line.key} style={{ display: 'grid', gap: '0.5rem', border: '1px solid var(--color-border)', borderRadius: 6, padding: '0.75rem' }}>
              <PartField
                value={line.name}
                productId={line.productId}
                onPick={(part) => patch(line.key, { productId: part.id, name: part.name })}
                onType={(text) => patch(line.key, { productId: null, name: text })}
              />

              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <label style={{ display: 'grid', gap: '0.25rem', fontSize: '0.8125rem' }}>
                  <span>Quantity</span>
                  <input
                    type="number" min={1} max={999} value={line.quantity}
                    onChange={(e) => patch(line.key, { quantity: Math.max(1, Number(e.target.value) || 1) })}
                    style={{ width: 80, padding: '0.375rem 0.5rem', borderRadius: 6, border: '1px solid var(--color-border)' }}
                  />
                </label>

                <label style={{ display: 'grid', gap: '0.25rem', fontSize: '0.8125rem' }}>
                  <span>Price each</span>
                  <input
                    type="number" min={0} step="0.01" value={line.unitPrice} placeholder="Free"
                    onChange={(e) => patch(line.key, { unitPrice: e.target.value })}
                    style={{ width: 110, padding: '0.375rem 0.5rem', borderRadius: 6, border: '1px solid var(--color-border)' }}
                  />
                </label>

                <label style={{ display: 'grid', gap: '0.25rem', fontSize: '0.8125rem', flex: 1, minWidth: 200 }}>
                  <span>Putting right</span>
                  <select
                    value={line.replacesOrderItemId}
                    onChange={(e) => patch(line.key, { replacesOrderItemId: e.target.value })}
                    style={{ padding: '0.375rem 0.5rem', borderRadius: 6, border: '1px solid var(--color-border)' }}
                  >
                    <option value="">Nothing in particular</option>
                    {items.map((item) => (
                      <option key={item.id} value={item.id}>{item.productName}</option>
                    ))}
                  </select>
                </label>

                {lines.length > 1 && (
                  <button
                    type="button" className="btn btn-sm"
                    onClick={() => setLines((prev) => prev.filter((l) => l.key !== line.key))}
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          ))}

          <div>
            <button type="button" className="btn btn-sm" onClick={() => setLines((prev) => [...prev, blankLine(defaultFor)])}>
              Add another part
            </button>
          </div>

          <label style={{ display: 'grid', gap: '0.25rem', fontSize: '0.8125rem' }}>
            <span>A note for your own records (optional)</span>
            <textarea
              value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={2000}
              style={{ width: '100%', padding: '0.5rem', borderRadius: 6, border: '1px solid var(--color-border)' }}
            />
            <span className="field-hint">Goes on both orders. The customer never sees it.</span>
          </label>

          <p style={{ margin: 0, fontWeight: 600 }}>
            {chargeable > 0
              ? `Charging ${formatMoney(chargeable, currencySymbol)} before any tax`
              : 'Free of charge'}
          </p>
        </div>

        <div style={{ padding: '0.75rem 1.25rem', borderTop: '1px solid var(--color-border)', display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" disabled={saving || !ready} onClick={submit}>
            {saving ? 'Raising…' : 'Raise the replacement'}
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * One part: search the parts list, or type whatever is going in the box.
 *
 * Both, rather than one or the other. A shop that keeps its gas lifts as parts
 * wants the stock and the cost that come with picking one; a shop sending a
 * fixings pack it will never send again wants to type "fixings pack" and get
 * on with its day, and making that shop create a catalogue product first is how
 * a feature ends up unused.
 */
function PartField({ value, productId, onPick, onType }: {
  value: string
  productId: string | null
  onPick: (part: PartResult) => void
  onType: (text: string) => void
}) {
  const [results, setResults] = useState<PartResult[]>([])
  const [open, setOpen] = useState(false)

  useEffect(() => {
    // Nothing typed, or a part already chosen: no search to run, and nothing to
    // clear either - whether the list is SHOWN is decided at render, below, so
    // this effect never has to reach for setState on its way out.
    if (productId !== null || value.trim().length < 2) return
    let active = true
    // Debounced, because this fires on every keystroke of a name somebody is
    // still halfway through typing.
    const timer = setTimeout(() => {
      fetch(`/api/m/shop/admin/products?partsOnly=true&perPage=8&search=${encodeURIComponent(value.trim())}`)
        .then((res) => (res.ok ? res.json() : { products: [] }))
        .then((data: { products?: PartResult[] }) => { if (active) setResults(data.products ?? []) })
        .catch(() => { if (active) setResults([]) })
    }, 250)
    return () => { active = false; clearTimeout(timer) }
  }, [value, productId])

  return (
    <div style={{ position: 'relative' }}>
      <label style={{ display: 'grid', gap: '0.25rem', fontSize: '0.8125rem' }}>
        <span>What are you sending?</span>
        <input
          value={value}
          placeholder="Search your parts, or just type it"
          onChange={(e) => { onType(e.target.value); setResults([]); setOpen(true) }}
          onFocus={() => setOpen(true)}
          style={{ width: '100%', padding: '0.375rem 0.5rem', borderRadius: 6, border: '1px solid var(--color-border)' }}
        />
      </label>
      {productId !== null && (
        <p style={{ margin: '0.25rem 0 0', fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
          Picked from your parts - stock comes off when you dispatch it.
        </p>
      )}
      {open && results.length > 0 && productId === null && value.trim().length >= 2 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 6, marginTop: '0.25rem', maxHeight: 220, overflowY: 'auto' }}>
          {results.map((part) => (
            <button
              key={part.id} type="button"
              onClick={() => { onPick(part); setOpen(false); setResults([]) }}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '0.5rem 0.625rem', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.875rem' }}
            >
              {part.name}
              {part.sku && <span style={{ color: 'var(--color-text-secondary)' }}> · {part.sku}</span>}
              {part.trackInventory && part.stockCount !== null && (
                <span style={{ color: 'var(--color-text-secondary)' }}> · {part.stockCount} in stock</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
