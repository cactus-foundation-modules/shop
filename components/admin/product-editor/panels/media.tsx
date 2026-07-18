'use client'

import { useCallback, useState } from 'react'
import { MediaPickerModal } from '@/modules/shop/components/admin/MediaPickerModal'
import { EmptyNote, Section } from '@/modules/shop/components/admin/product-editor/fields'
import type { MediaItem, PanelProps } from '@/modules/shop/components/admin/product-editor/model'

/** Images in shopper-facing order. The first one is the cover, so reordering is
 * the same gesture as choosing the cover; drag to reorder, or use the arrows,
 * which are also the keyboard route. */
export function MediaPanel({ state, patch, productId }: PanelProps & { productId: string }) {
  const [picking, setPicking] = useState(false)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)
  const media = state.media
  const masterCategoryId = state.form.masterCategoryId

  // Where a new upload is filed: Shop / <category> / <product>, resolved at the
  // moment of upload so the image goes straight there instead of landing in the
  // library root and waiting for the save to move it. Asked for per upload
  // rather than up front: it creates the folder, so doing it on mount would
  // leave an empty one behind for every product whose Images tab was opened,
  // and it picks up the category currently chosen on screen, which may not be
  // the saved one yet. Null on failure - the upload still works, it just lands
  // in the root as it always used to.
  const resolveUploadFolderId = useCallback(async (): Promise<string | null> => {
    const query = masterCategoryId ? `?masterCategoryId=${encodeURIComponent(masterCategoryId)}` : ''
    try {
      const res = await fetch(`/api/m/shop/admin/products/${productId}/media-folder${query}`, { method: 'POST' })
      if (!res.ok) return null
      return (await res.json()).folderId ?? null
    } catch {
      return null
    }
  }, [productId, masterCategoryId])

  // Where the picker OPENS: the same product folder, but resolved with a look
  // rather than a create (GET vs POST), falling back to the deepest ancestor
  // that exists - so browsing leaves no empty folder behind and the admin still
  // lands among this product's images rather than the whole library at once.
  const resolveBrowseFolderId = useCallback(async (): Promise<string | null> => {
    const query = masterCategoryId ? `?masterCategoryId=${encodeURIComponent(masterCategoryId)}` : ''
    try {
      const res = await fetch(`/api/m/shop/admin/products/${productId}/media-folder${query}`)
      if (!res.ok) return null
      return (await res.json()).folderId ?? null
    } catch {
      return null
    }
  }, [productId, masterCategoryId])

  const setMedia = (next: MediaItem[]) => patch((s) => ({ ...s, media: next }))

  function move(from: number, to: number) {
    if (to < 0 || to >= media.length || from === to) return
    const next = [...media]
    const [item] = next.splice(from, 1)
    if (item) next.splice(to, 0, item)
    setMedia(next)
  }

  return (
    <div className="spe-panel">
      <Section
        title="Images"
        blurb="The first image is the cover: it is what shows on listing cards and in the cart. Drag to reorder, or use the arrows."
        actions={<button type="button" className="btn btn-primary btn-sm" onClick={() => setPicking(true)}>Add images</button>}
      >
        {media.length === 0 ? (
          <EmptyNote>No images yet. A product without a picture rarely sells, so this one is worth doing.</EmptyNote>
        ) : (
          <div className="spe-media">
            {media.map((m, i) => (
              <div
                key={`${m.url}-${i}`}
                className="spe-media-item"
                data-dragging={dragIndex === i ? 'true' : undefined}
                data-drop={dropIndex === i && dragIndex !== i ? 'true' : undefined}
                onDragOver={(e) => { e.preventDefault(); setDropIndex(i) }}
                onDrop={(e) => {
                  e.preventDefault()
                  if (dragIndex != null) move(dragIndex, i)
                  setDragIndex(null); setDropIndex(null)
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- media library URLs are arbitrary remote hosts, not a configured next/image loader */}
                <img className="spe-media-img" src={m.url} alt={m.altText ?? ''} />
                {i === 0 && <span className="spe-media-cover">Cover</span>}
                <input
                  className="spe-alt"
                  value={m.altText ?? ''}
                  placeholder="Describe this image"
                  aria-label={`Alt text for image ${i + 1}`}
                  onChange={(e) => setMedia(media.map((x, j) => (j === i ? { ...x, altText: e.target.value } : x)))}
                />
                <div className="spe-media-bar">
                  <span
                    className="spe-media-handle"
                    draggable
                    aria-hidden
                    onDragStart={() => setDragIndex(i)}
                    onDragEnd={() => { setDragIndex(null); setDropIndex(null) }}
                  >
                    ⠿
                  </span>
                  <span style={{ display: 'flex', gap: '0.125rem' }}>
                    <button type="button" className="spe-icon-btn" disabled={i === 0} aria-label={`Move image ${i + 1} earlier`} onClick={() => move(i, i - 1)}>←</button>
                    <button type="button" className="spe-icon-btn" disabled={i === media.length - 1} aria-label={`Move image ${i + 1} later`} onClick={() => move(i, i + 1)}>→</button>
                    <button
                      type="button"
                      className="spe-icon-btn spe-icon-btn-danger"
                      aria-label={`Remove image ${i + 1}`}
                      onClick={() => setMedia(media.filter((_, j) => j !== i))}
                    >
                      ×
                    </button>
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {picking && (
          <MediaPickerModal
            resolveFolderId={resolveUploadFolderId}
            resolveInitialFolderId={resolveBrowseFolderId}
            onClose={() => setPicking(false)}
            onAdd={(items) => {
              const fresh = items
                .filter((i) => !media.some((m) => m.url === i.url))
                .map((i) => ({ type: 'IMAGE' as const, url: i.url, altText: i.altText }))
              setMedia([...media, ...fresh])
              setPicking(false)
            }}
          />
        )}
      </Section>
    </div>
  )
}
