'use client'

import { useEffect, useState } from 'react'

type Category = { id: string; name: string; slug: string; parentId: string | null }

export function CategoriesScreen() {
  const [categories, setCategories] = useState<Category[]>([])

  function refresh() {
    fetch('/api/m/shop/admin/categories').then(async (r) => { if (r.ok) setCategories((await r.json()).categories) })
  }
  useEffect(refresh, [])

  async function createCategory() {
    const name = prompt('Category name?')
    if (!name) return
    await fetch('/api/m/shop/admin/categories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) })
    refresh()
  }

  async function rename(id: string, current: string) {
    const name = prompt('New name?', current)
    if (!name) return
    await fetch(`/api/m/shop/admin/categories/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, regenerateSlug: true }) })
    refresh()
  }

  async function remove(id: string) {
    if (!confirm('Delete this category?')) return
    const res = await fetch(`/api/m/shop/admin/categories/${id}`, { method: 'DELETE' })
    if (!res.ok) alert((await res.json()).error)
    refresh()
  }

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 className="page-title">Categories</h1>
        <button onClick={createCategory} className="btn btn-primary">New category</button>
      </div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.5rem' }}>
        {categories.map((c) => (
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
