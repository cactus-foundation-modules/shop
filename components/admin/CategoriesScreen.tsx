'use client'

import { useEffect, useMemo, useState, type CSSProperties, type DragEvent as ReactDragEvent, type ReactNode } from 'react'
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

const inputStyle: CSSProperties = {
  padding: '0.375rem 0.5rem', border: '1px solid var(--color-border)', borderRadius: 6,
  fontSize: '0.875rem', fontFamily: 'inherit', background: 'var(--color-bg)', color: 'var(--color-text)',
}

// Case-insensitive substring highlight for the search box - keeps the plain
// string intact when nothing matches so non-searched rows render as normal text.
function highlight(text: string, query: string): ReactNode {
  if (!query) return text
  const i = text.toLowerCase().indexOf(query.toLowerCase())
  if (i < 0) return text
  return (
    <>
      {text.slice(0, i)}
      <mark style={{ background: 'var(--color-warning-bg)', color: 'inherit', padding: '0 1px', borderRadius: 2 }}>
        {text.slice(i, i + query.length)}
      </mark>
      {text.slice(i + query.length)}
    </>
  )
}

export function CategoriesScreen() {
  const [categories, setCategories] = useState<Category[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [search, setSearch] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [editingId, setEditingId] = useState<string | null>(null)
  // Drag-and-drop reordering / re-nesting. `dragId` is the row being carried;
  // `dropTarget` is the row currently hovered plus which third of it the pointer
  // is over - 'before'/'after' drop as a sibling of the target, 'inside' files
  // the dragged category under the target.
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<{ id: string; zone: 'before' | 'inside' | 'after' } | null>(null)
  const [editName, setEditName] = useState('')
  const [editParentId, setEditParentId] = useState<string>('')
  const [editMode, setEditMode] = useState<DisplayModeChoice>('')
  const [confirm, confirmNode] = useConfirm()
  const [promptText, promptNode] = usePrompt()
  const [showAlert, alertNode] = useAlert()

  function refresh() {
    fetch('/api/m/shop/admin/categories').then(async (r) => {
      if (!r.ok) return
      const data = await r.json()
      setCategories(data.categories)
      setCounts(data.productCounts ?? {})
    })
  }
  useEffect(refresh, [])

  // Ordered children of a parent (the API already sorts by position then name).
  const childrenOf = (parentId: string | null) => categories.filter((c) => c.parentId === parentId)
  const hasChildren = (id: string) => categories.some((c) => c.parentId === id)

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

  const query = search.trim().toLowerCase()

  // When searching, a row stays visible if it matches or if any descendant
  // matches (so the path down to a hit is never hidden). Matched branches also
  // ignore the collapsed state, so hits are always on screen.
  const visibleIds = useMemo(() => {
    if (!query) return null
    const keep = new Set<string>()
    const matches = (c: Category) => c.name.toLowerCase().includes(query)
    const mark = (c: Category): boolean => {
      const kids = categories.filter((k) => k.parentId === c.id)
      const childHit = kids.map(mark).some(Boolean)
      const hit = matches(c) || childHit
      if (hit) keep.add(c.id)
      return hit
    }
    categories.filter((c) => c.parentId === null).forEach(mark)
    return keep
  }, [categories, query])

  // Depth-first flatten in display order, carrying each row's nesting depth.
  // Honours the collapsed set (unless a search is active) and the search filter.
  function flatten(): Array<{ cat: Category; depth: number }> {
    const rows: Array<{ cat: Category; depth: number }> = []
    const walk = (parentId: string | null, depth: number) => {
      for (const cat of childrenOf(parentId)) {
        if (visibleIds && !visibleIds.has(cat.id)) continue
        rows.push({ cat, depth })
        const open = query ? true : !collapsed.has(cat.id)
        if (open) walk(cat.id, depth + 1)
      }
    }
    walk(null, 0)
    return rows
  }

  function toggleCollapse(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const allParentIds = categories.filter((c) => hasChildren(c.id)).map((c) => c.id)
  const anyCollapsed = allParentIds.some((id) => collapsed.has(id))
  function expandAll() { setCollapsed(new Set()) }
  function collapseAll() { setCollapsed(new Set(allParentIds)) }

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
    if (parentId) setCollapsed((prev) => { const n = new Set(prev); n.delete(parentId); return n })
    refresh()
  }

  function openEditor(cat: Category) {
    setEditingId(cat.id)
    setEditName(cat.name)
    setEditParentId(cat.parentId ?? '')
    setEditMode(cat.productDisplayMode ?? '')
  }

  // One save covers rename, re-parent and display mode - the row's whole edit
  // panel. The slug is only regenerated when the name actually changed.
  async function saveEditor(cat: Category) {
    const name = editName.trim()
    if (!name) { await showAlert('A category needs a name.', 'Name required'); return }
    const res = await fetch(`/api/m/shop/admin/categories/${cat.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        regenerateSlug: name !== cat.name,
        parentId: editParentId || null,
        productDisplayMode: editMode || null,
      }),
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

  // A drop is only legal if the target is neither the dragged category nor one
  // of its own descendants - anything else would file a branch inside itself.
  function canDropOn(targetId: string): boolean {
    if (!dragId || targetId === dragId) return false
    return !descendantIds(dragId).includes(targetId)
  }

  // Pick the drop zone from where the pointer sits in the target row: the top
  // ~30% inserts before, the bottom ~30% after, and the middle files inside.
  function onRowDragOver(e: ReactDragEvent<HTMLLIElement>, cat: Category) {
    if (!canDropOn(cat.id)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const rect = e.currentTarget.getBoundingClientRect()
    const y = e.clientY - rect.top
    const zone: 'before' | 'inside' | 'after' =
      y < rect.height * 0.3 ? 'before' : y > rect.height * 0.7 ? 'after' : 'inside'
    setDropTarget((prev) => (prev && prev.id === cat.id && prev.zone === zone ? prev : { id: cat.id, zone }))
  }

  // Commit the drag: work out the destination parent and the new sibling order,
  // reflect it optimistically, then persist parent + order in one request.
  async function completeDrop() {
    const target = dropTarget
    const moved = dragId
    setDropTarget(null)
    setDragId(null)
    if (!target || !moved || target.id === moved) return
    const movedCat = categories.find((c) => c.id === moved)
    const targetCat = categories.find((c) => c.id === target.id)
    if (!movedCat || !targetCat) return
    if (descendantIds(moved).includes(target.id)) return

    const newParentId: string | null = target.zone === 'inside' ? target.id : targetCat.parentId
    const group = childrenOf(newParentId).filter((c) => c.id !== moved).map((c) => c.id)
    let insertAt: number
    if (target.zone === 'inside') {
      insertAt = group.length // append as the last child
    } else {
      const ti = group.indexOf(target.id)
      if (ti < 0) return
      insertAt = target.zone === 'before' ? ti : ti + 1
    }
    const orderedIds = [...group.slice(0, insertAt), moved, ...group.slice(insertAt)]

    // Nothing actually moved (same parent, identical order) - skip the write.
    const currentGroup = childrenOf(newParentId).map((c) => c.id)
    if (
      newParentId === movedCat.parentId &&
      currentGroup.length === orderedIds.length &&
      currentGroup.every((id, i) => id === orderedIds[i])
    ) {
      return
    }

    // Optimistic: re-file the moved row and reindex its destination siblings.
    setCategories((prev) => {
      const order = new Map(orderedIds.map((id, i) => [id, i]))
      return prev
        .map((c) => {
          if (c.id === moved) return { ...c, parentId: newParentId, position: order.get(c.id) ?? c.position }
          if (order.has(c.id)) return { ...c, position: order.get(c.id)! }
          return c
        })
        .sort((a, b) => (a.position - b.position) || a.name.localeCompare(b.name))
    })
    // Make sure the new parent is open so the moved row is actually on screen.
    if (newParentId) setCollapsed((prev) => { const n = new Set(prev); n.delete(newParentId); return n })

    const res = await fetch('/api/m/shop/admin/categories/reorder', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderedIds, parentId: newParentId }),
    })
    if (!res.ok) await showAlert((await res.json().catch(() => ({}))).error ?? 'Could not save the new order.', 'Reorder failed')
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
  const totalTop = childrenOf(null).length

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{ marginBottom: '0.25rem' }}>Categories</h1>
          <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
            {categories.length === 0
              ? 'Group your products so shoppers can browse them.'
              : `${categories.length} categor${categories.length === 1 ? 'y' : 'ies'} · ${totalTop} at the top level`}
          </p>
        </div>
        <button onClick={() => createCategory(null)} className="btn btn-primary">New category</button>
      </div>

      {categories.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center', marginBottom: '1rem' }}>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search categories"
            aria-label="Search categories"
            style={{ ...inputStyle, flex: '1 1 220px', minWidth: 0 }}
          />
          {allParentIds.length > 0 && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={anyCollapsed ? expandAll : collapseAll}
            >
              {anyCollapsed ? 'Expand all' : 'Collapse all'}
            </button>
          )}
        </div>
      )}

      {categories.length === 0 && (
        <p style={{ color: 'var(--color-text-muted)' }}>No categories yet. Add one to start grouping your products.</p>
      )}
      {categories.length > 0 && rows.length === 0 && (
        <p style={{ color: 'var(--color-text-muted)' }}>No categories match &ldquo;{search.trim()}&rdquo;.</p>
      )}
      {categories.length > 0 && rows.length > 0 && !query && (
        <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', margin: '0 0 0.5rem' }}>
          Drag the handle to reorder, or drop a category onto another to file it inside. The arrows nudge one step; Edit lets you pick a parent from a list.
        </p>
      )}

      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.375rem' }}>
        {rows.map(({ cat, depth }) => {
          const siblings = childrenOf(cat.parentId)
          const index = siblings.findIndex((s) => s.id === cat.id)
          const isEditing = editingId === cat.id
          const blocked = new Set([cat.id, ...descendantIds(cat.id)])
          const parentOfSomething = hasChildren(cat.id)
          const isCollapsed = collapsed.has(cat.id) && !query
          const count = counts[cat.id] ?? 0
          const drop = dropTarget?.id === cat.id ? dropTarget.zone : null
          return (
            <li
              key={cat.id}
              onDragOver={(e) => onRowDragOver(e, cat)}
              onDrop={(e) => { e.preventDefault(); void completeDrop() }}
              style={{
                border: '1px solid var(--color-border)', borderRadius: 8,
                padding: '0.5rem 0.75rem', marginLeft: `${depth * 1.5}rem`,
                background: isEditing ? 'var(--color-bg-subtle)' : 'var(--color-surface)',
                borderColor: isEditing ? 'var(--color-primary-border)' : 'var(--color-border)',
                opacity: dragId === cat.id ? 0.4 : 1,
                outline: drop === 'inside' ? '2px solid var(--color-primary)' : undefined,
                outlineOffset: drop === 'inside' ? '-2px' : undefined,
                boxShadow: drop === 'before'
                  ? 'inset 0 3px 0 var(--color-primary)'
                  : drop === 'after'
                    ? 'inset 0 -3px 0 var(--color-primary)'
                    : undefined,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
                  {!query && (
                    <span
                      draggable
                      onDragStart={(e) => {
                        setDragId(cat.id)
                        e.dataTransfer.effectAllowed = 'move'
                        e.dataTransfer.setData('text/plain', cat.id)
                      }}
                      onDragEnd={() => { setDragId(null); setDropTarget(null) }}
                      role="button"
                      aria-label={`Drag to reorder or nest ${cat.name}`}
                      title="Drag to reorder or nest"
                      style={{
                        cursor: 'grab', color: 'var(--color-text-muted)', flexShrink: 0,
                        lineHeight: 1, padding: '0 0.125rem', userSelect: 'none', fontSize: '0.875rem',
                      }}
                    >
                      ⠿
                    </span>
                  )}
                  {parentOfSomething ? (
                    <button
                      type="button"
                      onClick={() => toggleCollapse(cat.id)}
                      disabled={!!query}
                      aria-expanded={!isCollapsed}
                      aria-label={isCollapsed ? `Expand ${cat.name}` : `Collapse ${cat.name}`}
                      title={isCollapsed ? 'Expand' : 'Collapse'}
                      style={{
                        background: 'none', border: 'none', cursor: query ? 'default' : 'pointer',
                        color: 'var(--color-text-muted)', padding: 0, width: '1rem', flexShrink: 0,
                        fontSize: '0.75rem', lineHeight: 1,
                        transform: isCollapsed ? 'none' : 'rotate(90deg)', transition: 'transform 0.12s',
                      }}
                    >
                      ▶
                    </button>
                  ) : (
                    <span aria-hidden style={{ width: '1rem', flexShrink: 0, color: 'var(--color-text-muted)', textAlign: 'center' }}>
                      {depth > 0 ? '·' : ''}
                    </span>
                  )}
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: depth === 0 ? 600 : 400 }}>
                    {highlight(cat.name, search.trim())}
                  </span>
                  <span
                    className="badge badge-default"
                    style={{ fontSize: '0.6875rem' }}
                    title={`${count} product${count === 1 ? '' : 's'} filed directly here`}
                  >
                    {count}
                  </span>
                  {parentOfSomething && isCollapsed && (
                    <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)' }}>
                      {childrenOf(cat.id).length} sub
                    </span>
                  )}
                  {cat.productDisplayMode && (
                    <span className="badge badge-primary" style={{ fontSize: '0.6875rem' }}>{MODE_LABEL[cat.productDisplayMode]}</span>
                  )}
                </span>
                <span style={{ display: 'flex', gap: '0.125rem', alignItems: 'center', flexShrink: 0 }}>
                  <button onClick={() => move(cat, -1)} disabled={index <= 0} className="btn btn-ghost btn-sm" style={{ padding: '0 0.375rem', opacity: index <= 0 ? 0.35 : 1 }} title="Move up" aria-label={`Move ${cat.name} up`}>↑</button>
                  <button onClick={() => move(cat, 1)} disabled={index >= siblings.length - 1} className="btn btn-ghost btn-sm" style={{ padding: '0 0.375rem', opacity: index >= siblings.length - 1 ? 0.35 : 1 }} title="Move down" aria-label={`Move ${cat.name} down`}>↓</button>
                  <button onClick={() => createCategory(cat.id)} className="btn btn-ghost btn-sm" title="Add a sub-category">+ Sub</button>
                  <button onClick={() => (isEditing ? setEditingId(null) : openEditor(cat))} className="btn btn-ghost btn-sm">{isEditing ? 'Close' : 'Edit'}</button>
                  <button onClick={() => remove(cat)} className="btn btn-ghost btn-sm" style={{ color: 'var(--color-danger)' }} title="Delete">Delete</button>
                </span>
              </div>

              {isEditing && (
                <div style={{ display: 'grid', gap: '0.75rem', marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--color-border)' }}>
                  <label style={{ display: 'grid', gap: '0.25rem' }}>
                    <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>Name</span>
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') saveEditor(cat) }}
                      aria-label="Category name"
                      autoFocus
                      style={inputStyle}
                    />
                  </label>
                  <label style={{ display: 'grid', gap: '0.25rem' }}>
                    <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>Sits under</span>
                    <select value={editParentId} onChange={(e) => setEditParentId(e.target.value)} style={inputStyle}>
                      <option value="">Top level (no parent)</option>
                      {categories.filter((c) => !blocked.has(c.id)).map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </label>
                  <label style={{ display: 'grid', gap: '0.25rem' }}>
                    <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>Products shown on this category&apos;s page</span>
                    <select value={editMode} onChange={(e) => setEditMode(e.target.value as DisplayModeChoice)} style={inputStyle}>
                      <option value="">Use the shop default</option>
                      <option value="rollup">This category and all its sub-categories</option>
                      <option value="exact">Only products filed directly here</option>
                    </select>
                  </label>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button onClick={() => saveEditor(cat)} className="btn btn-primary btn-sm">Save</button>
                    <button onClick={() => setEditingId(null)} className="btn btn-secondary btn-sm">Cancel</button>
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
