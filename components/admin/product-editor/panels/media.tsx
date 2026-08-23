'use client'

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useAdminPath } from '@/components/admin/AdminPathContext'
import { MediaPickerModal } from '@/modules/shop/components/admin/MediaPickerModal'
import { EmptyNote, Section } from '@/modules/shop/components/admin/product-editor/fields'
import { GalleryExtrasProvider, useGalleryExtras, type GalleryExtraItem } from '@/modules/shop/components/admin/product-editor/gallery-extras'
import type { MediaItem, PanelProps } from '@/modules/shop/components/admin/product-editor/model'

/** One tile in the grid: the product's own photograph, or a picture another
 * module contributed (see gallery-extras.tsx). They share one set of arrows,
 * because to the shopper they are one gallery. */
type Row =
  | { kind: 'media'; item: MediaItem; index: number }
  | { kind: 'extra'; item: GalleryExtraItem }

/**
 * Rebuild the gallery from the product's own images and the contributed ones.
 *
 * A contributed picture's `position` is its index in the FINISHED list, so this
 * lays the product's own out in order and drops each contributed one into the
 * slot it asked for. Deliberately forgiving rather than exact: a contributed
 * picture that asked for slot 7 of a gallery that now has four pictures simply
 * lands at the end, and deleting one of the product's own shuffles the rest up.
 * Anything stricter would need the two owners to write to each other every time
 * an image was added, which is exactly the coupling this avoids.
 *
 * `extras` must already be in gallery order - useGalleryExtras sorts them.
 */
export function mergeGalleryRows(media: MediaItem[], extras: GalleryExtraItem[]): Row[] {
  const rows: Row[] = []
  let next = 0
  for (const extra of extras) {
    const target = extra.position ?? Number.POSITIVE_INFINITY
    while (next < media.length && rows.length < target) {
      rows.push({ kind: 'media', item: media[next]!, index: next })
      next += 1
    }
    rows.push({ kind: 'extra', item: extra })
  }
  while (next < media.length) {
    rows.push({ kind: 'media', item: media[next]!, index: next })
    next += 1
  }
  return rows
}

/** Images in shopper-facing order. The first one is the cover, so reordering is
 * the same gesture as choosing the cover; drag to reorder, or use the arrows,
 * which are also the keyboard route. */
export function MediaPanel(props: PanelProps & { productId: string, sections?: ReactNode[] }) {
  // The provider has to sit above BOTH the grid and the contributed sections:
  // the sections are what register the extra pictures, and the grid is what
  // draws them.
  return (
    <GalleryExtrasProvider>
      <MediaPanelInner {...props} />
    </GalleryExtrasProvider>
  )
}

