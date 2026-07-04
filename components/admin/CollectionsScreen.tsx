'use client'

import { useEffect, useState } from 'react'

type Collection = { id: string; name: string; slug: string }

export function CollectionsScreen() {
  const [collections, setCollections] = useState<Collection[]>([])

  function refresh() {
    fetch('/api/m/shop/admin/collections').then(async (r) => { if (r.ok) setCollections((await r.json()).collections) })
  }
  useEffect(refresh, [])

  async function createCollection() {
    const name = prompt('Collection name?')
    if (!name) return
    await fetch('/api/m/shop/admin/collections', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) })
    refresh()
  }

  async function rename(id: string, current: string) {
    const name = prompt('New name?', current)
    if (!name) return
    await fetch(`/api/m/shop/admin/collections/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, regenerateSlug: true }) })
    refresh()
  }

  async function remove(id: string) {
    if (!confirm('Delete this collection?')) return
    await fetch(`/api/m/shop/admin/collections/${id}`, { method: 'DELETE' })
    refresh()
  }

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 className="page-title">Collections</h1>
        <button onClick={createCollection} className="btn btn-primary">New collection</button>
      </div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.5rem' }}>
        {collections.map((c) => (
          <li key={c.id} style={{ display: 'flex', justifyContent: 'space-between', border: '1px solid var(--color-border)', borderRadius: 8, padding: '0.5rem 1rem' }}>
            <span>{c.name}</span>
            <span style={{ display: 'flex', gap: '0.75rem' }}>
              <button onClick={() => rename(c.id, c.name)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>Rename</button>
              <button onClick={() => remove(c.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-danger, #c00)' }}>Delete</button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
