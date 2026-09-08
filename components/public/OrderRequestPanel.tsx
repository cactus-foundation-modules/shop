'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { DAMAGED_GOODS_GUIDANCE, MAX_DAMAGE_PHOTOS } from '@/modules/shop/lib/order-requests'
import type { ReturnsPolicy } from '@/modules/shop/lib/returnable'
import type { ShpOrderRequestType } from '@/modules/shop/lib/types'

// The customer's side of the three things they can ask for after the order has
// gone: call it off, send it back, or tell us it arrived broken.
//
// Eligibility is decided on the server and handed down as a message, never
// re-derived here - lib/order-requests.ts is the one copy of those rules, so a
// button that appears and an endpoint that accepts can never disagree.
//
// Damage is deliberately its own door rather than a reason in the return list.
// A return is a change of mind and ends in a collection; damage is our mistake
// and ends in a replacement, and the two want different questions asked. Put in
// one dropdown, "it arrived damaged" is the line people pick, and every
// breakage then has to be unpicked by email.

export type RequestLine = {
  orderItemId: string
  productName: string
  returnableQty: number
  /** What may still be called off - what is left to supply, on a line the shop
   *  takes back. Zero on anything bespoke, and zero once it has gone out. */
  cancellableQty: number
  /** What is still to come, whatever the returns policy says about it. */
  outstandingQty: number
  /** What has actually turned up, which is what can be reported damaged. */
  dispatchedQty: number
  /** What the shop said about taking this one back, as sold. */
  returnsPolicy: ReturnsPolicy
  /** Why it cannot come back, or what "at our discretion" means here. Null on a
   *  line that simply comes back. */
  returnsNote: string | null
}

type Offer = { allowed: boolean; reason?: string }

type Props = {
  orderId: string
  cancel: Offer
  return: Offer
  damage: Offer
  cancelReasons: ReadonlyArray<{ code: string; label: string }>
  returnReasons: ReadonlyArray<{ code: string; label: string }>
  damageReasons: ReadonlyArray<{ code: string; label: string }>
  lines: RequestLine[]
  returnBy: string | null
}

type Photo = { mediaId: string; url: string; name: string }

const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp']

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

const muted: React.CSSProperties = { color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }
const label: React.CSSProperties = { fontWeight: 'var(--font-medium)' }

