'use client'

import { useState } from 'react'

type PickedProduct = { id: string; name: string }

// Search-to-add product picker used by the Recommendations panel (related /
// upsell / auto-exclude lists) - searches the existing admin products list
// route rather than a dedicated endpoint.
export function ProductPicker({
  excludeId, value, onChange, reorderable = false, label,
}: {
  excludeId: string
  value: PickedProduct[]
  onChange: (next: PickedProduct[]) => void
  reorderable?: boolean
  label: string
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PickedProduct[]>([])
  const [searching, setSearching] = useState(false)

  async function search(q: string) {
    setQuery(q)
    if (!q) { setResults([]); return }
    setSearching(true)
    const res = await fetch(`/api/m/shop/admin/products?search=${encodeURIComponent(q)}`)
    setSearching(false)
    if (!res.ok) return
    const data = await res.json()
    setResults(data.products.filter((p: { id: string }) => p.id !== excludeId))
  }

  function add(product: PickedProduct) {
    if (value.some((p) => p.id === product.id)) return
    onChange([...value, { id: product.id, name: product.name }])
    setQuery('')
    setResults([])
  }

  function remove(id: string) {
    onChange(value.filter((p) => p.id !== id))
  }

  function move(index: number, dir: -1 | 1) {
    const target = index + dir
    if (target < 0 || target >= value.length) return
    const next = [...value]
    const [item] = next.splice(index, 1)
    if (!item) return
    next.splice(target, 0, item)
    onChange(next)
  }

  return (
    <div style={{ display: 'grid', gap: '0.375rem' }}>
      <span style={{ fontSize: '0.8125rem', fontWeight: 600 }}>{label}</span>
      {value.map((p, i) => (
        <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--color-bg-subtle)', borderRadius: 6, padding: '0.375rem 0.5rem' }}>
          <span style={{ flex: 1, fontSize: '0.875rem' }}>{p.name}</span>
          {reorderable && (
            <>
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} style={iconButton}>↑</button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === value.length - 1} style={iconButton}>↓</button>
            </>
          )}
          <button type="button" onClick={() => remove(p.id)} style={iconButton}>Remove</button>
        </div>
      ))}
      <div style={{ position: 'relative' }}>
        <input
          value={query}
          onChange={(e) => void search(e.target.value)}
          placeholder="Search products to add…"
          style={{ width: '100%', padding: '0.375rem 0.625rem', borderRadius: 6, border: '1px solid var(--color-border)' }}
        />
        {(searching || results.length > 0) && query && (
          <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 6, marginTop: '0.25rem', maxHeight: 200, overflowY: 'auto' }}>
            {searching && <div style={{ padding: '0.5rem', fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>Searching…</div>}
            {!searching && results.map((p) => (
              <button key={p.id} type="button" onClick={() => add(p)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '0.5rem 0.625rem', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.875rem' }}>
                {p.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

const iconButton: React.CSSProperties = { background: 'none', border: '1px solid var(--color-border)', borderRadius: 4, padding: '0.125rem 0.375rem', cursor: 'pointer', fontSize: '0.75rem' }
