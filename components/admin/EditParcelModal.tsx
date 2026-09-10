'use client'

import { useState } from 'react'
import {
  ParcelDetailsFields,
  parcelDetailsPayload,
  type CourierOption,
  type ParcelDetails,
} from '@/modules/shop/components/admin/ParcelDetailsFields'

// Filling in a parcel after it has gone.
//
// The case this exists for: a courier that books the DAY when it collects and
// confirms the four-hour WINDOW the evening before. By the time the window is
// known there is nothing left to dispatch, so the only honest thing to do is
// edit the parcel that already went - recording a second one would tell the
// customer their order had been split in two.
//
// What is in the parcel is not editable here on purpose. Those quantities are
// what every cap in createShipment polices, under a lock, against refunds
// landing at the same moment; changing them means undoing the dispatch and
// recording it again so all of that runs.

export type EditableParcel = {
  id: string
  courierId: string | null
  carrier: string | null
  trackingNumber: string | null
  trackingUrl: string | null
  trackingShortCode: string | null
  deliveryDate: string | null
  deliverySlotStart: string | null
  deliverySlotEnd: string | null
  notes: string | null
  /** Set once the customer has been told the window. */
  slotNotifiedAt: string | null
}

export function EditParcelModal({ orderId, parcel, couriers, onClose, onDone }: {
  orderId: string
  parcel: EditableParcel
  couriers: CourierOption[]
  onClose: () => void
  onDone: () => void
}) {
  const [details, setDetails] = useState<ParcelDetails>({
    courierId: parcel.courierId ?? '',
    carrier: parcel.carrier ?? '',
    trackingNumber: parcel.trackingNumber ?? '',
    trackingUrl: parcel.trackingUrl ?? '',
    trackingShortCode: parcel.trackingShortCode ?? '',
    deliveryDate: parcel.deliveryDate ?? '',
    deliverySlotStart: parcel.deliverySlotStart ?? '',
    deliverySlotEnd: parcel.deliverySlotEnd ?? '',
    notes: parcel.notes ?? '',
  })
  const [emailCustomer, setEmailCustomer] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // The email only goes out on the save that first completes a window, and only
  // once per parcel. Saying so here stops an owner tidying up a typo and
  // wondering whether they have just emailed the customer all over again.
  const alreadyTold = Boolean(parcel.slotNotifiedAt)
  const windowComplete = Boolean(details.deliveryDate && details.deliverySlotStart && details.deliverySlotEnd)

  async function save() {
    setSaving(true)
    setError(null)
    const res = await fetch(`/api/m/shop/admin/orders/${orderId}/dispatch`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shipmentId: parcel.id, ...parcelDetailsPayload(details), emailCustomer }),
    })
    setSaving(false)
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? 'Could not save this parcel')
      return
    }
    onDone()
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'var(--color-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div style={{ background: 'var(--color-surface)', borderRadius: 8, width: '90vw', maxWidth: 560, maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0,0,0,.25)' }}>
        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>Parcel details</h3>
          <button type="button" aria-label="Close" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.25rem', color: 'var(--color-text-secondary)' }}>×</button>
        </div>

        <div style={{ padding: '1.25rem', overflowY: 'auto', display: 'grid', gap: '0.75rem' }}>
          <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
            For a courier that confirms the delivery day and the time window separately. What is in
            the parcel cannot be changed here - undo the dispatch and record it again for that.
          </p>
          {error && <p style={{ color: 'var(--color-danger)', fontSize: '0.875rem' }}>{error}</p>}

          <ParcelDetailsFields couriers={couriers} value={details} onChange={setDetails} />

          {alreadyTold ? (
            <p style={{ fontSize: '0.8125rem', background: 'var(--color-bg-subtle)', borderRadius: 6, padding: '0.5rem 0.75rem' }}>
              The customer has already been told this delivery window, so saving again will not email
              them a second time.
            </p>
          ) : (
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input type="checkbox" checked={emailCustomer} onChange={(e) => setEmailCustomer(e.target.checked)} />
              Email the customer their delivery time{windowComplete ? '' : ' (needs a date and both times)'}
            </label>
          )}
        </div>

        <div style={{ padding: '0.75rem 1.25rem', borderTop: '1px solid var(--color-border)', display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" disabled={saving} onClick={save}>
            {saving ? 'Saving…' : 'Save parcel'}
          </button>
        </div>
      </div>
    </div>
  )
}
