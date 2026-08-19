'use client'

import { useCallback, useEffect, useRef, useState, type CSSProperties, type DragEvent as ReactDragEvent } from 'react'
import { useAdminPath } from '@/components/admin/AdminPathContext'

// The membership editor for one collection: what is in it, in what order, and
// the search box that puts more in. Lives in its own file because the list
// screen around it is already carrying the collection rows, the details form
// and the SEO preview.
//
// Every change writes straight away - a collection is a curated list, and a
// half-saved one is worse than either state. Adds append (POST), reorders and
// removals send the whole list back in its new order (PUT), which is one write
// either way.

export type CollectionProduct = {
  id: string
  name: string
  slug: string
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED'
  position: number
  imageUrl: string | null
}

type SearchHit = { id: string; name: string; slug: string; status: string }

const inputStyle: CSSProperties = {
  padding: '0.375rem 0.5rem', border: '1px solid var(--color-border)', borderRadius: 6,
  fontSize: '0.875rem', fontFamily: 'inherit', background: 'var(--color-bg)', color: 'var(--color-text)',
}

const thumbStyle: CSSProperties = {
  width: 34, height: 34, borderRadius: 4, objectFit: 'cover',
  border: '1px solid var(--color-border)', flexShrink: 0, background: 'var(--color-bg-subtle)',
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'ACTIVE') return null
  return (
    <span
      className={status === 'DRAFT' ? 'badge badge-warning' : 'badge badge-default'}
      style={{ fontSize: '0.625rem' }}
      title={status === 'DRAFT' ? 'A draft product does not appear on the collection page' : 'An archived product does not appear on the collection page'}
    >
      {status === 'DRAFT' ? 'Draft' : 'Archived'}
    </span>
  )
}