function MediaPanelInner({ state, patch, productId, sections = [] }: PanelProps & { productId: string, sections?: ReactNode[] }) {
  const adminPath = useAdminPath()
  const [picking, setPicking] = useState(false)
  const [browseFolderId, setBrowseFolderId] = useState<string | null>(null)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)
  const media = state.media
  const masterCategoryId = state.form.masterCategoryId
  const extras = useGalleryExtras()

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

  // The same folder the picker opens in, held for the "Open in media library"
  // link so it is a real href - middle-click and open-in-new-tab work, which a
  // resolve-on-click button would break. GET only, so looking at the tab still
  // creates nothing; re-run when the category changes on screen because that is
  // what decides which folder the images belong in. Null (or not yet resolved)
  // simply lands on the library root.
  useEffect(() => {
    let live = true
    void resolveBrowseFolderId().then((id) => { if (live) setBrowseFolderId(id) })
    return () => { live = false }
  }, [resolveBrowseFolderId])

  const mediaHref = `/${adminPath}/media${browseFolderId ? `?folder=${encodeURIComponent(browseFolderId)}` : ''}`

  const rows = mergeGalleryRows(media, extras.items)

  // Every change to the gallery goes through here, whichever tile moved and
  // whoever owns it: the product keeps the photographs that are its own, in the
  // order they now sit in, and each contributed picture is told its new index in
  // the finished list. Doing it in one place is what stops the two orders
  // drifting apart when an image is added or deleted next to a contributed one.
  const commit = (next: Row[]) => {
    patch((s) => ({ ...s, media: next.flatMap((r) => (r.kind === 'media' ? [r.item] : [])) }))
    if (extras.items.length > 0) {
      extras.reorder(next.flatMap((r, i) => (r.kind === 'extra' ? [{ id: r.item.id, position: i }] : [])))
    }
  }

  function move(from: number, to: number) {
    if (to < 0 || to >= rows.length || from === to) return
    const next = [...rows]
    const [row] = next.splice(from, 1)
    if (!row) return
    next.splice(to, 0, row)
    commit(next)
  }

  const setAltText = (row: Row, value: string) => {
    if (row.kind === 'extra') { extras.setAltText(row.item.id, value); return }
    patch((s) => ({ ...s, media: s.media.map((m, j) => (j === row.index ? { ...m, altText: value } : m)) }))
  }

  const removeRow = (at: number) => {
    const row = rows[at]
    if (!row) return
    // A contributed tile is not ours to delete - the module decides what its ×
    // means (the variations module drops the picture off the gallery and leaves
    // it on its variation). It disappears from the grid when the module stops
    // contributing it, so the order is re-stated for what's left either way.
    if (row.kind === 'extra') extras.remove(row.item.id)
    commit(rows.filter((_, i) => i !== at))
  }

  return (
    <div className="spe-panel">
      <Section
        title="Images"
        blurb="The first image is the cover: it is what shows on listing cards and in the cart. Drag to reorder, or use the arrows."
        actions={(
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <a
              className="btn btn-secondary btn-sm"
              href={mediaHref}
              target="_blank"
              rel="noopener noreferrer"
              title="Open this product's folder in the media library"
            >
              Media library ↗
            </a>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setPicking(true)}>Add images</button>
          </div>
        )}
      >
        {rows.length === 0 ? (
          <EmptyNote>No images yet. A product without a picture rarely sells, so this one is worth doing.</EmptyNote>
        ) : (
          <div className="spe-media">
            {rows.map((row, i) => (
              <div
                key={row.kind === 'extra' ? `x-${row.item.id}` : `m-${row.item.url}-${row.index}`}
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
                <img className="spe-media-img" src={row.item.url} alt={row.item.altText ?? ''} />
                {i === 0 && <span className="spe-media-cover">Cover</span>}
                {row.kind === 'extra' && <span className="spe-media-tag">{row.item.badge}</span>}
                {row.kind === 'extra' && row.item.caption && (
                  <span className="spe-media-note" title={row.item.caption}>{row.item.caption}</span>
                )}
                <input
                  className="spe-alt"
                  value={row.item.altText ?? ''}
                  placeholder="Describe this image"
                  aria-label={`Alt text for image ${i + 1}`}
                  onChange={(e) => setAltText(row, e.target.value)}
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
                    <button type="button" className="spe-icon-btn" disabled={i === rows.length - 1} aria-label={`Move image ${i + 1} later`} onClick={() => move(i, i + 1)}>→</button>
                    <button
                      type="button"
                      className="spe-icon-btn spe-icon-btn-danger"
                      title={row.kind === 'extra' ? row.item.removeLabel : undefined}
                      aria-label={row.kind === 'extra' ? row.item.removeLabel ?? `Remove image ${i + 1}` : `Remove image ${i + 1}`}
                      onClick={() => removeRow(i)}
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
              const fresh: Row[] = items
                .filter((i) => !media.some((m) => m.url === i.url))
                .map((i, k) => ({ kind: 'media', item: { type: 'IMAGE', url: i.url, altText: i.altText }, index: media.length + k }))
              // Added at the END of the whole gallery, not the end of the
              // product's own pictures - "add" means "put it last", and a
              // contributed tile sitting after it would make a liar of that.
              commit([...rows, ...fresh])
              setPicking(false)
            }}
          />
        )}
      </Section>

      {/* Anything another module has to say about this product's pictures - the
          ones it contributes to the grid above, and any note explaining where
          they come from - sits under the grid rather than in a tab of its own,
          because it is about the images already on this screen. Shop knows
          nothing of what they are; see shop.product-editor-media-sections. */}
      {sections}
    </div>
  )
}
