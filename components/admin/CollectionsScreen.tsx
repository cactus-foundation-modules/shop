'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent as ReactDragEvent, type ReactNode } from 'react'
import { useAdminPath } from '@/components/admin/AdminPathContext'
import { useConfirm, usePrompt, useAlert } from '@/modules/shop/components/admin/dialogs'
import { CollectionProductsPanel } from '@/modules/shop/components/admin/CollectionProductsPanel'

// The collections screen. A collection is a hand-curated shelf - "Sit-stand
// under a grand", "Everything in oak" - so this screen is built around the two
// jobs that actually take the time: deciding what goes on the shelf and in what
// order, and writing the words that sell it. Both used to live somewhere else
// entirely (product by product in the product editor, and nowhere at all), which
// is why the old screen was a list of names with a Rename button.

type Collection = {
  id: string
  name: string
  slug: string
  description: string | null
  // The one-liner on the collection's card and under its heading, the twin of a
  // category's. The long `description` below it is the page copy.
  shortDescription: string | null
  position: number
  metaTitle: string | null
  metaDescription: string | null
  // Whether a designed description exists, so the row can say so without the
  // list dragging every builder document across - see listCollections.
  hasDesignedDescription: boolean
}

type Tab = 'details' | 'products'

// Collections never move off /shop, whatever the shop's product URL style is -
// see lib/product-url.ts. So the public address is a plain concatenation and
// needs no config read.
const PUBLIC_PREFIX = '/shop/collections/'

// Google truncates a title around 60 characters and a description around 160.
// Neither is a hard limit and neither is enforced here - the counters just go
// amber so a 200-character description is a decision rather than an accident.
const TITLE_LIMIT = 60
const DESCRIPTION_LIMIT = 160

const inputStyle: CSSProperties = {
  padding: '0.375rem 0.5rem', border: '1px solid var(--color-border)', borderRadius: 6,
  fontSize: '0.875rem', fontFamily: 'inherit', background: 'var(--color-bg)', color: 'var(--color-text)',
}
const labelStyle: CSSProperties = { fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }
const hintStyle: CSSProperties = { fontSize: '0.75rem', color: 'var(--color-text-secondary)' }

// Case-insensitive substring highlight for the search box, the same one the
// categories screen uses - keeps the plain string intact when nothing matches.
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

function Counter({ value, limit }: { value: number; limit: number }) {
  const over = value > limit
  return (
    <span style={{ ...hintStyle, color: over ? 'var(--color-warning)' : 'var(--color-text-secondary)' }}>
      {value}/{limit}{over ? ' - search results will cut this short' : ''}
    </span>
  )
}

