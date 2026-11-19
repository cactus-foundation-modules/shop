'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  DAMAGED_GOODS_GUIDANCE,
  MAX_DAMAGE_PHOTOS,
  SHP_ISSUE_KINDS,
  type ShpIssueKind,
} from '@/modules/shop/lib/order-requests'
import type { ReturnsPolicy } from '@/modules/shop/lib/returnable'
import type { ShpMissingKind, ShpOrderRequestType } from '@/modules/shop/lib/types'
import { IssuePhotoPicker, useIssuePhotos } from '@/modules/shop/components/public/IssuePhotoPicker'

// The customer's side of the three things they can ask for after the order has
// gone: call it off, send it back, or tell us it arrived broken.
//
// Eligibility is decided on the server and handed down as a message, never
// re-derived here - lib/order-requests.ts is the one copy of those rules, so a
// button that appears and an endpoint that accepts can never disagree.
//
// Reporting an issue is deliberately its own door rather than a reason in the
// return list. A return is a change of mind and ends in a collection; a fault is
// our mistake and ends in a replacement, and the two want different questions
// asked. Put in one dropdown, "it arrived damaged" is the line people pick, and
// every breakage then has to be unpicked by email.
//
// It starts with a question rather than a form: damage, something missing, or
// another issue. Each wants different things asked - photographs of a broken
// leg, "all of it or just bits?" about a box that never came, the customer's own
// words about anything else - and one form asking all of it read as a damage
// form that everyone else had to bend to fit.
//
// It is also the one door that stays open after it has been used. A report
// spends nothing, so a second one is allowed while the first is still being
// looked at - the button says "Report another issue" and the form is the same
// form. An order of eight desks is opened one carton at a time.

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
  /** How many issue reports are already open on this order. Changes the wording
   *  of the button and nothing else - a second report is as allowed as the
   *  first. */
  openReports: number
  /** True when the customer arrived from a "something not right?" link in an
   *  email, which opens the form rather than the card. See
   *  lib/order-requests.ts - reportIssueUrl. */
  openReportInitially?: boolean
}

const muted: React.CSSProperties = { color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }
const label: React.CSSProperties = { fontWeight: 'var(--font-medium)' }

