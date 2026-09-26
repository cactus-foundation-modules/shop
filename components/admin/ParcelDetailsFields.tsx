'use client'

import type { CSSProperties } from 'react'
import { DPD_FOLLOW_LINK_EXAMPLE, dpdFollowLinkCode } from '@/modules/shop/lib/tracking/dpd-follow-link'

// The details that hang off a parcel rather than off its contents: who is
// carrying it, when it is booked to arrive, and how to follow it.
//
// One component, used twice, because a parcel is described at two different
// moments. Dispatch records the courier and - on a courier that books a day
// when it collects - the day. The four-hour window turns up later, usually the
// evening before, by which time there is nothing left to dispatch and the only
// thing to do is edit the parcel that already went. Two forms would drift, and
// the second one would quietly forget a field.

export type CourierOption = {
  id: string
  name: string
  /** The courier's tracking is read from DPD, so its one tracking link must be
   *  the follow-my-parcel link from DPD's email. Optional so a response from an
   *  older deployment still renders - it then accepts any web address, as it
   *  always did, and the route has the final say either way. */
  dpdFollowLink?: boolean
}

export type ParcelDetails = {
  /** '' means the shop's "Other" case: a courier typed in by hand. */
  courierId: string
  /** Only used when courierId is ''. */
  carrier: string
  trackingNumber: string
  /** The one tracking link. On a DPD courier, the follow-my-parcel link from
   *  their email - the route takes the code out of it. */
  trackingUrl: string
  /** 'YYYY-MM-DD', as the date input gives it. */
  deliveryDate: string
  /** 'HH:MM', as the time input gives it. */
  deliverySlotStart: string
  deliverySlotEnd: string
  notes: string
}

export const EMPTY_PARCEL_DETAILS: ParcelDetails = {
  courierId: '',
  carrier: '',
  trackingNumber: '',
  trackingUrl: '',
  deliveryDate: '',
  deliverySlotStart: '',
  deliverySlotEnd: '',
  notes: '',
}

/** What the two routes accept, with blanks sent as null rather than as empty
 *  strings - clearing a field and never having filled one in are the same thing
 *  to a customer, and the column is nullable for exactly that reason. */
export function parcelDetailsPayload(details: ParcelDetails): Record<string, string | null> {
  const picked = details.courierId.trim()
  return {
    courierId: picked || null,
    // Ignored by the route when a courier was picked: the name is read from
    // settings there, so a renamed courier renames itself.
    carrier: picked ? null : details.carrier.trim() || null,
    trackingNumber: details.trackingNumber.trim() || null,
    trackingUrl: details.trackingUrl.trim() || null,
    deliveryDate: details.deliveryDate.trim() || null,
    deliverySlotStart: details.deliverySlotStart.trim() || null,
    deliverySlotEnd: details.deliverySlotEnd.trim() || null,
    notes: details.notes.trim() || null,
  }
}

export function ParcelDetailsFields({ couriers, value, onChange }: {
  couriers: CourierOption[]
  value: ParcelDetails
  onChange: (next: ParcelDetails) => void
}) {
  const set = <K extends keyof ParcelDetails>(key: K, next: ParcelDetails[K]) =>
    onChange({ ...value, [key]: next })

  // DPD's link is checked as it is typed, so the wrong one is caught at the
  // desk rather than an hour later by a tracking check that finds nothing.
  const dpd = couriers.find((c) => c.id === value.courierId)?.dpdFollowLink === true
  const typedLink = value.trackingUrl.trim()
  const wrongDpdLink = dpd && typedLink.length > 0 && !dpdFollowLinkCode(typedLink)

  return (
    <>
      <label>Courier
        {couriers.length > 0 ? (
          <select
            value={value.courierId}
            onChange={(e) => set('courierId', e.target.value)}
            style={fieldStyle}
          >
            <option value="">Other (type the name)</option>
            {couriers.map((courier) => (
              <option key={courier.id} value={courier.id}>{courier.name}</option>
            ))}
          </select>
        ) : (
          <input
            value={value.carrier}
            onChange={(e) => set('carrier', e.target.value)}
            placeholder="Royal Mail, DPD, Evri…"
            style={fieldStyle}
          />
        )}
        {couriers.length === 0 && (
          <span style={hintStyle}>
            Add the couriers you use in Shop settings and this becomes a list, with its own delivery
            questions and its own rule about showing customers the tracking page.
          </span>
        )}
      </label>

      {couriers.length > 0 && value.courierId === '' && (
        <label>Courier name
          <input
            value={value.carrier}
            onChange={(e) => set('carrier', e.target.value)}
            placeholder="Royal Mail, DPD, Evri…"
            style={fieldStyle}
          />
        </label>
      )}

      <label>Delivery date (optional)
        <input
          type="date"
          value={value.deliveryDate}
          onChange={(e) => set('deliveryDate', e.target.value)}
          style={fieldStyle}
        />
        <span style={hintStyle}>
          The day the courier has booked it in for. The customer sees it on their order as
          &ldquo;Arranged for Tuesday 8th of September&rdquo;.
        </span>
      </label>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
        <label>Window starts
          <input
            type="time"
            value={value.deliverySlotStart}
            onChange={(e) => set('deliverySlotStart', e.target.value)}
            style={fieldStyle}
          />
        </label>
        <label>Window ends
          <input
            type="time"
            value={value.deliverySlotEnd}
            onChange={(e) => set('deliverySlotEnd', e.target.value)}
            style={fieldStyle}
          />
        </label>
      </div>

      <label>Tracking number (optional)
        <input value={value.trackingNumber} onChange={(e) => set('trackingNumber', e.target.value)} style={fieldStyle} />
      </label>

      <label>Tracking link (optional)
        <input
          value={value.trackingUrl}
          onChange={(e) => set('trackingUrl', e.target.value)}
          placeholder={dpd ? DPD_FOLLOW_LINK_EXAMPLE : 'https://…'}
          inputMode="url"
          aria-invalid={wrongDpdLink || undefined}
          style={wrongDpdLink ? { ...fieldStyle, borderColor: 'var(--color-danger)' } : fieldStyle}
        />
        {wrongDpdLink ? (
          <span style={{ ...hintStyle, color: 'var(--color-danger)' }}>
            That is not DPD&rsquo;s follow-my-parcel link. Use the one from their email, which looks
            like {DPD_FOLLOW_LINK_EXAMPLE}.
          </span>
        ) : dpd ? (
          <span style={hintStyle}>
            The link in DPD&rsquo;s email, like {DPD_FOLLOW_LINK_EXAMPLE}. That one link is all it
            takes: the customer&rsquo;s order page shows the delivery window, the driver and how many
            drops away they are. Usually arrives the day before, so it is normally added by editing
            the parcel rather than at dispatch.
          </span>
        ) : (
          <span style={hintStyle}>
            The courier&rsquo;s own page for this parcel. Whether the customer is offered it is that
            courier&rsquo;s own setting - either way it stays here for you.
          </span>
        )}
      </label>

      <label>Notes (optional)
        <textarea value={value.notes} onChange={(e) => set('notes', e.target.value)} style={fieldStyle} />
      </label>
    </>
  )
}

const fieldStyle: CSSProperties = {
  width: '100%', padding: '0.5rem', borderRadius: 6, border: '1px solid var(--color-border)',
  marginTop: '0.25rem', background: 'var(--color-surface)', color: 'var(--color-text)',
}

const hintStyle: CSSProperties = {
  display: 'block', marginTop: '0.25rem', fontSize: '0.75rem', color: 'var(--color-text-secondary)',
}
