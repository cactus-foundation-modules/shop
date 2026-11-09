'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { InfoTip } from '@/components/admin/InfoTip'
import { CourierFaqEditor } from '@/modules/shop/components/admin/CourierFaqEditor'
import { useConfirm } from '@/modules/shop/components/admin/dialogs'
import { AlertIcon, NewTabIcon } from '@/modules/shop/components/admin/order-icons'
import { sourceStages, type StageListKey } from '@/modules/shop/lib/tracking/known-stages'
import type { ShpConfig } from '@/modules/shop/lib/config'

// One courier, edited in a modal over the Couriers list.
//
// It edits a DRAFT and hands the whole courier back on Save; nothing upstream
// changes until then, so Cancel really is cancel. The one exception is the
// delivery questions, which save one at a time as they are changed (see
// CourierFaqEditor) - against the last SAVED courier, so a question saved
// halfway through renaming the courier does not save the rename with it. The long explanations that
// used to sit under every box live behind (i) tips now - the page had become
// a wall of prose with a form somewhere inside it.
//
// Ids are minted here and never reused. A courier is referenced by id on every
// parcel already dispatched with it, so renaming one renames it everywhere -
// the parcel keeps the id and reads the name back from the list - while
// removing one leaves those parcels alone rather than re-pointing them at
// whatever took its place.

export type Courier = ShpConfig['deliveryCouriers'][number]

export const TRACKING_SOURCE_LABELS: Record<Courier['trackingSource'], string> = {
  none: 'Updated by hand',
  multidrop: 'Multidrop',
  gfs: 'GFS',
  dpd: 'DPD',
  ait: 'AIT Home Delivery',
  fieldly: 'Fieldly',
  palletways: 'Palletways',
}

export function newId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return `${prefix}_${crypto.randomUUID()}`
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
}

export function blankCourier(): Courier {
  return {
    id: newId('cou'),
    name: '',
    showTrackingLink: true,
    trackingSource: 'none',
    gfsCarrier: 'DPD',
    palletwaysDueBy: '17:00',
    outForDeliveryStages: [],
    deliveredStages: [],
    failedStages: [],
    rearrangeChatUrl: '',
    rearrangePhone: '',
    rebookedBy: 'customer',
    showFailedReason: false,
    trackingLinkLabel: '',
    trackingLinkHint: '',
    faqs: [],
  }
}

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
 * Seeded once, on mount, which is right: the modal mounts afresh for each
 * courier it opens.
 */
function StageListField({ id, label, tip, placeholder, list, onChange, suggestions, reportsItself, courierWord, missingWarning }: {
  id: string
  label: string
  tip: ReactNode
  placeholder: string
  list: string[]
  onChange: (next: string[]) => void
  /** Words this tracking source is known to use, offered as one-click adds. */
  suggestions: readonly string[]
  /** The courier's own feed already says this, so the list is optional. */
  reportsItself: boolean
  courierWord: string
  /** What silently never happens while this list is empty. */
  missingWarning: string
}) {
  const [text, setText] = useState(() => list.join(', '))
  const listed = new Set(list.map((s) => s.trim().toLowerCase()))
  const offered = suggestions.filter((s) => !listed.has(s.toLowerCase()))

  function update(nextText: string) {
    setText(nextText)
    onChange(splitStages(nextText))
  }

  return (
    <div className="field">
      <label htmlFor={id}>{label}<InfoTip>{tip}</InfoTip></label>
      <input
        id={id}
        type="text"
        value={text}
        placeholder={reportsItself ? `Not needed - ${courierWord} say so themselves` : placeholder}
        onChange={(e) => update(e.target.value)}
      />
      {offered.length > 0 && (
        <div className="scr-suggest">
          <span>{courierWord} use:</span>
          {offered.map((word) => (
            <button
              key={word}
              type="button"
              className="scr-chip"
              aria-label={`Add "${word}"`}
              onClick={() => update(text.trim() ? `${text.replace(/[,\s]+$/, '')}, ${word}` : word)}
            >
              + {word}
            </button>
          ))}
        </div>
      )}
      {!reportsItself && list.length === 0 && (
        <span className="scr-warn">{AlertIcon}{missingWarning}</span>
      )}
    </div>
  )
}

