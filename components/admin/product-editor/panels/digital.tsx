'use client'

import { useState } from 'react'
import { tooLargeReason, uploadErrorMessage } from '@/lib/media/limits'
import { Control, Field, Grid, Section } from '@/modules/shop/components/admin/product-editor/fields'
import type { PanelProps } from '@/modules/shop/components/admin/product-editor/model'
import { DIGITAL_FILE_MAX_BYTES, DIGITAL_FILE_MAX_MB, needsDirectUpload } from '@/modules/shop/lib/direct-upload'
import { sendToStorage, shopRouteError } from '@/modules/shop/lib/direct-upload-client'

const ROUTE = '/api/m/shop/admin/digital-files'

type Uploaded = { id: string } | { error: string }

/** The new file's row id out of a successful reply, or why there is not one. */
async function recordFrom(res: Response): Promise<Uploaded> {
  const data: unknown = await res.json().catch(() => null)
  const id = typeof data === 'object' && data !== null && 'id' in data ? (data as { id: unknown }).id : null
  return typeof id === 'string' ? { id } : { error: 'The file uploaded, but the reply could not be read. Reload the page to see whether it is attached.' }
}

/** Small enough for the site to carry: posted as a form, the way it always was. */
async function uploadAsForm(file: File): Promise<Uploaded> {
  const body = new FormData()
  body.append('file', file)
  const res = await fetch(ROUTE, { method: 'POST', body })
  // Reads our own { error } or, for a refusal from the hosting platform that
  // never reached the route, says what it was rather than "try again".
  if (!res.ok) return { error: await uploadErrorMessage(res, file) }
  return recordFrom(res)
}

/** Too big for that: straight into storage, then the route is told where it went. */
async function uploadDirect(file: File): Promise<Uploaded> {
  const sent = await sendToStorage(ROUTE, file, { limitMb: DIGITAL_FILE_MAX_MB, prepare: { type: file.type } })
  if (!sent.ok) return { error: sent.error }
  const res = await fetch(ROUTE, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'record', filename: file.name, type: file.type, key: sent.key, token: sent.token }),
  })
  if (!res.ok) return { error: await shopRouteError(res, file, DIGITAL_FILE_MAX_MB) }
  return recordFrom(res)
}

/** Only mounted for DIGITAL products. The upload writes immediately (it is a
 * file, not a form field); the limits below it save with everything else. */
export function DigitalPanel({ state, setField, errors }: PanelProps) {
  const f = state.form
  const [uploading, setUploading] = useState(false)
  const [uploadedName, setUploadedName] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function upload(file: File) {
    setError(null)
    // The server's own ceiling, checked before the upload starts: past it the
    // file is refused whatever happens, so there is no sense waiting to be told.
    if (file.size > DIGITAL_FILE_MAX_BYTES) {
      setError(`${file.name}: ${tooLargeReason(file.size, DIGITAL_FILE_MAX_MB)}`)
      return
    }
    setUploading(true)
    try {
      // Anything the site's own request can carry still goes as a form; only a
      // bigger file needs the direct path, and the storage set-up it relies on.
      const result = needsDirectUpload(file.size) ? await uploadDirect(file) : await uploadAsForm(file)
      if ('error' in result) {
        setError(result.error)
        return
      }
      setField('digitalFileId', result.id)
      setUploadedName(file.name)
    } catch {
      setError('That upload did not work. Try again.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="spe-panel">
      <Section
        title="The file"
        blurb={`What the buyer downloads once they have paid, up to ${DIGITAL_FILE_MAX_MB} MB. Replacing it here changes it for everyone, including past buyers whose links still work.`}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.875rem', color: f.digitalFileId ? 'var(--color-text)' : 'var(--color-text-secondary)' }}>
            {uploadedName ?? (f.digitalFileId ? 'A file is attached.' : 'Nothing uploaded yet.')}
          </span>
          <label className="btn btn-secondary btn-sm" style={{ cursor: uploading ? 'wait' : 'pointer' }}>
            {uploading ? 'Uploading…' : f.digitalFileId ? 'Replace file' : 'Upload file'}
            <input
              type="file"
              style={{ display: 'none' }}
              disabled={uploading}
              onChange={(e) => { const file = e.target.files?.[0]; if (file) void upload(file) }}
            />
          </label>
        </div>
        {error && <p className="spe-error" role="alert" style={{ marginTop: '0.5rem' }}><span aria-hidden>⚠</span>{error}</p>}
      </Section>

      <Section title="Download limits" blurb="Both are optional. Leave them empty for unlimited, forever.">
        <Grid cols={2}>
          <Field label="Download limit" optional error={errors.downloadLimit} hint="How many times one buyer can download it.">
            {(p) => <Control {...p} inputMode="numeric" value={f.downloadLimit} onChange={(e) => setField('downloadLimit', e.target.value)} placeholder="Unlimited" />}
          </Field>
          <Field label="Link expires after" optional error={errors.downloadExpiry} hint="Counted from the moment they buy.">
            {(p) => <Control {...p} inputMode="numeric" value={f.downloadExpiry} onChange={(e) => setField('downloadExpiry', e.target.value)} suffix="days" placeholder="Never" />}
          </Field>
        </Grid>
      </Section>
    </div>
  )
}
