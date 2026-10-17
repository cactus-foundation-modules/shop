'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// The list of products one of THIS product is made up of - its parts - with the
// number of each that go into one. Whether the product can be sold is whatever
// its scarcest part allows, and a purchase order for a sale buys the parts, not
// the product. See migration 075.
//
// Self-contained on purpose: it reads and saves through its own route rather
// than through the product form, so the same editor serves the product page
// and each row of a shop-variations listing (a variation is a product), and a
// parts change takes effect the moment it is saved instead of waiting for the
// rest of the form.

type Part = {
  componentProductId: string
  name: string
  sku: string | null
  supplierSku: string | null
  quantity: number
  trackInventory: boolean
  stockCount: number | null
  status: string
}

type Described = {
  parts: Part[]
  partOf: string[]
  stock: { tracked: boolean; count: number | null } | null
}

type Found = { id: string; name: string; sku: string | null; trackInventory: boolean; stockCount: number | null }

export type PartsSummary = { isKit: boolean; stock: Described['stock'] }

type Draft = { id: string; name: string; sku: string | null; quantity: string; trackInventory: boolean; stockCount: number | null }

const API = '/api/m/shop/admin/products'

function toDraft(p: Part): Draft {
  return { id: p.componentProductId, name: p.name, sku: p.sku, quantity: String(p.quantity), trackInventory: p.trackInventory, stockCount: p.stockCount }
}

function sameAsSaved(draft: Draft[], saved: Part[]): boolean {
  return draft.length === saved.length && draft.every((d, i) => d.id === saved[i]?.componentProductId && Number(d.quantity) === saved[i]?.quantity)
}

/** What one part has on the shelf, and how many kits that would make. */
function partStock(d: Draft): string {
  if (!d.trackInventory) return 'Not counted, so it never runs out'
  const have = Math.max(d.stockCount ?? 0, 0)
  const per = Math.max(Number(d.quantity) || 1, 1)
  return `${have} in stock, enough for ${Math.floor(have / per)}`
}