export default function OrderRequestPanel(props: Props) {
  const router = useRouter()
  // Whether the email link's request to open the form can actually be honoured.
  // Checked rather than trusted: a link followed before anything was dispatched
  // would otherwise open a form with nothing on it to report and a button that
  // 400s. The page behind it still says why, which is the answer they needed.
  const canOpenReport = props.damage.allowed && props.lines.some((line) => line.dispatchedQty > 0)
  const [open, setOpen] = useState<ShpOrderRequestType | null>(
    props.openReportInitially && canOpenReport ? 'DAMAGE' : null,
  )
  const [reason, setReason] = useState('')
  // Which kind of issue, on a report. Null until the customer has answered the
  // first question, which is what shows the three choices instead of a form.
  const [issueKind, setIssueKind] = useState<ShpIssueKind | null>(null)
  // Per line, on a missing-item report: the whole thing, or parts of it.
  const [missing, setMissing] = useState<Record<string, ShpMissingKind>>({})
  const [note, setNote] = useState('')
  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { photos, uploading, addPhotos, removePhoto, clear: clearPhotos } = useIssuePhotos(props.orderId, MAX_DAMAGE_PHOTOS, setError)

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
  const issue = SHP_ISSUE_KINDS.find((one) => one.kind === issueKind) ?? null
  // On a report, only the codes the chosen kind files under - and none at all to
  // pick from when that is a single code, which the form then sends by itself.
  const reasons =
    open === 'CANCEL'
      ? props.cancelReasons
      : open === 'DAMAGE'
        ? props.damageReasons.filter((option) => issue?.reasons.includes(option.code))
        : props.returnReasons
  const askReason = open !== 'DAMAGE' || reasons.length > 1
  const partsMissing = issueKind === 'MISSING' && Object.entries(missing).some(
    ([orderItemId, kind]) => kind === 'PARTS' && (quantities[orderItemId] ?? 0) > 0,
  )
  const noteRequired = issueKind === 'OTHER' || partsMissing

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
    setIssueKind(null)
    setMissing({})
    setNote('')
    clearPhotos()
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

  /** The answer to "what kind of issue?". A kind with one reason code files
   *  under it without asking; damage still asks arrived-broken or gone-faulty. */
  function chooseIssue(kind: ShpIssueKind) {
    const chosenKind = SHP_ISSUE_KINDS.find((one) => one.kind === kind)
    setIssueKind(kind)
    setReason(chosenKind && chosenKind.reasons.length === 1 ? chosenKind.reasons[0]! : '')
    setQuantities({})
    setMissing({})
    clearPhotos()
    setError(null)
  }

  async function submit() {
    if (!open) return
    if (!reason) {
      setError('Pick a reason so we know what happened.')
      return
    }
    const items = Object.entries(quantities)
      .filter(([, quantity]) => quantity > 0)
      .map(([orderItemId, quantity]) => ({
        orderItemId,
        quantity,
        ...(issueKind === 'MISSING' ? { missing: missing[orderItemId] ?? null } : {}),
      }))
    if (open === 'RETURN' && items.length === 0) {
      setError('Choose at least one item to send back.')
      return
    }
    if (open === 'CANCEL' && items.length === 0) {
      setError('Choose at least one item to call off.')
      return
    }
    if (open === 'DAMAGE' && items.length === 0) {
      setError(
        issueKind === 'MISSING'
          ? 'Tell us which item is missing.'
          : issueKind === 'OTHER'
            ? 'Tell us which item this is about.'
            : 'Tell us which item is damaged.',
      )
      return
    }
    if (issueKind === 'MISSING' && items.some((item) => !missing[item.orderItemId])) {
      setError('For each missing item, tell us whether all of it is missing or just parts of it.')
      return
    }
    if (noteRequired && !note.trim()) {
      setError(issueKind === 'OTHER' ? 'Tell us what is wrong so we can put it right.' : 'Tell us which parts are missing.')
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
          photoMediaIds: open === 'DAMAGE' && issueKind !== 'MISSING' ? photos.map((photo) => photo.mediaId) : [],
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

  if (open === 'DAMAGE' && !issue) {
    return (
      <section className="sod-card sod-wide">
        <div className="sod-card-head">
          <h2 className="sod-card-title">Report an issue</h2>
        </div>
        <div className="sod-card-body">
          <span style={label}>What is the problem?</span>
          <div style={{ display: 'grid', gap: '0.5rem' }}>
            {SHP_ISSUE_KINDS.map((option) => (
              <button
                key={option.kind}
                type="button"
                className="btn"
                onClick={() => chooseIssue(option.kind)}
                style={{ display: 'grid', justifyItems: 'start', textAlign: 'left', gap: '0.125rem' }}
              >
                <span style={label}>{option.label}</span>
                <span style={muted}>{option.hint}</span>
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button type="button" className="btn" onClick={() => setOpen(null)}>
              Never mind
            </button>
          </div>
        </div>
      </section>
    )
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
                ? issue?.label ?? 'Report an issue'
                : 'Send something back'}
          </h2>
        </div>
        <div className="sod-card-body">

        {open === 'DAMAGE' && (
          <p style={{ margin: 0, ...muted }}>
            {issueKind === 'MISSING'
              ? 'Only things we have already sent you are listed. Tick what is missing and tell us whether all of it is missing or just parts of it.'
              : issueKind === 'OTHER'
                ? 'Tick the item or items this is about and tell us what is wrong.'
                : 'Tick what has arrived damaged and tell us what happened.'}{' '}
            <button type="button" className="btn btn-sm" onClick={() => setIssueKind(null)} disabled={busy}>
              Not this? Go back
            </button>
          </p>
        )}

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
                Report an issue instead
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
                ? issueKind === 'MISSING'
                  ? 'What is missing?'
                  : issueKind === 'OTHER'
                    ? 'Which item is this about?'
                    : 'What has arrived damaged?'
                : open === 'CANCEL'
                  ? 'What are you calling off?'
                  : 'What are you sending back?'}
            </span>
            {open === 'DAMAGE' && chosen.map((line) => (
              <IssueLine
                key={line.orderItemId}
                line={line}
                quantity={quantities[line.orderItemId] ?? 0}
                onQuantity={(quantity) => setQuantities((current) => ({ ...current, [line.orderItemId]: quantity }))}
                missing={issueKind === 'MISSING' ? missing[line.orderItemId] ?? null : undefined}
                onMissing={(kind) => setMissing((current) => ({ ...current, [line.orderItemId]: kind }))}
              />
            ))}
            {open !== 'DAMAGE' && chosen.map((line) => {
              const max = open === 'CANCEL' ? line.cancellableQty : line.returnableQty
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

        {askReason && (
          <label style={{ display: 'grid', gap: '0.25rem' }}>
            <span style={label}>{open === 'DAMAGE' ? 'What has happened?' : 'Why?'}</span>
            <select value={reason} onChange={(e) => setReason(e.target.value)}>
              <option value="">Choose a reason…</option>
              {reasons.map((option) => (
                <option key={option.code} value={option.code}>{option.label}</option>
              ))}
            </select>
          </label>
        )}

        {/* Optional on every kind of report. Asked for, because a picture of the
            damage and of the packaging settles most of these on the spot, but
            never required: a customer with no camera to hand still has an issue
            worth hearing about. Not offered on a missing item, which is not
            there to photograph. */}
        {open === 'DAMAGE' && issueKind !== 'MISSING' && (
          <div style={{ display: 'grid', gap: '0.5rem' }}>
            <span style={label}>Photographs (optional)</span>
            <p style={{ margin: 0, ...muted }}>
              {issueKind === 'OTHER'
                ? 'If a picture would help show what is wrong, add it here.'
                : 'A picture of the damage and one of the packaging it came in usually settle these on the spot.'}{' '}
              Up to {MAX_DAMAGE_PHOTOS}.
            </p>
            <IssuePhotoPicker
              photos={photos}
              max={MAX_DAMAGE_PHOTOS}
              uploading={uploading}
              disabled={busy}
              onAdd={(files) => void addPhotos(files)}
              onRemove={removePhoto}
            />
          </div>
        )}

        <label style={{ display: 'grid', gap: '0.25rem' }}>
          <span style={label}>
            {issueKind === 'OTHER' && open === 'DAMAGE'
              ? 'What is wrong?'
              : partsMissing
                ? 'Which parts are missing?'
                : 'Anything else we should know? (optional)'}
          </span>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={2000} />
        </label>

        {error && <p style={{ color: 'var(--color-error)', margin: 0 }}>{error}</p>}

        {/* Sent on the right, backing out to the left of it. The pair reads in
            the order the page is finished in, and the button that does the thing
            sits where every other form on the site puts it. */}
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={() => setOpen(null)} disabled={busy}>
            Never mind
          </button>
          <button type="button" className="btn btn-primary" onClick={submit} disabled={busy || uploading}>
            {busy ? 'Sending…' : open === 'DAMAGE' ? 'Send report' : 'Send request'}
          </button>
        </div>
        </div>
      </section>
    )
  }

  // Nothing on offer and nothing worth saying about why. An order placed twenty
  // minutes ago refuses all three for reasons marked silent, and a card headed
  // "Something not right?" with nothing under it is a worse answer than no card:
  // it reads as a thing that has failed to load.
  const offers = [props.cancel, props.return, props.damage]
  const anythingOffered =
    (props.cancel.allowed && cancellable.length > 0) ||
    (props.return.allowed && returnable.length > 0) ||
    (props.damage.allowed && arrived.length > 0)
  if (!anythingOffered && !offers.some((one) => !one.allowed && one.reason)) return null

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
          <button type="button" className="btn" onClick={() => start('DAMAGE')}>
            {props.openReports > 0 ? 'Report another issue' : 'Report an issue'}
          </button>
          {/* Offered on its own terms rather than as a footnote to returns: it
              applies to goods we do not take back, and it does not stop when the
              return window does - nor when one report is already in, which is
              what the second wording is for. */}
          <p style={{ margin: '0.375rem 0 0', ...muted }}>
            {props.openReports > 0
              ? 'Found something else? Tell us about that one too - a report already with us does not stop you sending another.'
              : 'Something damaged, missing or otherwise not right? Tell us and we will put it right - there is no window on this and it applies to everything, including anything we cannot normally take back.'}
          </p>
        </div>
      ) : (
        props.damage.reason && <p style={{ margin: 0, ...muted }}>{props.damage.reason}</p>
      )}
      </div>
    </section>
  )
}

/**
 * One delivered line on an issue report: tick it, say how many, and - on a
 * missing-item report - whether all of it is missing or only parts of it.
 *
 * A tick rather than a number box because the question is "which one", and a
 * row of zeroes reads as a sum to do. The number appears only once there is a
 * choice to make: one of a thing is one of it.
 */
function IssueLine({ line, quantity, onQuantity, missing, onMissing }: {
  line: RequestLine
  quantity: number
  onQuantity: (quantity: number) => void
  /** Undefined when the report is not about something missing, which hides the
   *  whole-or-parts question altogether. */
  missing: ShpMissingKind | null | undefined
  onMissing: (kind: ShpMissingKind) => void
}) {
  const max = line.dispatchedQty
  const ticked = quantity > 0
  return (
    <div style={{ display: 'grid', gap: '0.375rem' }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <input type="checkbox" checked={ticked} onChange={(e) => onQuantity(e.target.checked ? 1 : 0)} />
        <span>{line.productName}</span>
      </label>
      {ticked && (max > 1 || missing !== undefined) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.75rem', paddingLeft: '1.5rem' }}>
          {max > 1 && (
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={muted}>How many?</span>
              <input
                type="number"
                min={1}
                max={max}
                value={quantity}
                onChange={(e) => onQuantity(Math.max(1, Math.min(max, Number(e.target.value) || 1)))}
                style={{ width: '4.5rem' }}
                aria-label={`How many of ${line.productName}`}
              />
              <span style={muted}>of {max}</span>
            </label>
          )}
          {missing !== undefined && (
            <fieldset style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', border: 0, padding: 0, margin: 0 }}>
              <legend className="sr-only">Is all of {line.productName} missing?</legend>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                <input
                  type="radio"
                  name={`missing-${line.orderItemId}`}
                  checked={missing === 'WHOLE'}
                  onChange={() => onMissing('WHOLE')}
                />
                <span>The whole item</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                <input
                  type="radio"
                  name={`missing-${line.orderItemId}`}
                  checked={missing === 'PARTS'}
                  onChange={() => onMissing('PARTS')}
                />
                <span>Just parts of it</span>
              </label>
            </fieldset>
          )}
        </div>
      )}
    </div>
  )
}
