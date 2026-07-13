'use client'

import { useEffect, useState } from 'react'
import { useConfirm, usePrompt, useAlert } from '@/modules/shop/components/admin/dialogs'

type Category = { id: string; name: string; slug: string; parentId: string | null }

export function CategoriesScreen() {
  const [categories, setCategories] = useState<Category[]>([])
  const [confirm, confirmNode] = useConfirm()
  const [promptText, promptNode] = usePrompt()
  const [showAlert, alertNode] = useAlert()

  function refresh() {
    fetch('/api/m/shop/admin/categories').then(async (r) => { if (r.ok) setCategories((await r.json()).categories) })
  }
  useEffect(refresh, [])

  async function createCategory() {
    const name = await promptText({ title: 'New category', placeholder: 'Category name', confirmLabel: 'Create' })
    if (!name) return
    await fetch('/api/m/shop/admin/categories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) })
    refresh()
  }

  async function rename(id: string, current: string) {
    const name = await promptText({ title: 'Rename category', defaultValue: current })
    if (!name) return
    await fetch(`/api/m/shop/admin/categories/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, regenerateSlug: true }) })
    refresh()
  }

  async function remove(id: string) {
    if (!(await confirm({ title: 'Delete category?', message: 'This category will be removed from the shop.' }))) return
    const res = await fetch(`/api/m/shop/admin/categories/${id}`, { method: 'DELETE' })
    if (!res.ok) await showAlert((await res.json()).error ?? 'Could not delete this category.', 'Delete failed')
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
              <button onClick={() => remove(c.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-danger)' }}>Delete</button>
            </span>
          </li>
        ))}
      </ul>
      {confirmNode}
      {promptNode}
      {alertNode}
    </div>
  )
}
