'use client'

import { useEffect, useState } from 'react'

const PAGES = [
  { key: 'index', label: 'Shop index' },
  { key: 'product', label: 'Product detail' },
  { key: 'checkout', label: 'Checkout' },
  { key: 'confirmation', label: 'Confirmation' },
] as const

// v0.1 simplification: a raw JSON editor for the stored Puck data rather than
// an embedded drag-and-drop <Puck> editor (Gazette's PostEditor pattern) -
// noted in FIELD_NOTES.md as a follow-up rather than block the rest of the module.
export function PageLayoutsScreen() {
  const [key, setKey] = useState<(typeof PAGES)[number]['key']>('index')
  const [json, setJson] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resetting transient UI state when the selected page changes, before the fetch below
    setSaved(false)
    setError(null)
    fetch(`/api/m/shop/admin/page-layouts/${key}`).then(async (r) => {
      if (r.ok) setJson(JSON.stringify((await r.json()).layout.builderData, null, 2))
    })
  }, [key])

  async function save() {
    let builderData: unknown
    try {
      builderData = JSON.parse(json)
    } catch {
      setError('Invalid JSON')
      return
    }
    setError(null)
    const res = await fetch(`/api/m/shop/admin/page-layouts/${key}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ builderData }) })
    setSaved(res.ok)
    if (!res.ok) setError((await res.json()).error)
  }

  return (
    <div>
      <div className="page-header"><h1 className="page-title">Storefront page layouts</h1></div>
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        {PAGES.map((p) => (
          <button key={p.key} onClick={() => setKey(p.key)} style={{ fontWeight: key === p.key ? 700 : 400, background: 'none', border: 'none', cursor: 'pointer' }}>{p.label}</button>
        ))}
      </div>
      {error && <p style={{ color: 'var(--color-danger, #c00)' }}>{error}</p>}
      {saved && <p style={{ color: 'var(--color-text-muted)' }}>Saved.</p>}
      <textarea value={json} onChange={(e) => setJson(e.target.value)} style={{ width: '100%', minHeight: 400, fontFamily: 'monospace', fontSize: '0.8125rem', padding: '0.75rem', borderRadius: 6, border: '1px solid var(--color-border)' }} />
      <button onClick={save} style={{ marginTop: '0.75rem', background: 'var(--color-primary)', color: 'var(--color-primary-contrast, #fff)', border: 'none', borderRadius: 8, padding: '0.625rem 1.25rem', fontWeight: 600, cursor: 'pointer' }}>
        Save layout
      </button>
    </div>
  )
}