export function ProductPartsEditor({
  productId,
  onChange,
  compact = false,
}: {
  productId: string
  /** Mount with `key={productId}`: a different product is a different editor, and nothing here resets itself. */
  /** Told after every load and save, so a panel can show a derived stock count instead of a box to type one into. */
  onChange?: (summary: PartsSummary) => void
  compact?: boolean
}) {
  const [saved, setSaved] = useState<Part[] | null>(null)
  const [draft, setDraft] = useState<Draft[]>([])
  const [partOf, setPartOf] = useState<string[]>([])
  const [stock, setStock] = useState<Described['stock']>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Found[]>([])
  const [searching, setSearching] = useState(false)
  // The newest search wins: a slow answer to "ch" must not overwrite "chair".
  const searchSeq = useRef(0)
  const onChangeRef = useRef(onChange)
  useEffect(() => { onChangeRef.current = onChange }, [onChange])

  const apply = useCallback((data: Described) => {
    setSaved(data.parts)
    setDraft(data.parts.map(toDraft))
    setPartOf(data.partOf)
    setStock(data.stock)
    onChangeRef.current?.({ isKit: data.parts.length > 0, stock: data.stock })
  }, [])

  useEffect(() => {
    let live = true
    void (async () => {
      try {
        const res = await fetch(`${API}/${encodeURIComponent(productId)}/components`)
        if (!res.ok) throw new Error()
        const data = (await res.json()) as Described
        if (live) apply(data)
      } catch {
        if (live) setLoadError('Could not load the parts for this product.')
      }
    })()
    return () => { live = false }
  }, [productId, apply])

  async function search(q: string) {
    setQuery(q)
    const seq = ++searchSeq.current
    if (!q.trim()) { setResults([]); setSearching(false); return }
    setSearching(true)
    try {
      const res = await fetch(`${API}?search=${encodeURIComponent(q)}`)
      if (!res.ok || seq !== searchSeq.current) return
      const data = (await res.json()) as { products: Found[] }
      setResults(data.products.filter((p) => p.id !== productId && !draft.some((d) => d.id === p.id)).slice(0, 12))
    } finally {
      if (seq === searchSeq.current) setSearching(false)
    }
  }

  function add(found: Found) {
    setDraft((d) => [...d, { id: found.id, name: found.name, sku: found.sku, quantity: '1', trackInventory: found.trackInventory, stockCount: found.stockCount }])
    setQuery('')
    setResults([])
    setMessage(null)
  }

  async function save() {
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch(`${API}/${encodeURIComponent(productId)}/components`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parts: draft.map((d) => ({ productId: d.id, quantity: Math.trunc(Number(d.quantity)) })) }),
      })
      const data = (await res.json().catch(() => ({}))) as Partial<Described> & { error?: string }
      if (!res.ok) { setMessage({ kind: 'error', text: data.error ?? 'Could not save the parts.' }); return }
      apply(data as Described)
      setMessage({ kind: 'ok', text: draft.length === 0 ? 'Saved. This is an ordinary product again.' : 'Saved.' })
    } catch {
      setMessage({ kind: 'error', text: 'Could not save the parts.' })
    } finally {
      setSaving(false)
    }
  }

  if (loadError) return <p role="alert" style={{ color: 'var(--color-error, var(--color-text))', fontSize: '0.875rem' }}>{loadError}</p>
  if (!saved) return <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>Loading…</p>

  const dirty = !sameAsSaved(draft, saved)
  const badQuantity = draft.some((d) => !Number.isInteger(Number(d.quantity)) || Number(d.quantity) < 1)

  if (partOf.length > 0) {
    return (
      <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', margin: 0 }}>
        This is a part of {partOf.slice(0, 3).map((n) => `"${n}"`).join(', ')}{partOf.length > 3 ? ' and others' : ''}, so it cannot also be made up of other products.
      </p>
    )
  }

  return (
    <div style={{ display: 'grid', gap: '0.5rem' }}>
      {draft.length === 0 && !compact && (
        <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', margin: 0 }}>
          Not made up of anything. Add parts below if this is sold as a set of other products - it will then follow their stock.
        </p>
      )}
      {draft.map((d, i) => (
        <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--color-bg-subtle)', borderRadius: 6, padding: '0.375rem 0.5rem', flexWrap: 'wrap' }}>
          <span style={{ flex: '1 1 14rem', minWidth: 0, fontSize: '0.875rem' }}>
            <strong style={{ fontWeight: 600 }}>{d.name}</strong>
            {d.sku ? <span style={{ color: 'var(--color-text-secondary)' }}> · {d.sku}</span> : null}
            <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>{partStock(d)}</span>
          </span>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.8125rem' }}>
            <span>Per set</span>
            <input
              inputMode="numeric"
              aria-label={`How many of ${d.name} go into one`}
              value={d.quantity}
              onChange={(e) => setDraft((all) => all.map((x, j) => (j === i ? { ...x, quantity: e.target.value } : x)))}
              style={{ width: '4rem', padding: '0.25rem 0.5rem', borderRadius: 6, border: '1px solid var(--color-border)' }}
            />
          </label>
          <button type="button" onClick={() => { setDraft((all) => all.filter((_, j) => j !== i)); setMessage(null) }} style={smallButton}>Remove</button>
        </div>
      ))}

      <div style={{ position: 'relative' }}>
        <input
          value={query}
          aria-label="Search for a product to add as a part"
          onChange={(e) => void search(e.target.value)}
          placeholder="Search by name or SKU to add a part…"
          style={{ width: '100%', padding: '0.375rem 0.625rem', borderRadius: 6, border: '1px solid var(--color-border)' }}
        />
        {query.trim() && (searching || results.length > 0) && (
          <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 6, marginTop: '0.25rem', maxHeight: 220, overflowY: 'auto' }}>
            {searching && <div style={{ padding: '0.5rem', fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>Searching…</div>}
            {!searching && results.map((p) => (
              <button key={p.id} type="button" onClick={() => add(p)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '0.5rem 0.625rem', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.875rem', color: 'var(--color-text)' }}>
                {p.name}{p.sku ? <span style={{ color: 'var(--color-text-secondary)' }}> · {p.sku}</span> : null}
              </button>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        <button type="button" onClick={() => void save()} disabled={!dirty || saving || badQuantity} style={{ ...smallButton, fontWeight: 600 }}>
          {saving ? 'Saving…' : 'Save parts'}
        </button>
        {badQuantity && <span role="alert" style={{ fontSize: '0.8125rem' }}>Each part needs a whole number of 1 or more.</span>}
        {message && (
          <span role={message.kind === 'error' ? 'alert' : 'status'} style={{ fontSize: '0.8125rem', color: message.kind === 'error' ? 'var(--color-error, var(--color-text))' : 'var(--color-text-secondary)' }}>
            {message.text}
          </span>
        )}
        {saved.length > 0 && !dirty && stock && (
          <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
            {stock.tracked ? `Can make ${stock.count ?? 0} right now.` : 'None of the parts are counted, so this never runs out.'}
          </span>
        )}
      </div>
    </div>
  )
}

const smallButton: React.CSSProperties = {
  background: 'none',
  border: '1px solid var(--color-border)',
  borderRadius: 6,
  padding: '0.25rem 0.625rem',
  cursor: 'pointer',
  fontSize: '0.8125rem',
  color: 'var(--color-text)',
}
