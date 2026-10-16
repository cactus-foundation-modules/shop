'use client'

import { useEffect, useState, type CSSProperties } from 'react'
import { DPD_FOLLOW_LINK_EXAMPLE, dpdFollowLinkCode } from '@/modules/shop/lib/tracking/dpd-follow-link'
import type { ConsignmentParcel } from '@/modules/shop/lib/consignment-parcels'

// "This delivery is four parcels" - and a box for each of the others' links.
//
// DPD carry a supplier's delivery of several boxes as several parcels, and
// each one's follow-my-parcel link (the one that unlocks its window, its driver
// and its photograph) arrives in a different email. So the moment a DPD link
// is in the form, DPD are asked how many boxes the delivery is, and the form
// shows every one with a place for the links it does not have yet.
//
// The links go in any order. Nobody can tell from a link which box it opens,
// and nobody should have to: DPD say, when the parcel is saved, and each link
// lands on its own box (lib/tracking/dpd-consignment.ts).

type Box = { code: string; number: string; stage: string | null; delivered: boolean; hasLink: boolean }

type Preview =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'found'; number: string; boxes: Box[] }
  | { state: 'error'; error: string }

/** A link DPD can be asked about: their follow-my-parcel link, or the long
 *  tracking address a supplier's announcement carries. */
function isDpdLink(value: string): boolean {
  return Boolean(dpdFollowLinkCode(value)) || /track\.dpd\.co\.uk\/parcels\/\d/i.test(value)
}

export function ConsignmentLinksField({ link, active, known, knownForLink, links, onLinks }: {
  /** The parcel's own tracking link as it stands in the form. */
  link: string
  /** The courier is read from DPD. */
  active: boolean
  /** What the parcel already holds, on the edit form. */
  known?: { number: string | null; parcels: ConsignmentParcel[] | null } | null
  /** The link `known` belongs to: a different link in the form is a
   *  different delivery, and is asked about afresh. */
  knownForLink?: string
  links: string[]
  onLinks: (next: string[]) => void
}) {
  const typed = link.trim()
  const useKnown = Boolean(known?.parcels && known.number) && typed === (knownForLink ?? '').trim()
  // The answer for the link it was asked about. A link with no answer yet is
  // "asking"; one that is not worth asking about is nothing at all - worked
  // out from the link rather than set, so a link changed mid-ask cannot show
  // the previous one's parcels.
  const [answer, setAnswer] = useState<{ link: string; preview: Preview } | null>(null)
  const shouldAsk = active && !useKnown && Boolean(typed) && isDpdLink(typed)

  useEffect(() => {
    if (!shouldAsk) return
    let cancelled = false
    // Not on every keystroke: each ask can cost one of DPD's few checks a
    // minute, and a link is pasted, not typed.
    const timer = setTimeout(async () => {
      let preview: Preview
      try {
        const res = await fetch(`/api/m/shop/admin/dpd-consignment?link=${encodeURIComponent(typed)}`)
        const body = await res.json().catch(() => null) as
          | { found: true; consignmentNumber: string; parcelCode: string; parcels: Array<Omit<Box, 'hasLink'>> }
          | { found: false; error: string }
          | null
        preview = !body
          ? { state: 'error', error: 'DPD could not be asked just now.' }
          : !body.found
            ? { state: 'error', error: body.error }
            : {
                state: 'found',
                number: body.consignmentNumber,
                boxes: body.parcels.map((b) => ({ ...b, hasLink: b.code === body.parcelCode && Boolean(dpdFollowLinkCode(typed)) })),
              }
      } catch {
        preview = { state: 'error', error: 'DPD could not be asked just now.' }
      }
      if (!cancelled) setAnswer({ link: typed, preview })
    }, 600)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [shouldAsk, typed])

  const preview: Preview = !shouldAsk
    ? { state: 'idle' }
    : answer?.link === typed ? answer.preview : { state: 'loading' }

  if (!active) return null

  const shown: Preview = useKnown && known?.parcels && known.number
    ? {
        state: 'found',
        number: known.number,
        boxes: known.parcels.map((p) => ({
          code: p.code,
          number: p.number,
          stage: p.stage,
          delivered: p.delivered,
          hasLink: Boolean(p.shortCode),
        })),
      }
    : preview

  if (shown.state === 'loading') return <p style={hintStyle}>Asking DPD how many parcels this delivery is…</p>
  if (shown.state === 'error') return <p style={hintStyle}>{shown.error}</p>
  if (shown.state !== 'found' || shown.boxes.length < 2) return null

  const missing = shown.boxes.filter((b) => !b.hasLink).length
  // One box per link still to find, kept in step with what has been typed -
  // never fewer boxes than links already typed, so nothing typed disappears.
  const slots = Math.max(missing, links.filter((l) => l.trim()).length)
  const values = Array.from({ length: slots }, (_, i) => links[i] ?? '')
  const setAt = (i: number, value: string) => {
    const next = [...values]
    next[i] = value
    onLinks(next)
  }

  return (
    <div style={panelStyle}>
      <strong style={{ fontSize: '0.875rem' }}>
        This delivery is {shown.boxes.length} parcels
        <span style={{ fontWeight: 400, color: 'var(--color-text-secondary)' }}> · DPD reference {shown.number}</span>
      </strong>
      <ol style={{ margin: 0, paddingLeft: '1.25rem', display: 'grid', gap: '0.25rem', fontSize: '0.8125rem' }}>
        {shown.boxes.map((b) => (
          <li key={b.code}>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{b.number}</span>
            {' · '}
            <span style={{ color: b.delivered ? 'var(--color-success)' : 'var(--color-text-secondary)' }}>
              {b.delivered ? 'Delivered' : b.stage ?? 'No news yet'}
            </span>
            {b.hasLink && <span style={{ color: 'var(--color-text-secondary)' }}> · link added</span>}
          </li>
        ))}
      </ol>
      {slots > 0 && (
        <>
          <span style={hintStyle}>
            Each parcel has its own follow-my-parcel link, in a different DPD email. Paste the
            others&rsquo; links here in any order - DPD say which parcel each one opens, and it is put
            on that one when you save. Any you do not have yet can be added later.
          </span>
          {values.map((value, i) => {
            const wrong = value.trim().length > 0 && !dpdFollowLinkCode(value)
            return (
              <input
                key={i}
                value={value}
                onChange={(e) => setAt(i, e.target.value)}
                placeholder={DPD_FOLLOW_LINK_EXAMPLE}
                inputMode="url"
                aria-label={`Another parcel's follow-my-parcel link (${i + 1} of ${slots})`}
                aria-invalid={wrong || undefined}
                style={wrong ? { ...fieldStyle, borderColor: 'var(--color-danger)' } : fieldStyle}
              />
            )
          })}
        </>
      )}
    </div>
  )
}

const panelStyle: CSSProperties = {
  display: 'grid', gap: '0.5rem', padding: '0.75rem', borderRadius: 6,
  background: 'var(--color-bg-subtle)', border: '1px solid var(--color-border)',
}

const fieldStyle: CSSProperties = {
  width: '100%', padding: '0.5rem', borderRadius: 6, border: '1px solid var(--color-border)',
  background: 'var(--color-surface)', color: 'var(--color-text)',
}

const hintStyle: CSSProperties = {
  display: 'block', fontSize: '0.75rem', color: 'var(--color-text-secondary)',
}
