'use client'

import { useEffect, useRef, useState } from 'react'

type MediaItem = { id: string; url: string; key: string; altText: string | null; mimeType: string }

type Folder = { id: string; name: string; parentId: string | null }

// Mirrors core's LibrarySort, minus the size options - file weight is not how
// anyone hunts for a product photo.
type Sort = 'newest' | 'oldest' | 'name' | 'name_desc'

const SORT_OPTIONS: { value: Sort; label: string }[] = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'name', label: 'Name A-Z' },
  { value: 'name_desc', label: 'Name Z-A' },
]

const PER_PAGE = 50

// Adapted from modules/directory/components/admin/EntryImagesField.tsx's
// MultiMediaPickerModal - browses core's shared media library
// (GET /api/admin/media) and adds an upload tab against the same endpoint's
// POST, since shop stores product media as plain URLs rather than media IDs.
//
// Browsing is folder-aware, the same shape as core's Puck image picker: the
// list shows one folder at a time with subfolder tiles and a breadcrumb, and a
// search spans every folder at once. `resolveInitialFolderId` names the folder
// the picker opens in - the product's own Shop / <category> / <product> folder,
// resolved without creating anything - so the admin lands on this product's
// images rather than an unsorted heap of everyone's. Omitted, it opens at the
// library root.
//
// `resolveFolderId` is asked, per upload, where the file should be filed - the
// product's Shop / <category> / <product> folder. Called at upload time rather
// than taken as a value so the answer reflects the editor as it stands, and so
// nothing is created for a picker that is only browsed. Omitted or null means
// the library root: core's own default, and where product images used to land.
export function MediaPickerModal({ onAdd, onClose, resolveFolderId, resolveInitialFolderId }: {
  onAdd: (items: MediaItem[]) => void
  onClose: () => void
  resolveFolderId?: () => Promise<string | null>
  resolveInitialFolderId?: () => Promise<string | null>
}) {
  const [items, setItems] = useState<MediaItem[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  // Keyed by id but holding the whole item: the grid re-lists per folder, so a
  // selection made in one folder must survive navigating to another - reading
  // the picks back out of the current listing would quietly drop them.
  const [picked, setPicked] = useState<Map<string, MediaItem>>(new Map())
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [folders, setFolders] = useState<Folder[]>([])
  // null = library root; undefined = still resolving where to open.
  const [folderId, setFolderId] = useState<string | null | undefined>(resolveInitialFolderId ? undefined : null)
  const [sort, setSort] = useState<Sort>('newest')
  // The listing pages rather than showing a fixed first 50 - a shop with a few
  // hundred product photos had no way to reach anything past the first page.
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const pageRef = useRef(1)
  // Bumped to force the listing effect to re-run for the same folder/sort, which
  // is what an upload into the folder already on screen needs.
  const [reloadKey, setReloadKey] = useState(0)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Folder tree, once. The picker assembles each level from parentId.
  useEffect(() => {
    fetch('/api/admin/media/folders')
      .then((r) => r.ok ? r.json() : null)
      .then((d) => d?.folders && setFolders(d.folders))
      .catch(() => null)
  }, [])

  // Where to open: the product's own folder, resolved once. A failure simply
  // opens the root - browsing must never be the thing that breaks.
  useEffect(() => {
    if (!resolveInitialFolderId) return
    let cancelled = false
    resolveInitialFolderId()
      .then((id) => { if (!cancelled) setFolderId(id) })
      .catch(() => { if (!cancelled) setFolderId(null) })
    return () => { cancelled = true }
    // Deliberately once, on mount - the picker opens somewhere and navigation
    // takes over from there.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Media scoped to the current folder, or spanning every folder while
  // searching. Debounced so typing doesn't hammer the endpoint per keystroke.
  const trimmed = query.trim()

  // One page of the listing. Search spans every folder; otherwise the current
  // folder only. Sort and paging are handled by core's endpoint, which already
  // takes both - the picker simply never asked.
  function buildParams(page: number) {
    const params = new URLSearchParams({ perPage: String(PER_PAGE), type: 'image', sort, page: String(page) })
    if (trimmed) {
      params.set('folder', 'all')
      params.set('q', trimmed)
    } else {
      params.set('folder', folderId ?? 'root')
    }
    return params
  }

  useEffect(() => {
    if (folderId === undefined) return
    let cancelled = false
    pageRef.current = 1
    const timer = setTimeout(() => {
      if (!cancelled) setLoading(true)
      fetch(`/api/admin/media?${buildParams(1).toString()}`)
        .then((r) => r.json())
        .then((d) => {
          if (cancelled) return
          setItems(d.items ?? [])
          setHasMore(Boolean(d.hasMore))
          setLoading(false)
        })
        .catch(() => { if (!cancelled) setLoading(false) })
    }, trimmed ? 250 : 0)
    return () => { cancelled = true; clearTimeout(timer) }
    // buildParams is derived from exactly these, so listing it would only add noise.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folderId, trimmed, sort, reloadKey])

  // Appends the next page. Deduped by id because an upload landing mid-browse
  // can shift rows between pages.
  function loadMore() {
    if (loadingMore || !hasMore) return
    setLoadingMore(true)
    const next = pageRef.current + 1
    fetch(`/api/admin/media?${buildParams(next).toString()}`)
      .then((r) => r.json())
      .then((d) => {
        pageRef.current = next
        setItems((prev) => {
          const seen = new Set(prev.map((i) => i.id))
          return [...prev, ...((d.items ?? []) as MediaItem[]).filter((i) => !seen.has(i.id))]
        })
        setHasMore(Boolean(d.hasMore))
        setLoadingMore(false)
      })
      .catch(() => setLoadingMore(false))
  }

  // Subfolders of the current level, hidden while searching (search spans all).
  const subfolders = trimmed || folderId === undefined ? [] : folders.filter((f) => f.parentId === folderId)

  // Breadcrumb trail from root down to the current folder.
  const breadcrumb: Folder[] = []
  if (!trimmed && folderId) {
    const byId = new Map(folders.map((f) => [f.id, f]))
    let cur = byId.get(folderId)
    while (cur) {
      breadcrumb.unshift(cur)
      cur = cur.parentId ? byId.get(cur.parentId) : undefined
    }
  }

  function toggle(item: MediaItem) {
    setPicked((prev) => {
      const next = new Map(prev)
      if (next.has(item.id)) next.delete(item.id)
      else next.set(item.id, item)
      return next
    })
  }

  async function handleUpload(file: File) {
    setUploading(true)
    setUploadError(null)
    const uploadFolderId = resolveFolderId ? await resolveFolderId() : null
    const body = new FormData()
    body.append('file', file)
    if (uploadFolderId) body.append('folderId', uploadFolderId)
    const res = await fetch('/api/admin/media', { method: 'POST', body })
    setUploading(false)
    if (!res.ok) { setUploadError((await res.json().catch(() => ({}))).error ?? 'Upload failed'); return }
    const uploaded = await res.json().catch(() => null) as MediaItem | null

    // Tick the new image straight away: the admin just picked the file, so
    // making them hunt for it in the grid is a step for the sake of it. The
    // upload files into the product's folder, which may not be the folder on
    // screen - so jump there (it exists now the upload has made it), which both
    // shows the image and re-lists the folder it now sits in.
    if (uploaded?.id) {
      const foldersRes = await fetch('/api/admin/media/folders').then((r) => r.ok ? r.json() : null).catch(() => null)
      if (foldersRes?.folders) setFolders(foldersRes.folders)
      setQuery('')
      setFolderId(uploadFolderId ?? null)
      // Covers the case where the upload folder is the folder already on screen:
      // the folder effect wouldn't re-run on its own, so nudge it.
      setReloadKey((k) => k + 1)
      setPicked((prev) => new Map(prev).set(uploaded.id, uploaded))
    }
  }

  const crumbStyle = { background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: '0.8125rem', color: 'var(--color-primary)', fontFamily: 'inherit' } as const

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'var(--color-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div style={{ background: 'var(--color-surface)', borderRadius: 8, width: '90vw', maxWidth: 800, maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0,0,0,.25)' }}>
        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--color-border)', display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, flexShrink: 0 }}>Select images</h3>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search all folders…"
            autoFocus
            style={{ flex: 1, padding: '0.375rem 0.75rem', border: '1px solid var(--color-border)', borderRadius: 6, fontSize: '0.875rem', fontFamily: 'inherit', background: 'var(--color-bg)', color: 'var(--color-text)' }}
          />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            aria-label="Sort images"
            style={{ padding: '0.375rem 0.5rem', border: '1px solid var(--color-border)', borderRadius: 6, fontSize: '0.8125rem', fontFamily: 'inherit', background: 'var(--color-bg)', color: 'var(--color-text)', flexShrink: 0 }}
          >
            {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleUpload(f) }} />
          <button type="button" className="btn btn-secondary btn-sm" disabled={uploading} onClick={() => fileInputRef.current?.click()}>{uploading ? 'Uploading…' : 'Upload new'}</button>
          <button type="button" aria-label="Close" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.25rem', color: 'var(--color-text-muted)', lineHeight: 1, flexShrink: 0 }}>×</button>
        </div>
        {uploadError && <p style={{ color: 'var(--color-danger)', margin: '0.5rem 1.25rem 0', fontSize: '0.8125rem' }}>{uploadError}</p>}
        {!trimmed && folderId !== undefined && (
          <div style={{ padding: '0.5rem 1.25rem 0', display: 'flex', gap: '0.375rem', alignItems: 'center', flexWrap: 'wrap', fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
            {breadcrumb.length === 0
              ? <span>All folders</span>
              : <button type="button" style={crumbStyle} onClick={() => setFolderId(null)}>All folders</button>}
            {breadcrumb.map((f, i) => (
              <span key={f.id} style={{ display: 'inline-flex', gap: '0.375rem', alignItems: 'center' }}>
                <span aria-hidden>/</span>
                {i === breadcrumb.length - 1
                  ? <span style={{ color: 'var(--color-text)' }}>{f.name}</span>
                  : <button type="button" style={crumbStyle} onClick={() => setFolderId(f.id)}>{f.name}</button>}
              </span>
            ))}
          </div>
        )}
        <div style={{ padding: '1rem', overflowY: 'auto', flex: 1 }}>
          {subfolders.length > 0 && (
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
              {subfolders.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFolderId(f.id)}
                  style={{
                    display: 'inline-flex', gap: '0.375rem', alignItems: 'center', padding: '0.375rem 0.625rem',
                    border: '1px solid var(--color-border)', borderRadius: 6, background: 'var(--color-bg-subtle)',
                    cursor: 'pointer', fontSize: '0.8125rem', color: 'var(--color-text)', fontFamily: 'inherit',
                  }}
                >
                  <span aria-hidden>📁</span>
                  {f.name}
                </button>
              ))}
            </div>
          )}
          {(loading || folderId === undefined) && <p style={{ color: 'var(--color-text-muted)', textAlign: 'center' }}>Loading…</p>}
          {!loading && folderId !== undefined && items.filter((i) => i.mimeType.startsWith('image/')).length === 0 && subfolders.length === 0 && (
            <p style={{ color: 'var(--color-text-muted)', textAlign: 'center', padding: '1rem', fontSize: '0.875rem' }}>
              {trimmed ? 'No images match that search.' : 'No images in this folder yet.'}
            </p>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '0.75rem' }}>
            {folderId !== undefined && items.filter((i) => i.mimeType.startsWith('image/')).map((item) => {
              const selected = picked.has(item.id)
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => toggle(item)}
                  style={{
                    position: 'relative', border: `2px solid ${selected ? 'var(--color-primary)' : 'var(--color-border)'}`, borderRadius: 6,
                    background: 'var(--color-bg-subtle)', cursor: 'pointer', padding: 0, overflow: 'hidden', textAlign: 'left',
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.url} alt={item.altText ?? ''} style={{ width: '100%', height: 100, objectFit: 'cover', display: 'block' }} />
                  <div style={{ padding: '0.375rem 0.5rem', fontSize: '0.75rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--color-text-secondary)' }}>
                    {item.key.split('/').pop()}
                  </div>
                </button>
              )
            })}
          </div>
          {!loading && hasMore && (
            <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '0.875rem' }}>
              <button type="button" className="btn btn-secondary btn-sm" disabled={loadingMore} onClick={loadMore}>
                {loadingMore ? 'Loading…' : 'Load more'}
              </button>
            </div>
          )}
        </div>
        <div style={{ padding: '0.75rem 1.25rem', borderTop: '1px solid var(--color-border)', display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={picked.size === 0}
            onClick={() => onAdd(Array.from(picked.values()))}
          >
            Add {picked.size > 0 ? picked.size : ''} image{picked.size === 1 ? '' : 's'}
          </button>
        </div>
      </div>
    </div>
  )
}
