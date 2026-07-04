'use client'

import { useEffect, useRef, useState } from 'react'

type MediaItem = { id: string; url: string; key: string; altText: string | null; mimeType: string }

// Adapted from modules/directory/components/admin/EntryImagesField.tsx's
// MultiMediaPickerModal - browses core's shared media library
// (GET /api/admin/media) and adds an upload tab against the same endpoint's
// POST, since shop stores product media as plain URLs rather than media IDs.
export function MediaPickerModal({ onAdd, onClose }: { onAdd: (items: MediaItem[]) => void; onClose: () => void }) {
  const [items, setItems] = useState<MediaItem[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function refresh() {
    fetch('/api/admin/media?perPage=50')
      .then((r) => r.json())
      .then((d) => { setItems(d.items ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }
  useEffect(refresh, [])

  const filtered = query
    ? items.filter((i) => i.key.toLowerCase().includes(query.toLowerCase()) || (i.altText ?? '').toLowerCase().includes(query.toLowerCase()))
    : items

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleUpload(file: File) {
    setUploading(true)
    setUploadError(null)
    const body = new FormData()
    body.append('file', file)
    const res = await fetch('/api/admin/media', { method: 'POST', body })
    setUploading(false)
    if (!res.ok) { setUploadError((await res.json()).error ?? 'Upload failed'); return }
    refresh()
  }

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
            placeholder="Search…"
            autoFocus
            style={{ flex: 1, padding: '0.375rem 0.75rem', border: '1px solid var(--color-border)', borderRadius: 6, fontSize: '0.875rem', fontFamily: 'inherit', background: 'var(--color-bg)', color: 'var(--color-text)' }}
          />
          <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleUpload(f) }} />
          <button type="button" className="btn btn-secondary btn-sm" disabled={uploading} onClick={() => fileInputRef.current?.click()}>{uploading ? 'Uploading…' : 'Upload new'}</button>
          <button type="button" aria-label="Close" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.25rem', color: 'var(--color-text-muted)', lineHeight: 1, flexShrink: 0 }}>×</button>
        </div>
        {uploadError && <p style={{ color: 'var(--color-danger, #c00)', margin: '0.5rem 1.25rem 0', fontSize: '0.8125rem' }}>{uploadError}</p>}
        <div style={{ padding: '1rem', overflowY: 'auto', flex: 1 }}>
          {loading && <p style={{ color: 'var(--color-text-muted)', textAlign: 'center' }}>Loading…</p>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '0.75rem' }}>
            {filtered.filter((i) => i.mimeType.startsWith('image/')).map((item) => {
              const selected = picked.has(item.id)
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => toggle(item.id)}
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
        </div>
        <div style={{ padding: '0.75rem 1.25rem', borderTop: '1px solid var(--color-border)', display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={picked.size === 0}
            onClick={() => onAdd(items.filter((i) => picked.has(i.id)))}
          >
            Add {picked.size > 0 ? picked.size : ''} image{picked.size === 1 ? '' : 's'}
          </button>
        </div>
      </div>
    </div>
  )
}