export default function OrderRequestPanel(props: Props) {
  const router = useRouter()
  const [open, setOpen] = useState<ShpOrderRequestType | null>(null)
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const [photos, setPhotos] = useState<Photo[]>([])
  const [uploading, setUploading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const returnable = props.lines.filter((line) => line.returnableQty > 0)
  // Listed under the form rather than left out of it. A shopper who ordered four
  // things and is shown two needs to know what happened to the other two, or the
  // form reads as broken - and this is also where they are told why, which is
  // the part that stops the email asking.
  const refused = props.lines.filter((line) => line.returnsPolicy === 'NONE')
  // Anything that has actually arrived can be reported damaged, whatever the
  // returns policy says: the customer who cannot send it back is the one who
  // most needs a way to tell us it turned up broken.
  const arrived = props.lines.filter((line) => line.dispatchedQty > 0)
  // What may still be called off. A cancellation used to be all-or-nothing, so
  // one packed parcel or one bespoke desk refused the whole order; both are
  // per-line answers now, and the ones that have to stay are listed underneath
  // with the reason rather than silently dropped.
  const cancellable = props.lines.filter((line) => line.cancellableQty > 0)
  const cannotCancel = props.lines.filter((line) => line.cancellableQty === 0)
  const chosen = open === 'DAMAGE' ? arrived : open === 'CANCEL' ? cancellable : returnable
  const reasons =
    open === 'CANCEL' ? props.cancelReasons : open === 'DAMAGE' ? props.damageReasons : props.returnReasons

  /** Why a line is not on the cancellation form. Said in the customer's terms:
   *  "it is a return now" and "we cannot unmake this one" send them to two
   *  different places, and guessing wrong costs them an email. */
  function whyNotCancellable(line: RequestLine): string {
    if (line.dispatchedQty > 0 && line.outstandingQty === 0) {
      return 'Already on its way, so this one is a return rather than a cancellation.'
    }
    if (line.returnsPolicy === 'NONE') return line.returnsNote ?? 'This one cannot be called off once ordered.'
    return 'There is nothing left to call off on this one.'
  }

  function start(type: ShpOrderRequestType) {
    setOpen(type)
    setReason('')
    setNote('')
    setPhotos([])
    setError(null)
    // Everything still going, pre-ticked: calling the lot off and sending the
    // lot back are both the common case, and un-ticking is less work than
    // ticking. A damage report starts at nothing, because the whole point of it
    // is that one particular thing is broken.
    setQuantities(
      type === 'RETURN'
        ? Object.fromEntries(returnable.map((line) => [line.orderItemId, line.returnableQty]))
        : type === 'CANCEL'
          ? Object.fromEntries(cancellable.map((line) => [line.orderItemId, line.cancellableQty]))
          : {},
    )
  }

  async function addPhotos(files: FileList | null) {
    if (!files || files.length === 0) return
    setError(null)
    setUploading(true)
    try {
      for (const file of Array.from(files)) {
        // Checked as we go rather than up front: the cap is on what ends up on
        // the report, and somebody who picks eight should keep the first six
        // rather than be told to start again.
        if (photos.length + 1 > MAX_DAMAGE_PHOTOS) {
          setError(`That is as many as we need - ${MAX_DAMAGE_PHOTOS} is the limit.`)
          break
        }
        const body = new FormData()
        body.append('file', await shrink(file))
        const res = await fetch(`/api/m/shop/member/orders/${props.orderId}/photos`, { method: 'POST', body })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          setError(data.error ?? 'That photograph did not go through. Try again in a moment.')
          break
        }
        setPhotos((current) =>
          current.length >= MAX_DAMAGE_PHOTOS
            ? current
            : [...current, { mediaId: data.mediaId, url: data.url, name: file.name }],
        )
      }
    } finally {
      setUploading(false)
    }
  }

  async function submit() {
    if (!open) return
    if (!reason) {
      setError('Pick a reason so we know what happened.')
      return
    }
    const items = Object.entries(quantities)
      .filter(([, quantity]) => quantity > 0)
      .map(([orderItemId, quantity]) => ({ orderItemId, quantity }))
    if (open === 'RETURN' && items.length === 0) {
      setError('Choose at least one item to send back.')
      return
    }
    if (open === 'CANCEL' && items.length === 0) {
      setError('Choose at least one item to call off.')
      return
    }
    if (open === 'DAMAGE' && items.length === 0) {
      setError('Tell us which item is damaged.')
      return
    }

    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/m/shop/member/orders/${props.orderId}/requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: open,
          reason,
          customerNote: note || null,
          // Named on a cancellation too. The server works out for itself whether
          // that adds up to the whole order - one place to decide it, rather
          // than a form and an endpoint that can drift apart about it.
          items,
          photoMediaIds: open === 'DAMAGE' ? photos.map((photo) => photo.mediaId) : [],
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error ?? 'That did not go through. Try again in a moment.')
        return
      }
      setOpen(null)
      router.refresh()
    } catch {
      setError('That did not go through. Try again in a moment.')
    } finally {
      setBusy(false)
    }
  }

  if (open) {
    return (
      // The closed card is one cell of the paired grid; the open form is a list
      // of lines with a select and a textarea under it, so it takes the row.
      <section className="sod-card sod-wide">
        <div className="sod-card-head">
          <h2 className="sod-card-title">
            {open === 'CANCEL'
              ? 'Cancel this order'
              : open === 'DAMAGE'
                ? 'Report damage'
                : 'Send something back'}
          </h2>
        </div>
        <div className="sod-card-body">

        {open === 'RETURN' && (
          // Said above the form rather than offered inside it. Somebody with a
          // broken leg who reads this here never fills the return form in at
          // all, which is the entire point.
          <p style={{ margin: 0, ...muted }}>
            {DAMAGED_GOODS_GUIDANCE}{' '}
            {props.damage.allowed && (
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => start('DAMAGE')}
                style={{ marginLeft: '0.25rem' }}
              >
                Report damage instead
              </button>
            )}
          </p>
        )}

        {open === 'CANCEL' && (
          // Said above the boxes, because the boxes are already filled in. A
          // shopper who came here to call the whole thing off should be able to
          // press the button without reading anything; the sentence is for the
          // one who only wants two of the five gone.
          <p style={{ margin: 0, ...muted }}>
            Everything that can still be called off is ticked below. Change the numbers if you only want part of the
            order stopped.
          </p>
        )}

        <div style={{ display: 'grid', gap: '0.5rem' }}>
            <span style={label}>
              {open === 'DAMAGE'
                ? 'What has arrived damaged?'
                : open === 'CANCEL'
                  ? 'What are you calling off?'
                  : 'What are you sending back?'}
            </span>
            {chosen.map((line) => {
              const max = open === 'DAMAGE'
                ? line.dispatchedQty
                : open === 'CANCEL'
                  ? line.cancellableQty
                  : line.returnableQty
              return (
                <label key={line.orderItemId} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <input
                    type="number"
                    min={0}
                    max={max}
                    value={quantities[line.orderItemId] ?? 0}
                    onChange={(e) =>
                      setQuantities((current) => ({
                        ...current,
                        [line.orderItemId]: Math.max(0, Math.min(max, Number(e.target.value) || 0)),
                      }))
                    }
                    style={{ width: '4.5rem' }}
                    aria-label={`Quantity of ${line.productName}`}
                  />
                  <span>
                    {line.productName} <span style={{ color: 'var(--color-text-muted)' }}>(up to {max})</span>
                    {/* Said before they ask, not after we refuse. A shopper who
                        is going to be told "we may say no" is owed it while
                        they are still deciding whether to bother. */}
                    {open === 'RETURN' && line.returnsPolicy === 'DISCRETIONARY' && line.returnsNote && (
                      <span style={{ display: 'block', ...muted }}>{line.returnsNote}</span>
                    )}
                  </span>
                </label>
              )
            })}
            {open === 'RETURN' && refused.length > 0 && (
              <div style={{ display: 'grid', gap: '0.25rem', marginTop: '0.25rem' }}>
                {refused.map((line) => (
                  <p key={line.orderItemId} style={{ margin: 0, ...muted }}>
                    <strong style={label}>{line.productName}</strong>
                    {' - '}
                    {line.returnsNote}
                  </p>
                ))}
              </div>
            )}
            {/* The lines that have to stay, and why. Left out entirely, an order
                of five that offers three reads as broken, and the customer's
                next move is an email asking about the other two. */}
            {open === 'CANCEL' && cannotCancel.length > 0 && (
              <div style={{ display: 'grid', gap: '0.25rem', marginTop: '0.25rem' }}>
                <span style={label}>These have to stay on the order</span>
                {cannotCancel.map((line) => (
                  <p key={line.orderItemId} style={{ margin: 0, ...muted }}>
                    <strong style={label}>{line.productName}</strong>
                    {' - '}
                    {whyNotCancellable(line)}
                  </p>
                ))}
              </div>
            )}
          </div>

        <label style={{ display: 'grid', gap: '0.25rem' }}>
          <span style={label}>{open === 'DAMAGE' ? 'What has happened?' : 'Why?'}</span>
          <select value={reason} onChange={(e) => setReason(e.target.value)}>
            <option value="">Choose a reason…</option>
            {reasons.map((option) => (
              <option key={option.code} value={option.code}>{option.label}</option>
            ))}
          </select>
        </label>

        {open === 'DAMAGE' && (
          <div style={{ display: 'grid', gap: '0.5rem' }}>
            <span style={label}>Photographs</span>
            <p style={{ margin: 0, ...muted }}>
              Please add at least one - a picture of the damage and one of the packaging it came in settle almost
              every one of these on the spot. Up to {MAX_DAMAGE_PHOTOS}.
            </p>
            {photos.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                {photos.map((photo) => (
                  <span key={photo.mediaId} style={{ position: 'relative', display: 'inline-flex' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- a
                        just-uploaded file on a provider domain the image loader
                        is not configured for; it is a thumbnail of their own
                        photograph, not page furniture. */}
                    <img
                      src={photo.url}
                      alt={photo.name}
                      style={{ width: 84, height: 84, objectFit: 'cover', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}
                    />
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => setPhotos((current) => current.filter((p) => p.mediaId !== photo.mediaId))}
                      aria-label={`Remove ${photo.name}`}
                      style={{ position: 'absolute', top: 2, right: 2, padding: '0 0.375rem', lineHeight: 1.4 }}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
            {photos.length < MAX_DAMAGE_PHOTOS && (
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                disabled={uploading || busy}
                onChange={(e) => {
                  void addPhotos(e.target.files)
                  // Cleared so the same file can be picked again after a
                  // failure - a file input fires nothing when the value has not
                  // changed, and "nothing happens" is a maddening way to fail.
                  e.target.value = ''
                }}
              />
            )}
            {uploading && <p style={{ margin: 0, ...muted }}>Sending your photographs…</p>}
          </div>
        )}

        <label style={{ display: 'grid', gap: '0.25rem' }}>
          <span style={label}>Anything else we should know? (optional)</span>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={2000} />
        </label>

        {error && <p style={{ color: 'var(--color-error)', margin: 0 }}>{error}</p>}

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button type="button" className="btn btn-primary" onClick={submit} disabled={busy || uploading}>
            {busy ? 'Sending…' : open === 'DAMAGE' ? 'Send report' : 'Send request'}
          </button>
          <button type="button" className="btn" onClick={() => setOpen(null)} disabled={busy}>
            Never mind
          </button>
        </div>
        </div>
      </section>
    )
  }

  return (
    <section className="sod-card">
      <div className="sod-card-head">
        <h2 className="sod-card-title">Something not right?</h2>
      </div>
      <div className="sod-card-body">

      {props.cancel.allowed && cancellable.length > 0 ? (
        <div>
          <button type="button" className="btn" onClick={() => start('CANCEL')}>
            {cannotCancel.length > 0 ? 'Cancel part of this order' : 'Cancel this order'}
          </button>
          {/* Only worth saying where there is a choice to make. On an order
              where everything can go, the button already says it all. */}
          {cannotCancel.length > 0 && (
            <p style={{ margin: '0.375rem 0 0', ...muted }}>
              Some of this order can still be stopped. You pick which, and how many.
            </p>
          )}
        </div>
      ) : (
        props.cancel.reason && <p style={{ margin: 0, ...muted }}>{props.cancel.reason}</p>
      )}

      {props.return.allowed && returnable.length > 0 ? (
        <div>
          <button type="button" className="btn" onClick={() => start('RETURN')}>Return something</button>
          {props.returnBy && (
            <p style={{ margin: '0.375rem 0 0', ...muted }}>
              Returns for this order are open until {props.returnBy}.
            </p>
          )}
        </div>
      ) : (
        props.return.reason && <p style={{ margin: 0, ...muted }}>{props.return.reason}</p>
      )}

      {props.damage.allowed && arrived.length > 0 ? (
        <div>
          <button type="button" className="btn" onClick={() => start('DAMAGE')}>Report damage</button>
          {/* Offered on its own terms rather than as a footnote to returns: it
              applies to goods we do not take back, and it does not stop when the
              return window does. */}
          <p style={{ margin: '0.375rem 0 0', ...muted }}>
            Arrived damaged or faulty? Send us photographs and we will arrange a replacement - there is no window on
            this and it applies to everything, including anything we cannot normally take back.
          </p>
        </div>
      ) : (
        props.damage.reason && <p style={{ margin: 0, ...muted }}>{props.damage.reason}</p>
      )}
      </div>
    </section>
  )
}
