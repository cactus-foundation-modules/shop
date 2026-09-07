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

          <div className="field" style={{ marginTop: '0.75rem' }}>
            <label>Follow this courier&rsquo;s tracking automatically</label>
            <select
              value={courier.trackingSource}
              onChange={(e) => patchCourier(courier.id, { trackingSource: e.target.value as Courier['trackingSource'] })}
            >
              <option value="none">No - I&rsquo;ll update deliveries myself</option>
              <option value="multidrop">Yes - Multidrop tracking pages</option>
            </select>
            <span className="field-hint">
              Checks each parcel&rsquo;s tracking page once an hour and keeps the answer on your own
              site, so the customer never has to visit theirs. Only for couriers whose tracking link
              is a multidrop.link address.
            </span>
          </div>

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
          outForDeliveryStages: [],
          deliveredStages: [],
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
