'use client'

import { useState } from 'react'
import type { ShpConfig } from '@/modules/shop/lib/config'

// The couriers this shop uses, and what each one means for the customer.
//
// Kept out of ShopSettingsTab's own file because it is a small editor with
// nested rows, and that file is long enough that another hundred lines of
// map-and-splice would bury the settings around it.
//
// Ids are minted here and never reused. A courier is referenced by id on every
// parcel already dispatched with it, so renaming one has to rename it
// everywhere - which it does, because the parcel keeps the id and the name is
// read back from this list - while deleting one has to leave those parcels
// alone rather than silently re-pointing them at whatever took its place.

type Courier = ShpConfig['deliveryCouriers'][number]
type Faq = Courier['faqs'][number]

/** A comma-separated list of stage names, as typed. Blanks dropped, spaces
 *  trimmed - the matching is case-insensitive anyway, so the only thing that
 *  would really catch somebody out is an empty entry from a trailing comma. */
function splitStages(value: string): string[] {
  return value.split(',').map((s) => s.trim()).filter(Boolean)
}

/**
 * A comma-separated list, edited as TEXT.
 *
 * The box keeps what was actually typed, and only the value handed upstream is
 * split and trimmed. Binding the input straight to `list.join(', ')` looks
 * equivalent and is not: every keystroke round-trips through a trim, so the
 * space in "Assigned to Crew" is deleted the instant it is typed and the word
 * can never be finished. That is exactly what happened.
 *
 * The text is seeded once, on mount, which is right here - each courier's row
 * is keyed by its own id, so a different courier gets a different box rather
 * than this one being re-pointed at another courier's stages.
 */
function StageListField({ label, hint, list, onChange }: {
  label: string
  hint: string
  list: string[]
  onChange: (next: string[]) => void
}) {
  const [text, setText] = useState(() => list.join(', '))

  return (
    <div className="field" style={{ marginBottom: 0 }}>
      <label>{label}</label>
      <input
        type="text"
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          onChange(splitStages(e.target.value))
        }}
      />
      <span className="field-hint">{hint}</span>
    </div>
  )
}

function newId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return `${prefix}_${crypto.randomUUID()}`
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
}