function Section({ title, tip, children }: { title: string; tip?: ReactNode; children: ReactNode }) {
  return (
    <section className="scr-section">
      <h3 className="scr-section-title">{title}{tip && <InfoTip>{tip}</InfoTip>}</h3>
      <div className="scr-grid">{children}</div>
    </section>
  )
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export type SaveOptions = { close: boolean }

export function CourierEditModal({ initial, isNew, otherNames, onClose, onSave, onRemove }: {
  initial: Courier
  isNew: boolean
  /** Every other courier's name, to refuse a second one called the same. */
  otherNames: string[]
  onClose: () => void
  /** Persists the courier. Resolves to an error message, or null when saved. */
  onSave: (courier: Courier, options: SaveOptions) => Promise<string | null>
  /** Removes the courier. Resolves to an error message, or null when removed. */
  onRemove?: () => Promise<string | null>
}) {
  // What is saved, as far as this modal knows. Moves when a delivery question
  // saves on its own, so "unsaved changes" means the fields, not the questions.
  const [baseline, setBaseline] = useState<Courier>(initial)
  const [draft, setDraft] = useState<Courier>(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [confirm, confirmNode] = useConfirm()
  const nameRef = useRef<HTMLInputElement>(null)
  const modalRef = useRef<HTMLDivElement>(null)

  // Delivery questions open with unsaved typing in them, by id.
  const [unsavedFaqs, setUnsavedFaqs] = useState<ReadonlySet<string>>(new Set())
  const onFaqUnsaved = useCallback((id: string, unsaved: boolean) => {
    setUnsavedFaqs((prev) => {
      if (prev.has(id) === unsaved) return prev
      const next = new Set(prev)
      if (unsaved) next.add(id)
      else next.delete(id)
      return next
    })
  }, [])

  const dirty = JSON.stringify(draft) !== JSON.stringify(baseline)
  const patch = (p: Partial<Courier>) => {
    setNotice('')
    setDraft((d) => ({ ...d, ...p }))
  }

  async function requestClose() {
    if (busy) return
    if ((dirty || unsavedFaqs.size > 0) && !(await confirm({
      title: 'Discard your changes?',
      message: 'You have changes to this courier that have not been saved.',
      confirmLabel: 'Discard',
      cancelLabel: 'Keep editing',
    }))) return
    onClose()
  }

  // Escape closes, through the same unsaved-changes check as the buttons, and
  // Tab goes round the modal rather than wandering off into the page behind
  // it. The ref keeps the listener pointed at this render's draft without
  // re-binding it on every keystroke. Focus goes back to whatever opened the
  // modal when it closes.
  const closeRef = useRef(requestClose)
  useEffect(() => { closeRef.current = requestClose })
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    nameRef.current?.focus()
    function onKey(e: KeyboardEvent) {
      // The confirm dialog handles its own keys; leave those to it.
      if (document.querySelector('[aria-labelledby="shop-confirm-title"]')) return
      if (e.key === 'Escape') { closeRef.current(); return }
      if (e.key !== 'Tab' || !modalRef.current) return
      const items = [...modalRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null)
      const first = items[0]
      const last = items[items.length - 1]
      if (!first || !last) return
      const inside = modalRef.current.contains(document.activeElement)
      if (e.shiftKey && (document.activeElement === first || !inside)) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && (document.activeElement === last || !inside)) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      opener?.focus()
    }
  }, [])

  async function save() {
    const name = draft.name.trim()
    if (!name) {
      setError('Give the courier a name.')
      nameRef.current?.focus()
      return
    }
    // Dispatch falls back to matching a parcel's courier by NAME, so two of
    // the same name would leave it guessing which one was meant.
    if (otherNames.some((n) => n.trim().toLowerCase() === name.toLowerCase())) {
      setError(`You already have a courier called ${name}.`)
      nameRef.current?.focus()
      return
    }
    setBusy(true)
    setError('')
    const problem = await onSave({ ...draft, name }, { close: true })
    setBusy(false)
    if (problem) setError(problem)
  }

  // The questions' own save. For a courier not added yet there is nothing to
  // save them against, so they ride along with the draft until it is added.
  async function commitFaqs(faqs: Courier['faqs']): Promise<boolean> {
    if (isNew) {
      setDraft((d) => ({ ...d, faqs }))
      return true
    }
    setBusy(true)
    setError('')
    setNotice('')
    const problem = await onSave({ ...baseline, faqs }, { close: false })
    setBusy(false)
    if (problem) { setError(problem); return false }
    setBaseline((b) => ({ ...b, faqs }))
    setDraft((d) => ({ ...d, faqs }))
    setNotice('Delivery questions saved.')
    return true
  }

  async function remove() {
    if (!onRemove) return
    const label = baseline.name.trim() || 'this courier'
    let open: number | null = null
    try {
      const res = await fetch('/api/m/shop/admin/couriers/open-parcels')
      if (res.ok) open = ((await res.json()) as { counts: Record<string, number> }).counts[initial.id] ?? 0
    } catch { /* the count is a courtesy; the question below still stands without it */ }
    const still = open === null
      ? ''
      : open === 0
        ? 'Nothing is on its way with them at the moment. '
        : `${open} parcel${open === 1 ? ' is' : 's are'} still on the way with them - tracking for ${open === 1 ? 'it' : 'them'} stops. `
    if (!(await confirm({
      title: `Remove ${label}?`,
      message: `${still}Parcels already sent with them keep the name they were sent with. New parcels will not be able to pick them.`,
      confirmLabel: 'Remove courier',
    }))) return
    setBusy(true)
    setError('')
    const problem = await onRemove()
    setBusy(false)
    if (problem) setError(problem)
  }

  const following = draft.trackingSource !== 'none'
  const known = sourceStages(draft.trackingSource)
  const courierWord = draft.name.trim() || TRACKING_SOURCE_LABELS[draft.trackingSource]
  const stageProps = (key: StageListKey) => ({
    list: draft[key],
    onChange: (next: string[]) => patch({ [key]: next }),
    suggestions: known?.known[key] ?? [],
    reportsItself: known?.reportsItself[key] ?? false,
    courierWord,
  })

  return (
    <div className="scr-overlay" onMouseDown={(e) => e.target === e.currentTarget && requestClose()}>
      <div ref={modalRef} className="scr-modal" role="dialog" aria-modal="true" aria-labelledby="scr-modal-title">
        <div className="scr-modal-head">
          <h2 id="scr-modal-title">
            {isNew ? 'Add a courier' : `Edit ${baseline.name.trim() || 'courier'}`}
          </h2>
          <button type="button" className="scr-close" aria-label="Close" onClick={requestClose}>&times;</button>
        </div>

        <div className="scr-modal-body">
          <Section title="The basics">
            <div className="field">
              <label htmlFor="scr-name">
                Courier name
                <InfoTip>
                  What the customer sees on their order. Change it here and it changes on every parcel
                  already sent with them.
                </InfoTip>
              </label>
              <input
                id="scr-name"
                ref={nameRef}
                type="text"
                value={draft.name}
                maxLength={80}
                placeholder="Furdeco, DPD, Royal Mail…"
                onChange={(e) => patch({ name: e.target.value })}
              />
            </div>
          </Section>

          <Section title="Their tracking page">
            <label className="settings-check">
              <input
                type="checkbox"
                checked={draft.showTrackingLink}
                onChange={(e) => patch({ showTrackingLink: e.target.checked })}
              />
              Show customers this courier&rsquo;s own tracking page
              <InfoTip>
                Turn this off for a courier whose tracking page is really your trade account - your
                account number, your buying terms, their own telephone number. The link is still
                recorded on the parcel for you; the customer just gets the delivery date and time on
                their own order page instead.
              </InfoTip>
            </label>
            {draft.showTrackingLink && (
              <div className="scr-grid scr-sub">
                <div className="scr-grid scr-grid--2">
                  <div className="field">
                    <label htmlFor="scr-link-label">
                      Button wording
                      <InfoTip>
                        Worth changing on a courier you follow automatically. The customer already has
                        the timeline, the window and the driver on your page, so sending them out to
                        &ldquo;track your parcel&rdquo; offers them something they have just read - and
                        hides what their courier&rsquo;s page is actually good for. On DPD, that is a
                        safe place, a neighbour, or moving it to another day. Leave it empty for the
                        usual wording.
                      </InfoTip>
                    </label>
                    <input
                      id="scr-link-label"
                      type="text"
                      value={draft.trackingLinkLabel}
                      maxLength={60}
                      placeholder="Track your parcel"
                      onChange={(e) => patch({ trackingLinkLabel: e.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="scr-link-hint">
                      Line underneath
                      <InfoTip>A few words on what they can change there. Shown only if you fill it in.</InfoTip>
                    </label>
                    <input
                      id="scr-link-hint"
                      type="text"
                      value={draft.trackingLinkHint}
                      maxLength={200}
                      placeholder="Optional"
                      onChange={(e) => patch({ trackingLinkHint: e.target.value })}
                    />
                  </div>
                </div>
                <div className="scr-preview" aria-label="Preview of what the customer sees">
                  <span className="scr-preview-label">On the customer&rsquo;s order</span>
                  <span className="scr-preview-btn">
                    {draft.trackingLinkLabel.trim() || 'Track your parcel'}
                    {NewTabIcon}
                  </span>
                  {draft.trackingLinkHint.trim() && <span className="scr-preview-hint">{draft.trackingLinkHint.trim()}</span>}
                </div>
              </div>
            )}
          </Section>

          <Section title="Getting hold of them">
            <div className="scr-grid scr-grid--2">
              <div className="field">
                <label htmlFor="scr-chat">
                  Live chat link
                  <InfoTip>
                    The courier&rsquo;s own chat page, offered to the customer as a link when they need
                    to rearrange a failed delivery, or have been asked to contact the courier to arrange
                    one.
                  </InfoTip>
                </label>
                <input
                  id="scr-chat"
                  type="url"
                  value={draft.rearrangeChatUrl}
                  maxLength={500}
                  placeholder="https://"
                  onChange={(e) => patch({ rearrangeChatUrl: e.target.value.trim() })}
                />
              </div>
              <div className="field">
                <label htmlFor="scr-phone">
                  Phone number
                  <InfoTip>
                    Shown to the customer with their tracking number, which the courier will ask for -
                    after a failed delivery, and when you use &ldquo;Ask customer to contact&hellip;&rdquo;
                    on an order.
                  </InfoTip>
                </label>
                <input
                  id="scr-phone"
                  type="tel"
                  value={draft.rearrangePhone}
                  maxLength={40}
                  placeholder="Optional"
                  onChange={(e) => patch({ rearrangePhone: e.target.value })}
                />
              </div>
            </div>
          </Section>

          <Section title="Automatic tracking">
            <div className="field">
              <label htmlFor="scr-source">
                Follow this courier&rsquo;s tracking automatically
                <InfoTip>
                  Checks each parcel once an hour - every minute once it is out on a van - and keeps the
                  answer on your own site, so the customer never has to visit theirs. Pick the one that
                  matches your tracking links: Multidrop for multidrop.link, GFS for parcels booked
                  through Global Freight Solutions, DPD for track.dpd.co.uk, AIT for aithd.com links,
                  Fieldly for fieldly.lt-innovations.co.uk links, Palletways for track2.palletways.com
                  links or their 11-digit tracking ID.
                </InfoTip>
              </label>
              <select
                id="scr-source"
                value={draft.trackingSource}
                onChange={(e) => patch({ trackingSource: e.target.value as Courier['trackingSource'] })}
              >
                <option value="none">No - I&rsquo;ll update deliveries myself</option>
                <option value="multidrop">Yes - Multidrop tracking pages</option>
                <option value="gfs">Yes - GFS parcel pages</option>
                <option value="dpd">Yes - DPD</option>
                <option value="ait">Yes - AIT Home Delivery</option>
                <option value="fieldly">Yes - Fieldly (Jewell Enterprises and others)</option>
                <option value="palletways">Yes - Palletways</option>
              </select>
            </div>

            {draft.trackingSource === 'gfs' && (
              <div className="field">
                <label htmlFor="scr-gfs">
                  Which carrier GFS hand your parcels to
                  <InfoTip>
                    GFS are the booking company rather than the van. Their page needs telling who is
                    actually carrying it - usually DPD.
                  </InfoTip>
                </label>
                <input
                  id="scr-gfs"
                  type="text"
                  value={draft.gfsCarrier}
                  maxLength={40}
                  placeholder="DPD"
                  onChange={(e) => patch({ gfsCarrier: e.target.value })}
                />
              </div>
            )}

            {draft.trackingSource === 'palletways' && (
              <div className="field">
                <label htmlFor="scr-due">
                  Delivery due by
                  <InfoTip>
                    Palletways give the day a pallet is due and not the time; the time comes with the
                    service booked - 17:00 on their standard next-day pallets. The customer is told
                    &ldquo;by&rdquo; this time on the due day. Clear it to show the day alone. Their
                    status words are in capitals (&ldquo;AT DELIVERY DEPOT&rdquo;) - list them below as
                    they appear.
                  </InfoTip>
                </label>
                <input
                  id="scr-due"
                  type="time"
                  value={draft.palletwaysDueBy ?? '17:00'}
                  onChange={(e) => patch({ palletwaysDueBy: e.target.value })}
                />
              </div>
            )}

            {following && (
              <>
                <StageListField
                  key={`out-${draft.trackingSource}`}
                  id="scr-stage-out"
                  label="Stages that mean it is out on a van"
                  placeholder="Their exact wording, separated by commas"
                  missingWarning={'Until this is filled in, orders never show "Out for delivery".'}
                  tip="Separate them with commas, and use the courier's own wording exactly. Reaching one of these changes the customer's order from “Delivery scheduled” to “Out for delivery”."
                  {...stageProps('outForDeliveryStages')}
                />
                <StageListField
                  key={`delivered-${draft.trackingSource}`}
                  id="scr-stage-delivered"
                  label="Stages that mean it has arrived"
                  placeholder="Their exact wording, separated by commas"
                  missingWarning="Until this is filled in, orders never mark themselves complete."
                  tip="When every parcel on an order reaches one of these, and nothing is still owed, the order marks itself complete and the customer gets your completion message. Leave it empty and nothing is ever finished off automatically."
                  {...stageProps('deliveredStages')}
                />
                <StageListField
                  key={`failed-${draft.trackingSource}`}
                  id="scr-stage-failed"
                  label="Stages that mean the delivery failed"
                  placeholder="Their exact wording, separated by commas"
                  missingWarning="Until this is filled in, a failed delivery is not spotted."
                  tip="Nobody in, no access, refused. Reaching one takes the order off “Out for delivery”, says the delivery was not possible, and tells the customer - on their order page and in one email - how to get a new day booked. The start of the courier's wording is enough - “Failed Attempt” matches “Failed Attempt - Recipient Not Home”."
                  {...stageProps('failedStages')}
                />

                <div className="field">
                  <label htmlFor="scr-rebook">
                    Who books the new day after a failed delivery
                    <InfoTip>
                      What the order page and the email tell the customer to do. Either way the chat
                      link and phone number above are given - as a way to get hold of the courier
                      sooner when the courier is the one rebooking. On the first setting you can still
                      say, on a single order, that the courier will ring the customer themselves.
                    </InfoTip>
                  </label>
                  <select
                    id="scr-rebook"
                    value={draft.rebookedBy}
                    onChange={(e) => patch({ rebookedBy: e.target.value as Courier['rebookedBy'] })}
                  >
                    <option value="customer">The customer gets in touch with the courier</option>
                    <option value="courier">The courier gets in touch with the customer</option>
                  </select>
                </div>

                <label className="settings-check">
                  <input
                    type="checkbox"
                    checked={draft.showFailedReason}
                    onChange={(e) => patch({ showFailedReason: e.target.checked })}
                  />
                  Tell the customer the courier&rsquo;s reason for a failed delivery
                  <InfoTip>
                    Whatever the courier adds after the failed stage, on the order page and in the email
                    - &ldquo;Failed Attempt - Non Fault - RECIPIENT NOT HOME&rdquo; becomes
                    &ldquo;Recipient not home&rdquo;. Nothing is shown when the courier gives no reason.
                  </InfoTip>
                </label>
              </>
            )}
          </Section>

          <Section
            title="Delivery questions"
            tip="Shown on the order page, and linked from the delivery email, for parcels sent with this courier. A courier with no questions shows no link at all. Plain text - shown exactly as you type it. Each question saves as soon as you save it."
          >
            <CourierFaqEditor
              faqs={draft.faqs}
              busy={busy}
              onCommit={commitFaqs}
              onRemoveAsk={(faq) => confirm({
                title: 'Remove this question?',
                message: `"${faq.question}" will no longer be shown to customers.`,
                confirmLabel: 'Remove question',
              })}
              newFaqId={() => newId('faq')}
              onUnsaved={onFaqUnsaved}
            />
          </Section>
        </div>

        <div className="scr-modal-foot">
          {onRemove && (
            <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={remove}>
              Remove courier
            </button>
          )}
          <span className="scr-spacer" />
          {error && <p className="scr-status scr-status--err" role="alert">{error}</p>}
          {!error && notice && <p className="scr-status scr-status--ok" role="status">{notice}</p>}
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={requestClose}>
            {isNew || dirty ? 'Cancel' : 'Close'}
          </button>
          <button type="button" className="btn btn-primary" disabled={busy || (!isNew && !dirty)} onClick={save}>
            {busy ? 'Saving…' : isNew ? 'Add courier' : 'Save changes'}
          </button>
        </div>
      </div>
      {confirmNode}
    </div>
  )
}
