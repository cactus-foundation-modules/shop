'use client'

import { useState } from 'react'

// On an issue report in the queue: ask the customer for photographs, and add
// ones that arrived some other way (by reply email, from the courier, from the
// warehouse). Its own component so the queue row only has to say where it goes.

export type IssuePhotoRow = {
  id: string
  status: string
  photosRequestedAt: string | null
  photosRequestNote: string | null
  photos: Array<{ id: string; createdAt: string; addedBy: string | null }>
}

const hint: React.CSSProperties = { margin: 0, color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }

export function IssuePhotoActions({ row, onChanged }: {
  row: IssuePhotoRow
  /** Called after anything is saved, with a sentence for the page's own banner. */
  onChanged: (message: { tone: 'error' | 'success'; text: string }) => void
}) {
  const [asking, setAsking] = useState(false)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const askedAt = row.photosRequestedAt ? new Date(row.photosRequestedAt) : null
  // What has come in from the customer since the last ask - the question the
  // owner is actually asking when they look at a report they chased.
  const sinceAsk = askedAt
    ? row.photos.filter((photo) => photo.addedBy === null && new Date(photo.createdAt) > askedAt).length
    : 0

  async function ask() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/m/shop/admin/requests/${row.id}/photo-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: note.trim() || null }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string; emailError?: string | null }
      if (!res.ok) {
        setError(data.error ?? `That did not go through (${res.status}).`)
        return
      }
      setAsking(false)
      setNote('')
      onChanged(data.emailError
        ? { tone: 'error', text: data.emailError }
        : { tone: 'success', text: 'Photographs asked for. They have an email with a link straight to the report.' })
    } catch {
      setError('That did not go through. Try again in a moment.')
    } finally {
      setBusy(false)
    }
  }

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return
    setUploading(true)
    setError(null)
    let added = 0
    try {
      // One at a time, as the customer's upload does: a slow connection then
      // loses one photograph rather than the batch.
      for (const file of Array.from(files)) {
        const body = new FormData()
        body.append('file', file)
        const res = await fetch(`/api/m/shop/admin/requests/${row.id}/photos`, { method: 'POST', body })
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        if (!res.ok) {
          setError(data.error ?? `${file.name} did not go through (${res.status}).`)
          break
        }
        added += 1
      }
    } finally {
      setUploading(false)
      if (added > 0) onChanged({ tone: 'success', text: `${added} photograph${added === 1 ? '' : 's'} added to the report.` })
    }
  }

  return (
    <div style={{ display: 'grid', gap: '0.5rem' }}>
      {askedAt && (
        <p style={hint}>
          Photographs asked for {askedAt.toLocaleDateString('en-GB')}
          {row.photosRequestNote ? ` - "${row.photosRequestNote}"` : ''}
          {sinceAsk > 0 ? ` · ${sinceAsk} sent since` : ' · nothing sent yet'}
        </p>
      )}

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        {row.status === 'PENDING' && !asking && (
          <button type="button" className="btn btn-sm" onClick={() => setAsking(true)}>
            {askedAt ? 'Ask for photos again' : 'Ask for photos'}
          </button>
        )}
        <label className="btn btn-sm" style={{ cursor: uploading ? 'progress' : 'pointer' }}>
          {uploading ? 'Adding…' : 'Add photos'}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            disabled={uploading}
            className="sr-only"
            onChange={(e) => {
              void upload(e.target.files)
              e.target.value = ''
            }}
          />
        </label>
      </div>

      {asking && (
        <div style={{ display: 'grid', gap: '0.5rem', borderTop: '1px solid var(--color-border)', paddingTop: 'var(--space-3)' }}>
          <label style={{ display: 'grid', gap: '0.25rem' }}>
            <span style={{ fontWeight: 'var(--font-medium)' }}>What do you need a photograph of? (optional)</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              maxLength={1000}
              placeholder="The label on the end of the box, say, or the underside of the top"
            />
            <span className="field-hint">
              Goes in the email and beside the upload button on their order page. The email wording is yours to change
              under Settings &rarr; Emails.
            </span>
          </label>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => void ask()} disabled={busy}>
              {busy ? 'Sending…' : 'Send the request'}
            </button>
            <button type="button" className="btn btn-sm" onClick={() => { setAsking(false); setError(null) }} disabled={busy}>
              Not now
            </button>
          </div>
        </div>
      )}

      {error && <p style={{ color: 'var(--color-danger)', fontSize: 'var(--text-sm)', margin: 0 }}>{error}</p>}
    </div>
  )
}