export function CollectionProductsPanel({
  collectionId, onCountChange,
}: {
  collectionId: string
  /** Told the new total after every write, so the row above can keep its badge honest. */
  onCountChange: (count: number) => void
}) {
  const adminPath = useAdminPath()
  const [products, setProducts] = useState<CollectionProduct[] | null>(null)
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<SearchHit[]>([])
  const [hitImages, setHitImages] = useState<Record<string, string>>({})
  const [searching, setSearching] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropId, setDropId] = useState<string | null>(null)
  // Only the newest search may write the results - a slow "des" landing after a
  // fast "desk" would otherwise repopulate the box with the wrong list.
  const searchSeq = useRef(0)

  const apply = useCallback((next: CollectionProduct[]) => {
    setProducts(next)
    onCountChange(next.length)
  }, [onCountChange])

  useEffect(() => {
    let live = true
    fetch(`/api/m/shop/admin/collections/${collectionId}/products`)
      .then(async (r) => {
        if (!live || !r.ok) return
        const data = await r.json()
        setProducts(data.products)
      })
      .catch(() => { if (live) setError('Could not load this collection’s products.') })
    return () => { live = false }
  }, [collectionId])

  async function write(method: 'POST' | 'PUT', productIds: string[]) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/m/shop/admin/collections/${collectionId}/products`, {
        method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ productIds }),
      })
      if (!res.ok) {
        setError((await res.json().catch(() => ({}))).error ?? 'Could not save this collection’s products.')
        return
      }
      apply((await res.json()).products)
    } catch {
      setError('Could not reach the site to save that. Try again.')
    } finally {
      setBusy(false)
    }
  }

  async function search(q: string) {
    setQuery(q)
    const seq = ++searchSeq.current
    if (q.trim().length < 2) { setHits([]); setSearching(false); return }
    setSearching(true)
    try {
      const res = await fetch(`/api/m/shop/admin/products?search=${encodeURIComponent(q.trim())}&perPage=20`)
      if (seq !== searchSeq.current) return
      if (!res.ok) { setHits([]); return }
      const data = await res.json()
      setHits(data.products ?? [])
      setHitImages(data.images ?? {})
    } catch {
      if (seq === searchSeq.current) setHits([])
    } finally {
      if (seq === searchSeq.current) setSearching(false)
    }
  }

  const inCollection = new Set((products ?? []).map((p) => p.id))

  async function add(hit: SearchHit) {
    if (inCollection.has(hit.id)) return
    setQuery('')
    setHits([])
    await write('POST', [hit.id])
  }

  async function addAllHits() {
    const fresh = hits.filter((h) => !inCollection.has(h.id)).map((h) => h.id)
    if (fresh.length === 0) return
    setQuery('')
    setHits([])
    await write('POST', fresh)
  }

  async function remove(id: string) {
    if (!products) return
    await write('PUT', products.filter((p) => p.id !== id).map((p) => p.id))
  }

  async function move(index: number, direction: -1 | 1) {
    if (!products) return
    const target = index + direction
    if (target < 0 || target >= products.length) return
    const next = [...products]
    const a = next[index]
    const b = next[target]
    if (!a || !b) return
    next[index] = b
    next[target] = a
    setProducts(next) // optimistic, so the arrows feel like arrows
    await write('PUT', next.map((p) => p.id))
  }

  async function sortAlphabetically() {
    if (!products) return
    const next = [...products].sort((a, b) => a.name.localeCompare(b.name))
    setProducts(next)
    await write('PUT', next.map((p) => p.id))
  }

  async function completeDrop() {
    const moved = dragId
    const target = dropId
    setDragId(null)
    setDropId(null)
    if (!products || !moved || !target || moved === target) return
    const from = products.findIndex((p) => p.id === moved)
    const to = products.findIndex((p) => p.id === target)
    if (from < 0 || to < 0) return
    const next = [...products]
    const [item] = next.splice(from, 1)
    if (!item) return
    next.splice(to, 0, item)
    setProducts(next)
    await write('PUT', next.map((p) => p.id))
  }

  if (products === null) {
    return <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>Loading this collection&rsquo;s products&hellip;</p>
  }

  const freshHits = hits.filter((h) => !inCollection.has(h.id))

  return (
    <div style={{ display: 'grid', gap: '0.75rem' }}>
      {error && <div className="alert alert-danger" style={{ margin: 0, fontSize: '0.8125rem' }}>{error}</div>}

      <div style={{ position: 'relative' }}>
        <input
          type="search"
          value={query}
          onChange={(e) => void search(e.target.value)}
          placeholder="Search your products to add one&hellip;"
          aria-label="Search products to add to this collection"
          style={{ ...inputStyle, width: '100%' }}
        />
        {query.trim().length >= 2 && (
          <div
            style={{
              position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, marginTop: '0.25rem',
              background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 6,
              maxHeight: 280, overflowY: 'auto', boxShadow: '0 10px 20px -10px var(--color-overlay)',
            }}
          >
            {searching && <div style={{ padding: '0.625rem', fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>Searching&hellip;</div>}
            {!searching && hits.length === 0 && (
              <div style={{ padding: '0.625rem', fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>Nothing matches that.</div>
            )}
            {!searching && freshHits.length > 1 && (
              <button
                type="button"
                onClick={() => void addAllHits()}
                style={{
                  display: 'block', width: '100%', textAlign: 'left', padding: '0.5rem 0.625rem', cursor: 'pointer',
                  background: 'var(--color-bg-subtle)', border: 'none', borderBottom: '1px solid var(--color-border)',
                  color: 'var(--color-text)', font: 'inherit', fontSize: '0.8125rem', fontWeight: 600,
                }}
              >
                Add all {freshHits.length} matches
              </button>
            )}
            {!searching && hits.map((hit) => {
              const already = inCollection.has(hit.id)
              return (
                <button
                  key={hit.id}
                  type="button"
                  disabled={already}
                  onClick={() => void add(hit)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%', textAlign: 'left',
                    padding: '0.375rem 0.625rem', background: 'none', border: 'none', font: 'inherit',
                    fontSize: '0.8125rem', color: 'var(--color-text)',
                    cursor: already ? 'default' : 'pointer', opacity: already ? 0.55 : 1,
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- library urls are remote and unoptimised throughout the shop admin */}
                  <img src={hitImages[hit.id] ?? ''} alt="" style={thumbStyle} />
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{hit.name}</span>
                  <StatusBadge status={hit.status} />
                  <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-secondary)' }}>{already ? 'Already in' : 'Add'}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
          {products.length === 0
            ? 'Nothing in here yet.'
            : `${products.length} product${products.length === 1 ? '' : 's'}, shown on the collection page in this order.`}
        </span>
        {products.length > 1 && (
          <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void sortAlphabetically()}>Sort A&ndash;Z</button>
        )}
      </div>

      {products.length > 0 && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.25rem' }}>
          {products.map((p, i) => (
            <li
              key={p.id}
              onDragOver={(e: ReactDragEvent<HTMLLIElement>) => {
                if (!dragId || dragId === p.id) return
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
                setDropId(p.id)
              }}
              onDrop={(e) => { e.preventDefault(); void completeDrop() }}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.5rem',
                background: 'var(--color-bg-subtle)', borderRadius: 6, padding: '0.25rem 0.5rem',
                opacity: dragId === p.id ? 0.4 : 1,
                boxShadow: dropId === p.id && dragId ? 'inset 0 0 0 2px var(--color-primary)' : undefined,
              }}
            >
              <span
                draggable
                onDragStart={(e) => { setDragId(p.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', p.id) }}
                onDragEnd={() => { setDragId(null); setDropId(null) }}
                role="button"
                aria-label={`Drag to reorder ${p.name}`}
                title="Drag to reorder"
                style={{ cursor: 'grab', color: 'var(--color-text-secondary)', userSelect: 'none', fontSize: '0.875rem', lineHeight: 1 }}
              >
                &#10303;
              </span>
              <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-secondary)', width: '1.5rem', textAlign: 'right', flexShrink: 0 }}>{i + 1}</span>
              {/* eslint-disable-next-line @next/next/no-img-element -- library urls are remote and unoptimised throughout the shop admin */}
              <img src={p.imageUrl ?? ''} alt="" style={thumbStyle} />
              {/* New tab on purpose: curating a shelf is a long job, and
                  losing your place in it to open one product is a poor trade. */}
              <a
                href={`/${adminPath}/m/shop/products/${p.id}`}
                target="_blank"
                rel="noopener"
                style={{ flex: 1, minWidth: 0, fontSize: '0.8125rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--color-text)' }}
                title={`Open ${p.name} in a new tab`}
              >
                {p.name}
              </a>
              <StatusBadge status={p.status} />
              <button type="button" className="btn btn-ghost btn-sm" style={{ padding: '0 0.375rem' }} disabled={busy || i === 0} onClick={() => void move(i, -1)} title="Move up" aria-label={`Move ${p.name} up`}>&uarr;</button>
              <button type="button" className="btn btn-ghost btn-sm" style={{ padding: '0 0.375rem' }} disabled={busy || i === products.length - 1} onClick={() => void move(i, 1)} title="Move down" aria-label={`Move ${p.name} down`}>&darr;</button>
              <button type="button" className="btn btn-ghost btn-sm" style={{ color: 'var(--color-danger)' }} disabled={busy} onClick={() => void remove(p.id)} aria-label={`Take ${p.name} out of this collection`}>Remove</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
