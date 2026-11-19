'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { MAX_DAMAGE_PHOTOS } from '@/modules/shop/lib/order-requests'
import { IssuePhotoPicker, useIssuePhotos } from '@/modules/shop/components/public/IssuePhotoPicker'

// "Add photographs" on an issue report already in - usually because the shop
// has asked for them, in which case the email's link lands here with this open.
// The same picker as the report form, sent to the report rather than with it.

export default function IssuePhotoAdder({ orderId, requestId, asked, initiallyOpen }: {
  orderId: string
  requestId: string
  /** Whether the shop has asked for photographs on this report, which is what
   *  makes the button primary rather than a quiet offer. */
  asked: boolean
  initiallyOpen?: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(Boolean(initiallyOpen))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState<number | null>(null)
  const { photos, uploading, addPhotos, removePhoto, clear } = useIssuePhotos(orderId, MAX_DAMAGE_PHOTOS, setError)

  async function send() {
    if (photos.length === 0) {
      setError('Add a photograph first.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/m/shop/member/orders/${orderId}/requests/${requestId}/photos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photoMediaIds: photos.map((photo) => photo.mediaId) }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error ?? 'That did not go through. Try again in a moment.')
        return
      }
      setSent(data.added ?? photos.length)
      clear()
      setOpen(false)
      router.refresh()
    } catch {
      setError('That did not go through. Try again in a moment.')
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <div style={{ display: 'grid', gap: '0.375rem' }}>
        {sent !== null && <p style={{ margin: 0 }}>Thank you - {sent === 1 ? 'that photograph is' : 'those photographs are'} with us now.</p>}
        <div>
          <button type="button" className={asked ? 'btn btn-primary btn-sm' : 'btn btn-sm'} onClick={() => setOpen(true)}>
            {sent !== null ? 'Add more photographs' : 'Add photographs'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div id={`issue-photos-${requestId}`} style={{ display: 'grid', gap: '0.5rem' }}>
      <IssuePhotoPicker
        photos={photos}
        max={MAX_DAMAGE_PHOTOS}
        uploading={uploading}
        disabled={busy}
        onAdd={(files) => void addPhotos(files)}
        onRemove={removePhoto}
      />
      {error && <p style={{ color: 'var(--color-error)', margin: 0 }}>{error}</p>}
      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-sm" onClick={() => { setOpen(false); setError(null) }} disabled={busy}>
          Never mind
        </button>
        <button type="button" className="btn btn-primary btn-sm" onClick={send} disabled={busy || uploading || photos.length === 0}>
          {busy ? 'Sending…' : 'Send photographs'}
        </button>
      </div>
    </div>
  )
}
