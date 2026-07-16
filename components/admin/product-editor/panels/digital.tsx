'use client'

import { useState } from 'react'
import { Control, Field, Grid, Section } from '@/modules/shop/components/admin/product-editor/fields'
import type { PanelProps } from '@/modules/shop/components/admin/product-editor/model'

/** Only mounted for DIGITAL products. The upload writes immediately (it is a
 * file, not a form field); the limits below it save with everything else. */
export function DigitalPanel({ state, setField, errors }: PanelProps) {
  const f = state.form
  const [uploading, setUploading] = useState(false)
  const [uploadedName, setUploadedName] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function upload(file: File) {
    setUploading(true)
    setError(null)
    try {
      const body = new FormData()
      body.append('file', file)
      const res = await fetch('/api/m/shop/admin/digital-files', { method: 'POST', body })
      if (!res.ok) {
        setError((await res.json().catch(() => ({}))).error ?? 'That upload did not work. Try again.')
        return
      }
      const record = await res.json()
      setField('digitalFileId', record.id)
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
        blurb="What the buyer downloads once they have paid. Replacing it here changes it for everyone, including past buyers whose links still work."
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.875rem', color: f.digitalFileId ? 'var(--color-text)' : 'var(--color-text-muted)' }}>
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
