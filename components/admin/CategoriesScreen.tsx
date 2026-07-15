'use client'

import { useEffect, useState } from 'react'
import { useConfirm, usePrompt, useAlert } from '@/modules/shop/components/admin/dialogs'

type Category = {
  id: string
  name: string
  slug: string
  parentId: string | null
  productDisplayMode: 'rollup' | 'exact' | null
  position: number
}

type DisplayModeChoice = '' | 'rollup' | 'exact'

const MODE_LABEL: Record<'rollup' | 'exact', string> = {
  rollup: 'Includes sub-categories',
  exact: 'Direct products only',
}

export function CategoriesScreen() {
  const [categories, setCategories] = useState<Category[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editParentId, setEditParentId] = useState<string>('')
  const [editMode, setEditMode] = useState<DisplayModeChoice>('')
  const [confirm, confirmNode] = useConfirm()
  const [promptText, promptNode] = usePrompt()
  const [showAlert, alertNode] = useAlert()

  function refresh() {
    fetch('/api/m/shop/admin/categories').then(async (r) => { if (r.ok) setCategories((await r.json()).categories) })
  }
  useEffect(refresh, [])

  // Ordered children of a parent (the API already sorts by position then name).
  const childrenOf = (parentId: string | null) => categories.filter((c) => c.parentId === parentId)

  // Every descendant id of a category, so we can keep it (and its sub-tree) out
  // of its own "move under" choices and count the sub-tree before a delete.
  function descendantIds(id: string): string[] {
    const out: string[] = []
    const walk = (pid: string) => {
      for (const child of childrenOf(pid)) { out.push(child.id); walk(child.id) }
    }
    walk(id)
    return out
  }

  // Depth-first flatten in display order, carrying each row's nesting depth.
  function flatten(): Array<{ cat: Category; depth: number }> {
    const rows: Array<{ cat: Category; depth: number }> = []
    const walk = (parentId: string | null, depth: number) => {
      for (const cat of childrenOf(parentId)) { rows.push({ cat, depth }); walk(cat.id, depth + 1) }
    }
    walk(null, 0)
    return rows
  }

  async function createCategory(parentId: string | null) {
    const name = await promptText({
      title: parentId ? 'New sub-category' : 'New category',
      placeholder: 'Category name',
      confirmLabel: 'Create',
    })
    if (!name) return
    await fetch('/api/m/shop/admin/categories', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, parentId }),
    })
    refresh()
  }

  async function rename(id: string, current: string) {
    const name = await promptText({ title: 'Rename category', defaultValue: current })
    if (!name) return
    await fetch(`/api/m/shop/admin/categories/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, regenerateSlug: true }),
    })
    refresh()
  }

  function openEditor(cat: Category) {
    setEditingId(cat.id)
    setEditParentId(cat.parentId ?? '')
    setEditMode(cat.productDisplayMode ?? '')
  }

  async function saveEditor(id: string) {
    const res = await fetch(`/api/m/shop/admin/categories/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parentId: editParentId || null, productDisplayMode: editMode || null }),
    })
    if (!res.ok) { await showAlert((await res.json()).error ?? 'Could not save this category.', 'Save failed'); return }
    setEditingId(null)
    refresh()
  }

  // Swap a category with the sibling above/below it and persist the new order.
  async function move(cat: Category, direction: -1 | 1) {
    const siblings = childrenOf(cat.parentId)
    const index = siblings.findIndex((s) => s.id === cat.id)
    const target = index + direction
    if (index < 0 || target < 0 || target >= siblings.length) return
    const reordered = [...siblings]
    const a = reordered[index]
    const b = reordered[target]
    if (!a || !b) return
    reordered[index] = b
    reordered[target] = a
    // Optimistic: reflect the swap immediately, then persist.
    setCategories((prev) => {
      const order = new Map(reordered.map((s, i) => [s.id, i]))
      return prev.map((c) => (order.has(c.id) ? { ...c, position: order.get(c.id)! } : c))
        .sort((a, b) => (a.position - b.position) || a.name.localeCompare(b.name))
    })
    await fetch('/api/m/shop/admin/categories/reorder', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderedIds: reordered.map((s) => s.id) }),
    })
    refresh()
  }

  async function remove(cat: Category) {
    const childCount = descendantIds(cat.id).length
    const message = childCount > 0
      ? `"${cat.name}" and its ${childCount} sub-categor${childCount === 1 ? 'y' : 'ies'} will be removed. Any products filed in them stay in your catalogue - they just lose this filing.`
      : `"${cat.name}" will be removed. Any products filed in it stay in your catalogue - they just lose this filing.`
    if (!(await confirm({ title: 'Delete category?', message }))) return
    const res = await fetch(`/api/m/shop/admin/categories/${cat.id}`, { method: 'DELETE' })
    if (!res.ok) await showAlert((await res.json()).error ?? 'Could not delete this category.', 'Delete failed')
    if (editingId === cat.id) setEditingId(null)
    refresh()
  }

  const rows = flatten()
  const iconBtn: React.CSSProperties = { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', padding: '0 0.25rem', fontSize: '0.8125rem' }

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 className="page-title">Categories</h1>
        <button onClick={() => createCategory(null)} className="btn btn-primary">New category</button>
      </div>

      {rows.length === 0 && <p style={{ color: 'var(--color-text-muted)' }}>No categories yet. Add one to start grouping your products.</p>}

      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.5rem' }}>
        {rows.map(({ cat, depth }) => {
          const siblings = childrenOf(cat.parentId)
          const index = siblings.findIndex((s) => s.id === cat.id)
          const isEditing = editingId === cat.id
          const blocked = new Set([cat.id, ...descendantIds(cat.id)])
          return (
            <li
              key={cat.id}
              style={{
                border: '1px solid var(--color-border)', borderRadius: 8,
                padding: '0.5rem 1rem', marginLeft: `${depth * 1.5}rem`,
                background: 'var(--color-surface)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
                  {depth > 0 && <span aria-hidden style={{ color: 'var(--color-text-muted)' }}>↳</span>}
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cat.name}</span>
                  {cat.productDisplayMode && (
                    <span className="badge badge-default" style={{ fontSize: '0.6875rem' }}>{MODE_LABEL[cat.productDisplayMode]}</span>
                  )}
                </span>
                <span style={{ display: 'flex', gap: '0.25rem', alignItems: 'center', flexShrink: 0 }}>
                  <button onClick={() => move(cat, -1)} disabled={index <= 0} style={{ ...iconBtn, opacity: index <= 0 ? 0.3 : 1 }} title="Move up" aria-label="Move up">↑</button>
                  <button onClick={() => move(cat, 1)} disabled={index >= siblings.length - 1} style={{ ...iconBtn, opacity: index >= siblings.length - 1 ? 0.3 : 1 }} title="Move down" aria-label="Move down">↓</button>
                  <button onClick={() => createCategory(cat.id)} style={iconBtn}>Add sub</button>
                  <button onClick={() => rename(cat.id, cat.name)} style={iconBtn}>Rename</button>
                  <button onClick={() => (isEditing ? setEditingId(null) : openEditor(cat))} style={iconBtn}>{isEditing ? 'Close' : 'Edit'}</button>
                  <button onClick={() => remove(cat)} style={{ ...iconBtn, color: 'var(--color-danger)' }}>Delete</button>
                </span>
              </div>

              {isEditing && (
                <div style={{ display: 'grid', gap: '0.75rem', marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--color-border)' }}>
                  <label style={{ display: 'grid', gap: '0.25rem' }}>
                    <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>Sits under</span>
                    <select
                      value={editParentId}
                      onChange={(e) => setEditParentId(e.target.value)}
                      style={{ padding: '0.375rem 0.5rem', border: '1px solid var(--color-border)', borderRadius: 6, fontSize: '0.875rem', fontFamily: 'inherit', background: 'var(--color-bg)', color: 'var(--color-text)' }}
                    >
                      <option value="">Top level (no parent)</option>
                      {categories.filter((c) => !blocked.has(c.id)).map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </label>
                  <label style={{ display: 'grid', gap: '0.25rem' }}>
                    <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>Products shown on this category&apos;s page</span>
                    <select
                      value={editMode}
                      onChange={(e) => setEditMode(e.target.value as DisplayModeChoice)}
                      style={{ padding: '0.375rem 0.5rem', border: '1px solid var(--color-border)', borderRadius: 6, fontSize: '0.875rem', fontFamily: 'inherit', background: 'var(--color-bg)', color: 'var(--color-text)' }}
                    >
                      <option value="">Use the shop default</option>
                      <option value="rollup">This category and all its sub-categories</option>
                      <option value="exact">Only products filed directly here</option>
                    </select>
                  </label>
                  <div>
                    <button onClick={() => saveEditor(cat.id)} className="btn btn-primary" style={{ fontSize: '0.875rem' }}>Save</button>
                  </div>
                </div>
              )}
            </li>
          )
        })}
      </ul>
      {confirmNode}
      {promptNode}
      {alertNode}
    </div>
  )
}
