'use client'

import { useState } from 'react'

// Choosing and uploading photographs for an issue report, shared by the report
// form and the "add photographs" form on a report already in, so the two cannot
// drift apart on how a photograph is shrunk, sent, shown or taken back off.

export type IssuePhoto = { mediaId: string; url: string; name: string }

const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp']

const muted: React.CSSProperties = { color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }

/**
 * Shrinks a photograph in the browser before it is sent.
 *
 * A phone camera hands over eight megapixels and four megabytes, the upload
 * limit is four, and the shop needs to see a broken corner rather than the
 * weave of the fabric. Sixteen hundred pixels on the long edge is plenty for
 * both, and it turns a minute of hotel wi-fi into a couple of seconds.
 *
 * Falls back to the original file whenever anything goes wrong - a canvas the
 * browser will not give us is a reason to send the big one, not to lose the
 * photograph.
 */
async function shrink(file: File): Promise<File> {
  if (!PHOTO_TYPES.includes(file.type)) return file
  try {
    const bitmap = await createImageBitmap(file)
    const longest = Math.max(bitmap.width, bitmap.height)
    const scale = longest > 1600 ? 1600 / longest : 1
    const width = Math.round(bitmap.width * scale)
    const height = Math.round(bitmap.height * scale)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) return file
    context.drawImage(bitmap, 0, 0, width, height)
    bitmap.close?.()
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82))
    if (!blob || blob.size >= file.size) return file
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' })
  } catch {
    return file
  }
}

/** The photographs chosen so far, and the upload that adds to them. */
export function useIssuePhotos(orderId: string, max: number, onError: (message: string | null) => void) {
  const [photos, setPhotos] = useState<IssuePhoto[]>([])
  const [uploading, setUploading] = useState(false)

  async function addPhotos(files: FileList | null) {
    if (!files || files.length === 0) return
    onError(null)
    setUploading(true)
    try {
      let count = photos.length
      for (const file of Array.from(files)) {
        // Checked as we go rather than up front: the cap is on what ends up on
        // the report, and somebody who picks eight should keep the first six
        // rather than be told to start again.
        if (count + 1 > max) {
          onError(`That is as many as we need - ${max} is the limit.`)
          break
        }
        const body = new FormData()
        body.append('file', await shrink(file))
        const res = await fetch(`/api/m/shop/member/orders/${orderId}/photos`, { method: 'POST', body })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          onError(data.error ?? 'That photograph did not go through. Try again in a moment.')
          break
        }
        count += 1
        setPhotos((current) =>
          current.length >= max ? current : [...current, { mediaId: data.mediaId, url: data.url, name: file.name }],
        )
      }
    } finally {
      setUploading(false)
    }
  }

  return {
    photos,
    uploading,
    addPhotos,
    removePhoto: (mediaId: string) => setPhotos((current) => current.filter((photo) => photo.mediaId !== mediaId)),
    clear: () => setPhotos([]),
  }
}

/** The thumbnails of what has been chosen, and the file input that adds more. */
export function IssuePhotoPicker({ photos, max, uploading, disabled, onAdd, onRemove }: {
  photos: IssuePhoto[]
  max: number
  uploading: boolean
  disabled?: boolean
  onAdd: (files: FileList | null) => void
  onRemove: (mediaId: string) => void
}) {
  return (
    <>
      {photos.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          {photos.map((photo) => (
            <span key={photo.mediaId} style={{ position: 'relative', display: 'inline-flex' }}>
              {/* eslint-disable-next-line @next/next/no-img-element -- a
                  just-uploaded file on a provider domain the image loader is not
                  configured for; a thumbnail of their own photograph, not page
                  furniture. */}
              <img
                src={photo.url}
                alt={photo.name}
                style={{ width: 84, height: 84, objectFit: 'cover', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}
              />
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => onRemove(photo.mediaId)}
                aria-label={`Remove ${photo.name}`}
                style={{ position: 'absolute', top: 2, right: 2, padding: '0 0.375rem', lineHeight: 1.4 }}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      {photos.length < max && (
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          disabled={uploading || disabled}
          onChange={(e) => {
            onAdd(e.target.files)
            // Cleared so the same file can be picked again after a failure - a
            // file input fires nothing when the value has not changed, and
            // "nothing happens" is a maddening way to fail.
            e.target.value = ''
          }}
        />
      )}
      {uploading && <p style={{ margin: 0, ...muted }}>Sending your photographs…</p>}
    </>
  )
}