export function CourierSettings({ value, onChange }: {
  value: Courier[]
  onChange: (next: Courier[]) => void
}) {
  const patchCourier = (id: string, patch: Partial<Courier>) =>
    onChange(value.map((c) => (c.id === id ? { ...c, ...patch } : c)))

  const patchFaq = (courierId: string, faqId: string, patch: Partial<Faq>) =>
    onChange(value.map((c) => (
      c.id === courierId ? { ...c, faqs: c.faqs.map((f) => (f.id === faqId ? { ...f, ...patch } : f)) } : c
    )))

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      {value.map((courier) => (
        <div key={courier.id} style={card}>
          <div className="field">
            <label>Courier name</label>
            <input
              type="text"
              value={courier.name}
              placeholder="Furdeco, DPD, Royal Mail…"
              onChange={(e) => patchCourier(courier.id, { name: e.target.value })}
            />
            <span className="field-hint">
              What the customer sees on their order. Change it here and it changes on every parcel
              already sent with them.
            </span>
          </div>

          <label style={checkboxRow}>
            <input
              type="checkbox"
              checked={courier.showTrackingLink}
              onChange={(e) => patchCourier(courier.id, { showTrackingLink: e.target.checked })}
            />
            Show customers this courier&rsquo;s own tracking page
          </label>
          <p className="field-hint" style={{ marginTop: '-0.25rem' }}>
            Turn this off for a courier whose tracking page is really your trade account - your
            account number, your buying terms, their own telephone number. The link is still recorded
            on the parcel for you; the customer just gets the delivery date and time on their own
            order page instead.
          </p>

          {courier.showTrackingLink && (
            <div style={{ display: 'grid', gap: '0.75rem', marginTop: '0.5rem' }}>
              <div className="field">
                <label>What that button says</label>
                <input
                  type="text"
                  value={courier.trackingLinkLabel}
                  placeholder="Track your parcel"
                  onChange={(e) => patchCourier(courier.id, { trackingLinkLabel: e.target.value })}
                />
                <span className="field-hint">
                  Worth changing on a courier you follow automatically. The customer already has the
                  timeline, the window and the driver on your page, so sending them out to
                  &ldquo;track your parcel&rdquo; offers them something they have just read - and
                  hides what their courier&rsquo;s page is actually good for. On DPD, that is a safe
                  place, a neighbour, or moving it to another day. Leave it empty for the usual
                  wording.
                </span>
              </div>

              <div className="field">
                <label>The line underneath it</label>
                <input
                  type="text"
                  value={courier.trackingLinkHint}
                  placeholder="Optional"
                  onChange={(e) => patchCourier(courier.id, { trackingLinkHint: e.target.value })}
                />
                <span className="field-hint">
                  A few words on what they can change there. Shown only if you fill it in.
                </span>
              </div>
            </div>
          )}

          <div className="field" style={{ marginTop: '0.75rem' }}>
            <label>Follow this courier&rsquo;s tracking automatically</label>
            <select
              value={courier.trackingSource}
              onChange={(e) => patchCourier(courier.id, { trackingSource: e.target.value as Courier['trackingSource'] })}
            >
              <option value="none">No - I&rsquo;ll update deliveries myself</option>
              <option value="multidrop">Yes - Multidrop tracking pages</option>
              <option value="gfs">Yes - GFS parcel pages</option>
              <option value="dpd">Yes - DPD</option>
            </select>
            <span className="field-hint">
              Checks each parcel once an hour - every minute once it is out on a van - and keeps the
              answer on your own site, so the customer never has to visit theirs. Pick the one that
              matches your tracking links: Multidrop for multidrop.link, GFS for parcels booked
              through Global Freight Solutions, DPD for track.dpd.co.uk.
            </span>
          </div>

          {courier.trackingSource === 'gfs' && (
            <div className="field" style={{ marginTop: '0.5rem' }}>
              <label>Which carrier GFS hand your parcels to</label>
              <input
                type="text"
                value={courier.gfsCarrier}
                placeholder="DPD"
                onChange={(e) => patchCourier(courier.id, { gfsCarrier: e.target.value })}
              />
              <span className="field-hint">
                GFS are the booking company rather than the van. Their page needs telling who is
                actually carrying it - usually DPD.
              </span>
            </div>
          )}

          {courier.trackingSource !== 'none' && (
            <div style={{ display: 'grid', gap: '0.75rem', marginTop: '0.5rem' }}>
              <StageListField
                label="Stages that mean it is out on a van"
                list={courier.outForDeliveryStages}
                onChange={(next) => patchCourier(courier.id, { outForDeliveryStages: next })}
                hint="Separate them with commas, and use the courier's own wording exactly. Reaching one of these changes the customer's order from “Delivery scheduled” to “Out for delivery”."
              />

              <StageListField
                label="Stages that mean it has arrived"
                list={courier.deliveredStages}
                onChange={(next) => patchCourier(courier.id, { deliveredStages: next })}
                hint="When every parcel on an order reaches one of these, and nothing is still owed, the order marks itself complete and the customer gets your completion message. Leave it empty and nothing is ever finished off automatically."
              />

              <StageListField
                label="Stages that mean the delivery failed"
                list={courier.failedStages}
                onChange={(next) => patchCourier(courier.id, { failedStages: next })}
                hint="Nobody in, no access, refused. Reaching one takes the order off “Out for delivery”, says the delivery was not possible, and tells the customer - on their order page and in one email - how to get a new day booked. The start of the courier's wording is enough - “Failed Attempt” matches “Failed Attempt - Recipient Not Home”."
              />

              <div className="field" style={{ marginBottom: 0 }}>
                <label>Live chat link for rebooking a failed delivery</label>
                <input
                  type="url"
                  value={courier.rearrangeChatUrl}
                  placeholder="https://"
                  onChange={(e) => patchCourier(courier.id, { rearrangeChatUrl: e.target.value.trim() })}
                />
                <span className="field-hint">
                  The courier&rsquo;s own chat page, offered to the customer as a link. Optional.
                </span>
              </div>

              <div className="field" style={{ marginBottom: 0 }}>
                <label>Phone number for rebooking a failed delivery</label>
                <input
                  type="tel"
                  value={courier.rearrangePhone}
                  placeholder="Optional"
                  onChange={(e) => patchCourier(courier.id, { rearrangePhone: e.target.value })}
                />
                <span className="field-hint">
                  Shown to the customer with their tracking number, which the courier will ask for.
                  If you have already spoken to the courier and they will ring the customer
                  themselves, say so on the order and the customer is told to wait instead.
                </span>
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gap: '0.75rem', marginTop: '0.5rem' }}>
            <strong style={{ fontSize: '0.8125rem' }}>Delivery questions</strong>
            <p className="field-hint" style={{ margin: 0 }}>
              Shown on the order page, and linked from the delivery email, for parcels sent with this
              courier. A courier with no questions shows no link at all. Plain text - typed exactly as
              you write it, so no need to worry about formatting.
            </p>

            {courier.faqs.map((faq) => (
              <div key={faq.id} style={faqRow}>
                <div className="field" style={{ marginBottom: '0.5rem' }}>
                  <label>Question</label>
                  <input
                    type="text"
                    value={faq.question}
                    placeholder="Will they take it upstairs?"
                    onChange={(e) => patchFaq(courier.id, faq.id, { question: e.target.value })}
                  />
                </div>
                <div className="field" style={{ marginBottom: '0.5rem' }}>
                  <label>Answer</label>
                  <textarea
                    rows={3}
                    value={faq.answer}
                    onChange={(e) => patchFaq(courier.id, faq.id, { answer: e.target.value })}
                  />
                </div>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => patchCourier(courier.id, { faqs: courier.faqs.filter((f) => f.id !== faq.id) })}
                >
                  Remove question
                </button>
              </div>
            ))}

            <button
              type="button"
              className="btn btn-secondary btn-sm"
              style={{ justifySelf: 'start' }}
              onClick={() => patchCourier(courier.id, {
                faqs: [...courier.faqs, { id: newId('faq'), question: '', answer: '' }],
              })}
            >
              Add a question
            </button>
          </div>

          <hr style={{ border: 0, borderTop: '1px solid var(--color-border)', margin: '0.875rem 0 0.75rem' }} />
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => onChange(value.filter((c) => c.id !== courier.id))}
          >
            Remove {courier.name.trim() || 'this courier'}
          </button>
          <p className="field-hint" style={{ marginTop: '0.25rem' }}>
            Parcels already sent with them keep the name they were sent with.
          </p>
        </div>
      ))}

      <button
        type="button"
        className="btn btn-secondary btn-sm"
        style={{ justifySelf: 'start' }}
        onClick={() => onChange([...value, {
          id: newId('cou'),
          name: '',
          showTrackingLink: true,
          trackingSource: 'none',
          gfsCarrier: 'DPD',
          outForDeliveryStages: [],
          deliveredStages: [],
          failedStages: [],
          rearrangeChatUrl: '',
          rearrangePhone: '',
          trackingLinkLabel: '',
          trackingLinkHint: '',
          faqs: [],
        }])}
      >
        Add a courier
      </button>
    </div>
  )
}

const card: React.CSSProperties = {
  border: '1px solid var(--color-border)',
  borderRadius: 8,
  padding: '1rem',
  background: 'var(--color-surface)',
}

const faqRow: React.CSSProperties = {
  border: '1px solid var(--color-border)',
  borderRadius: 6,
  padding: '0.75rem',
  background: 'var(--color-bg-subtle)',
}

const checkboxRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
  margin: '0.5rem 0',
}