export function CollectionsScreen() {
  const [collections, setCollections] = useState<Collection[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [previews, setPreviews] = useState<Record<string, string[]>>({})
  const [loaded, setLoaded] = useState(false)
  const adminPath = useAdminPath()
  const [search, setSearch] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('details')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropId, setDropId] = useState<string | null>(null)

  // The details form, held apart from the list so an unsaved edit never leaks
  // into the row above it.
  const [editName, setEditName] = useState('')
  const [editSlug, setEditSlug] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editShortDescription, setEditShortDescription] = useState('')
  const [editMetaTitle, setEditMetaTitle] = useState('')
  const [editMetaDescription, setEditMetaDescription] = useState('')

  // The counts update themselves as the products panel writes, but the picture
  // stack beside each name comes from the list route - so a row whose membership
  // changed refetches on the way out rather than after every single add.
  const previewsStale = useRef(false)

  const [confirm, confirmNode] = useConfirm()
  const [promptText, promptNode] = usePrompt()
  const [showAlert, alertNode] = useAlert()

  const refresh = useCallback(() => {
    previewsStale.current = false
    fetch('/api/m/shop/admin/collections')
      .then(async (r) => {
        if (!r.ok) return
        const data = await r.json()
        setCollections(data.collections)
        setCounts(data.productCounts ?? {})
        setPreviews(data.previewImages ?? {})
      })
      .finally(() => setLoaded(true))
  }, [])
  useEffect(() => { refresh() }, [refresh])

  const closeRow = useCallback(() => {
    setOpenId(null)
    if (previewsStale.current) refresh()
  }, [refresh])

  const query = search.trim()
  const visible = useMemo(() => {
    if (!query) return collections
    const q = query.toLowerCase()
    return collections.filter((c) => c.name.toLowerCase().includes(q) || c.slug.toLowerCase().includes(q))
  }, [collections, query])

  const totalFiled = Object.values(counts).reduce((a, b) => a + b, 0)
  const emptyCount = collections.filter((c) => (counts[c.id] ?? 0) === 0).length

  function openDetails(collection: Collection) {
    setOpenId(collection.id)
    setTab('details')
    setEditName(collection.name)
    setEditSlug(collection.slug)
    setEditDescription(collection.description ?? '')
    setEditShortDescription(collection.shortDescription ?? '')
    setEditMetaTitle(collection.metaTitle ?? '')
    setEditMetaDescription(collection.metaDescription ?? '')
  }

  async function createCollection() {
    const name = await promptText({ title: 'New collection', placeholder: 'Collection name', confirmLabel: 'Create' })
    if (!name) return
    const res = await fetch('/api/m/shop/admin/collections', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
    })
    if (!res.ok) { await showAlert('Could not create that collection.', 'Create failed'); return }
    const created = await res.json().catch(() => null)
    refresh()
    // Straight into the products tab: a collection with nothing in it renders an
    // empty page, so filling it is the next thing anybody wants to do.
    if (created?.id) {
      setOpenId(created.id)
      setTab('products')
      setEditName(name)
      setEditSlug(created.slug ?? '')
      setEditDescription('')
      setEditShortDescription('')
      setEditMetaTitle('')
      setEditMetaDescription('')
    }
  }

  // Name, address, blurb and SEO all save together - it is one form and one row,
  // and saving half of it is nobody's intention.
  async function saveDetails(collection: Collection) {
    const name = editName.trim()
    if (!name) { await showAlert('A collection needs a name.', 'Name required'); return }
    setSaving(true)
    const res = await fetch(`/api/m/shop/admin/collections/${collection.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        // An emptied address box falls back to one made from the name, rather
        // than saving a collection nobody can reach.
        slug: editSlug.trim() || name,
        description: editDescription.trim() || null,
        shortDescription: editShortDescription.trim() || null,
        metaTitle: editMetaTitle.trim() || null,
        metaDescription: editMetaDescription.trim() || null,
      }),
    })
    setSaving(false)
    if (!res.ok) {
      await showAlert((await res.json().catch(() => ({}))).error ?? 'Could not save this collection.', 'Save failed')
      return
    }
    setOpenId(null)
    refresh()
  }

  async function duplicate(collection: Collection) {
    const count = counts[collection.id] ?? 0
    const ok = await confirm({
      title: 'Copy this collection?',
      message: `A new collection called "${collection.name} (copy)" will be created with the same wording and the same ${count} product${count === 1 ? '' : 's'}. Nothing about "${collection.name}" changes.`,
      confirmLabel: 'Make a copy',
      danger: false,
    })
    if (!ok) return
    const res = await fetch(`/api/m/shop/admin/collections/${collection.id}/duplicate`, { method: 'POST' })
    if (!res.ok) { await showAlert((await res.json().catch(() => ({}))).error ?? 'Could not copy that collection.', 'Copy failed'); return }
    refresh()
  }

  async function remove(collection: Collection) {
    const count = counts[collection.id] ?? 0
    const ok = await confirm({
      title: 'Delete collection?',
      message: count > 0
        ? `"${collection.name}" will be removed, along with its page. The ${count} product${count === 1 ? '' : 's'} in it stay in your catalogue - they just lose this grouping.`
        : `"${collection.name}" will be removed, along with its page.`,
    })
    if (!ok) return
    const res = await fetch(`/api/m/shop/admin/collections/${collection.id}`, { method: 'DELETE' })
    if (!res.ok) { await showAlert('Could not delete this collection.', 'Delete failed'); return }
    if (openId === collection.id) setOpenId(null)
    refresh()
  }

  async function copyLink(collection: Collection) {
    const url = `${window.location.origin}${PUBLIC_PREFIX}${collection.slug}`
    try {
      await navigator.clipboard.writeText(url)
      setCopiedId(collection.id)
      window.setTimeout(() => setCopiedId((prev) => (prev === collection.id ? null : prev)), 1800)
    } catch {
      await showAlert(url, 'Copy this address')
    }
  }

  // Reordering only makes sense against the full list, so both the arrows and
  // the drag handle are hidden while a search is filtering it.
  async function persistOrder(next: Collection[]) {
    setCollections(next.map((c, i) => ({ ...c, position: i })))
    const res = await fetch('/api/m/shop/admin/collections/reorder', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderedIds: next.map((c) => c.id) }),
    })
    if (!res.ok) await showAlert('Could not save the new order.', 'Reorder failed')
    refresh()
  }

  async function move(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= collections.length) return
    const next = [...collections]
    const a = next[index]
    const b = next[target]
    if (!a || !b) return
    next[index] = b
    next[target] = a
    await persistOrder(next)
  }

  async function completeDrop() {
    const moved = dragId
    const target = dropId
    setDragId(null)
    setDropId(null)
    if (!moved || !target || moved === target) return
    const from = collections.findIndex((c) => c.id === moved)
    const to = collections.findIndex((c) => c.id === target)
    if (from < 0 || to < 0) return
    const next = [...collections]
    const [item] = next.splice(from, 1)
    if (!item) return
    next.splice(to, 0, item)
    await persistOrder(next)
  }

  const noteCount = useCallback((id: string, count: number) => {
    setCounts((prev) => {
      if (prev[id] === count) return prev
      previewsStale.current = true
      return { ...prev, [id]: count }
    })
  }, [])

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{ marginBottom: '0.25rem' }}>Collections</h1>
          <p style={{ margin: 0, ...hintStyle }}>
            {collections.length === 0
              ? 'Hand-picked shelves of products, each with a page of its own.'
              : `${collections.length} collection${collections.length === 1 ? '' : 's'} · ${totalFiled} product place${totalFiled === 1 ? '' : 's'} filled${emptyCount > 0 ? ` · ${emptyCount} still empty` : ''}`}
          </p>
        </div>
        <button onClick={() => void createCollection()} className="btn btn-primary">New collection</button>
      </div>

      {collections.length > 1 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center', marginBottom: '1rem' }}>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search collections"
            aria-label="Search collections"
            style={{ ...inputStyle, flex: '1 1 220px', minWidth: 0 }}
          />
        </div>
      )}

      {loaded && collections.length === 0 && (
        <p style={{ color: 'var(--color-text-secondary)' }}>
          No collections yet. A collection is a shelf you fill yourself - useful for a sale, a season, or the six things you actually want on the front page.
        </p>
      )}
      {collections.length > 0 && visible.length === 0 && (
        <p style={{ color: 'var(--color-text-secondary)' }}>Nothing matches &ldquo;{query}&rdquo;.</p>
      )}
      {collections.length > 1 && visible.length > 0 && !query && (
        <p style={{ ...hintStyle, margin: '0 0 0.5rem' }}>
          Drag the handle to reorder. The order here is the order collections appear in wherever the site lists them.
        </p>
      )}

      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.5rem' }}>
        {visible.map((collection) => {
          const index = collections.findIndex((c) => c.id === collection.id)
          const count = counts[collection.id] ?? 0
          const images = previews[collection.id] ?? []
          const isOpen = openId === collection.id
          const hasSeo = !!(collection.metaTitle || collection.metaDescription)
          return (
            <li
              key={collection.id}
              onDragOver={(e: ReactDragEvent<HTMLLIElement>) => {
                if (!dragId || dragId === collection.id) return
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
                setDropId(collection.id)
              }}
              onDrop={(e) => { e.preventDefault(); void completeDrop() }}
              style={{
                border: '1px solid', borderRadius: 8, padding: '0.625rem 0.75rem',
                background: isOpen ? 'var(--color-bg-subtle)' : 'var(--color-surface)',
                borderColor: isOpen ? 'var(--color-primary-border)' : 'var(--color-border)',
                opacity: dragId === collection.id ? 0.4 : 1,
                boxShadow: dropId === collection.id && dragId ? 'inset 0 0 0 2px var(--color-primary)' : undefined,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', minWidth: 0, flex: '1 1 320px' }}>
                  {!query && collections.length > 1 && (
                    <span
                      draggable
                      onDragStart={(e) => { setDragId(collection.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', collection.id) }}
                      onDragEnd={() => { setDragId(null); setDropId(null) }}
                      role="button"
                      aria-label={`Drag to reorder ${collection.name}`}
                      title="Drag to reorder"
                      style={{ cursor: 'grab', color: 'var(--color-text-secondary)', userSelect: 'none', fontSize: '0.875rem', lineHeight: 1, flexShrink: 0 }}
                    >
                      &#10303;
                    </span>
                  )}

                  {/* What is actually on the shelf, four products' worth. Beats a
                      placeholder square: a collection is recognised by its stock,
                      not by a picture of itself. */}
                  <span style={{ display: 'flex', flexShrink: 0 }} aria-hidden>
                    {images.length === 0 ? (
                      <span style={{ width: 34, height: 34, borderRadius: 4, background: 'var(--color-bg-subtle)', border: '1px dashed var(--color-border)' }} />
                    ) : images.map((url, i) => (
                      // eslint-disable-next-line @next/next/no-img-element -- library urls are remote and unoptimised throughout the shop admin
                      <img
                        key={`${url}-${i}`}
                        src={url}
                        alt=""
                        style={{
                          width: 34, height: 34, borderRadius: 4, objectFit: 'cover',
                          border: '1px solid var(--color-border)', background: 'var(--color-surface)',
                          marginLeft: i === 0 ? 0 : -10, position: 'relative', zIndex: images.length - i,
                        }}
                      />
                    ))}
                  </span>

                  <span style={{ display: 'grid', gap: '0.125rem', minWidth: 0 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={() => (isOpen ? closeRow() : openDetails(collection))}
                        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit', fontWeight: 600, color: 'var(--color-text)', textAlign: 'left' }}
                      >
                        {highlight(collection.name, query)}
                      </button>
                      <span className={count === 0 ? 'badge badge-warning' : 'badge badge-default'} style={{ fontSize: '0.6875rem' }} title={`${count} product${count === 1 ? '' : 's'} in this collection`}>
                        {count === 0 ? 'Empty' : count}
                      </span>
                      {hasSeo && (
                        <span className="badge badge-default" style={{ fontSize: '0.6875rem' }} title="This collection has its own search-listing wording">SEO</span>
                      )}
                    </span>
                    <span style={{ ...hintStyle, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {PUBLIC_PREFIX}{highlight(collection.slug, query)}
                    </span>
                  </span>
                </div>

                <span style={{ display: 'flex', gap: '0.125rem', alignItems: 'center', flexShrink: 0, flexWrap: 'wrap' }}>
                  {!query && collections.length > 1 && (
                    <>
                      <button onClick={() => void move(index, -1)} disabled={index <= 0} className="btn btn-ghost btn-sm" style={{ padding: '0 0.375rem', opacity: index <= 0 ? 0.35 : 1 }} title="Move up" aria-label={`Move ${collection.name} up`}>&uarr;</button>
                      <button onClick={() => void move(index, 1)} disabled={index >= collections.length - 1} className="btn btn-ghost btn-sm" style={{ padding: '0 0.375rem', opacity: index >= collections.length - 1 ? 0.35 : 1 }} title="Move down" aria-label={`Move ${collection.name} down`}>&darr;</button>
                    </>
                  )}
                  <a
                    href={`${PUBLIC_PREFIX}${collection.slug}`}
                    target="_blank"
                    rel="noopener"
                    className="btn btn-secondary btn-sm"
                    title="Open this collection's page on the site, in a new tab"
                  >
                    View &#8599;
                  </a>
                  <button onClick={() => void copyLink(collection)} className="btn btn-ghost btn-sm" title="Copy this collection's web address">
                    {copiedId === collection.id ? 'Copied' : 'Copy link'}
                  </button>
                  <button
                    onClick={() => { if (isOpen && tab === 'products') { closeRow() } else { openDetails(collection); setTab('products') } }}
                    className="btn btn-ghost btn-sm"
                  >
                    Products
                  </button>
                  <button onClick={() => (isOpen && tab === 'details' ? closeRow() : openDetails(collection))} className="btn btn-ghost btn-sm">
                    {isOpen && tab === 'details' ? 'Close' : 'Edit'}
                  </button>
                  <button onClick={() => void duplicate(collection)} className="btn btn-ghost btn-sm" title="Copy this collection and everything in it">Duplicate</button>
                  <button onClick={() => void remove(collection)} className="btn btn-ghost btn-sm" style={{ color: 'var(--color-danger)' }}>Delete</button>
                </span>
              </div>

              {isOpen && (
                <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--color-border)', display: 'grid', gap: '0.75rem' }}>
                  <div style={{ display: 'flex', gap: '0.25rem' }} role="tablist" aria-label={`${collection.name} settings`}>
                    {(['details', 'products'] as Tab[]).map((key) => (
                      <button
                        key={key}
                        type="button"
                        role="tab"
                        aria-selected={tab === key}
                        onClick={() => setTab(key)}
                        className={tab === key ? 'btn btn-secondary btn-sm' : 'btn btn-ghost btn-sm'}
                      >
                        {key === 'details' ? 'Details' : `Products (${count})`}
                      </button>
                    ))}
                  </div>

                  {tab === 'details' && (
                    <div style={{ display: 'grid', gap: '0.75rem' }}>
                      <label style={{ display: 'grid', gap: '0.25rem' }}>
                        <span style={labelStyle}>Name</span>
                        <input value={editName} onChange={(e) => setEditName(e.target.value)} autoFocus style={inputStyle} />
                      </label>

                      <label style={{ display: 'grid', gap: '0.25rem' }}>
                        <span style={labelStyle}>Web address</span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', flexWrap: 'wrap' }}>
                          <span style={hintStyle}>{PUBLIC_PREFIX}</span>
                          <input value={editSlug} onChange={(e) => setEditSlug(e.target.value)} style={{ ...inputStyle, flex: '1 1 200px', minWidth: 0 }} />
                        </span>
                        <span style={hintStyle}>
                          Tidied up when you save, so spaces and punctuation are fine here. Change it and the old address stops working, so anything already linking to it will need pointing at the new one.
                        </span>
                      </label>

                      <label style={{ display: 'grid', gap: '0.25rem' }}>
                        <span style={labelStyle}>Short description (shown on this collection&rsquo;s card and under its heading)</span>
                        <input
                          value={editShortDescription}
                          onChange={(e) => setEditShortDescription(e.target.value)}
                          placeholder="One line, e.g. Everything in oak, from desks to bookcases"
                          style={inputStyle}
                        />
                      </label>

                      <label style={{ display: 'grid', gap: '0.25rem' }}>
                        <span style={labelStyle}>Full description (shown on this collection&rsquo;s own page)</span>
                        <textarea
                          value={editDescription}
                          onChange={(e) => setEditDescription(e.target.value)}
                          rows={4}
                          placeholder="A paragraph or two on what ties these products together."
                          style={{ ...inputStyle, resize: 'vertical' }}
                        />
                      </label>

                      {/* The laid-out version, built in its own full-screen page
                          builder. It wins over the plain box above whenever it
                          has anything in it, exactly as a category's designed
                          description does - so the plain text stays the easy
                          option and this is the opt-in. */}
                      <div style={{ display: 'grid', gap: '0.25rem' }}>
                        <span style={labelStyle}>Designed description</span>
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                          <a
                            href={`/${adminPath}/m/shop/collections/${collection.id}/description`}
                            target="_blank"
                            rel="noopener"
                            className="btn btn-secondary btn-sm"
                          >
                            {collection.hasDesignedDescription ? 'Edit the design' : 'Design this description'}
                          </a>
                          <span style={hintStyle}>
                            {collection.hasDesignedDescription
                              ? 'Opens in a new tab. The designed version is what shoppers see.'
                              : 'Opens the page builder in a new tab. Anything you build there replaces the plain text above.'}
                          </span>
                        </div>
                      </div>

                      <div style={{ display: 'grid', gap: '0.5rem', border: '1px solid var(--color-border)', borderRadius: 8, padding: '0.75rem' }}>
                        <span style={{ fontSize: '0.8125rem', fontWeight: 600 }}>How this page looks in search results</span>
                        <label style={{ display: 'grid', gap: '0.25rem' }}>
                          <span style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
                            <span style={labelStyle}>Search-listing title</span>
                            <Counter value={editMetaTitle.length} limit={TITLE_LIMIT} />
                          </span>
                          <input value={editMetaTitle} onChange={(e) => setEditMetaTitle(e.target.value)} placeholder={collection.name} style={inputStyle} />
                        </label>
                        <label style={{ display: 'grid', gap: '0.25rem' }}>
                          <span style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
                            <span style={labelStyle}>Search-listing description</span>
                            <Counter value={editMetaDescription.length} limit={DESCRIPTION_LIMIT} />
                          </span>
                          <textarea
                            value={editMetaDescription}
                            onChange={(e) => setEditMetaDescription(e.target.value)}
                            rows={2}
                            placeholder={editDescription || 'What somebody scanning a page of search results needs to know.'}
                            style={{ ...inputStyle, resize: 'vertical' }}
                          />
                        </label>

                        {/* Roughly what Google will print. Falls back exactly as
                            the page itself does: title then name, description
                            then the blurb above. */}
                        <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 6, padding: '0.625rem' }}>
                          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                            {PUBLIC_PREFIX}{editSlug.trim() || collection.slug}
                          </div>
                          <div style={{ fontSize: '1rem', color: 'var(--color-primary)', marginTop: '0.125rem' }}>
                            {(editMetaTitle.trim() || editName.trim() || collection.name).slice(0, TITLE_LIMIT + 10)}
                          </div>
                          <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', marginTop: '0.125rem' }}>
                            {(editMetaDescription.trim() || editDescription.trim() || 'No description yet, so search engines will pick their own wording from the page.').slice(0, DESCRIPTION_LIMIT + 20)}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button onClick={() => void saveDetails(collection)} className="btn btn-primary btn-sm" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
                        <button onClick={() => closeRow()} className="btn btn-secondary btn-sm" disabled={saving}>Cancel</button>
                      </div>
                    </div>
                  )}

                  {tab === 'products' && (
                    <CollectionProductsPanel
                      collectionId={collection.id}
                      onCountChange={(next) => noteCount(collection.id, next)}
                    />
                  )}
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
