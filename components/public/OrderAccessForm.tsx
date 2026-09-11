'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

// The one form that lets a shopper with no account into their own order, drawn
// in the two places somebody arrives from.
//
// One component rather than two, because the two are the same question asked
// with different amounts already known, and because the interesting half is not
// the markup - it is what to do with the answer. Two copies would be two
// chances to get the failure wording, the lockout message or the redirect
// subtly different, and the failure wording is load-bearing here: every kind of
// failure has to read identically or the failures themselves become a way of
// learning which order numbers are real.
//
//   lookup  - /shop/track-order, where they type both halves.
//   confirm - the postcode gate on an order page reached from a link in an
//             email. The order is already known, so there is nothing to type
//             but the postcode.
//   document - the same gate again, on an invoice, credit note or proforma. The
//             answer is the ORDER's postcode, and passing it lets the page
//             itself render on the next pass, so this one simply refreshes.
//   receipt - the same gate on the confirmation page, for somebody opening the
//             shop's own receipt link on a device that did not check out. It
//             posts to a different route (the caller holds a signed token
//             rather than an order id) and it does not navigate anywhere: the
//             page it interrupts is the page they wanted, so it simply steps
//             out of the way. It asks for the email address rather than the
//             postcode in two cases - an order with no delivery postcode, and a
//             confirmation link old enough to have carried the address in its
//             own query string - and in the second there is no token either.
//             See lib/order-receipt-challenge.ts.

type Props =
  | {
      mode: 'lookup'
      /** Prefilled from a tracking link's own address, and still editable -
       *  a typo in the link should not be a dead end. */
      orderNumber?: string
      orderId?: undefined
    }
  | {
      mode: 'confirm'
      /** Shown so they can see which order they are proving. */
      orderNumber: string
      /** What the request is made against, so nothing has to be typed. */
      orderId: string
      /** What the link asked the order page to open, as a query string ready to
       *  append - see lib/order-link-intent.ts. Empty on a link that only asked
       *  to be let in, which is nearly all of them. */
      intent?: string
    }
  | {
      mode: 'receipt'
      orderNumber: string
      orderId?: undefined
      /** The signed receipt token off the confirmation link, which is what says
       *  which order is being asked about. Absent on a link old enough to have
       *  carried the customer's email address instead, where the email is both
       *  what identifies the order and what opens it. */
      token?: string
      /** Which question this order can be opened with, as the server decided. */
      challenge: 'postcode' | 'email'
      /** Called once the answer is accepted, so the page can get on with
       *  showing the receipt rather than reloading itself. */
      onProved: () => void
    }
  | {
      mode: 'document'
      orderNumber?: undefined
      orderId?: undefined
      /** Which of the shop's three documents is being opened. */
      kind: 'invoice' | 'credit-note' | 'proforma'
      /** Its own number, as it appears in its address. */
      number: string
      /** The permanent link token off that address, which says which document
       *  is being asked about and nothing about who is asking. */
      token: string
      challenge: 'postcode' | 'email'
    }

export default function OrderAccessForm(props: Props) {
  const router = useRouter()
  const [orderNumber, setOrderNumber] = useState(props.orderNumber ?? '')
  // Named for what it is rather than for the postcode it usually holds: on a
  // receipt whose order has no delivery postcode, and on an older confirmation
  // link, the same box takes the email address instead.
  const [answer, setAnswer] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const receipt = props.mode === 'receipt'
  // Not named `document`: this is a client component, and shadowing the DOM's
  // own global inside one is a trap waiting for whoever edits it next.
  const documentMode = props.mode === 'document'
  // The two that answer a challenge and stay where they are, as against the two
  // that look an order up and navigate to it.
  const proving = receipt || documentMode
  // Whether the order number box is hidden because the page already knows it.
  const confirming = props.mode === 'confirm' || proving
  const askingEmail = proving && props.challenge === 'email'

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)

    try {
      const endpoint = receipt
        ? '/api/m/shop/public/orders/receipt-access'
        : documentMode
          ? '/api/m/shop/public/documents/access'
          : '/api/m/shop/public/orders/track'
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          props.mode === 'receipt'
            ? { orderNumber: props.orderNumber, token: props.token, answer }
            : props.mode === 'document'
              ? { kind: props.kind, number: props.number, token: props.token, answer }
              : props.mode === 'confirm'
                ? { orderId: props.orderId, postcode: answer }
                : { orderNumber, postcode: answer },
        ),
      })
      const body = await res.json().catch(() => null)

      if (!res.ok || !(proving ? body?.ok : body?.path)) {
        setError(body?.error ?? 'Something went wrong. Please try again.')
        setBusy(false)
        return
      }

      if (props.mode === 'receipt') {
        // Left busy on purpose: the gate is about to be replaced by the receipt
        // itself, and a button that springs back to life first only invites a
        // second submission of an answer already accepted.
        props.onProved()
        return
      }

      if (documentMode) {
        // The document is drawn on the server, and the cookie that opens it has
        // just been written - so there is nowhere to go, only this page to draw
        // again. Left busy for the same reason as above.
        router.refresh()
        return
      }

      // refresh() as well as push(), because the gate is very often rendered by
      // the very page being navigated to: without it Next serves the cached
      // render of that route - the gate again - and the customer clicks a button
      // that appears to do nothing. Left busy on purpose; the page is going.
      //
      // The intent rides along so somebody who had to prove a postcode first
      // still lands on the thing their email offered them, rather than on the
      // order page with the form they clicked for closed.
      router.push(`${body.path}${props.mode === 'confirm' ? props.intent ?? '' : ''}`)
      router.refresh()
    } catch {
      setError('We could not reach the shop just then. Please try again.')
      setBusy(false)
    }
  }

  return (
    <form className="sot-form" onSubmit={submit} noValidate>
      {error && <p className="sot-error" role="alert">{error}</p>}

      <div className={confirming ? 'sot-fields sot-one' : 'sot-fields'}>
        {!confirming && (
          <div className="sot-field">
            <label htmlFor="sot-order">Order number</label>
            <input
              id="sot-order"
              name="orderNumber"
              value={orderNumber}
              onChange={(e) => setOrderNumber(e.target.value)}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              required
            />
            <span className="sot-hint">It is at the top of every email we have sent you about this order.</span>
          </div>
        )}

        <div className="sot-field">
          <label htmlFor="sot-postcode">{askingEmail ? 'Email address' : 'Delivery postcode'}</label>
          <input
            id="sot-postcode"
            name={askingEmail ? 'email' : 'postcode'}
            type={askingEmail ? 'email' : 'text'}
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            autoComplete={askingEmail ? 'email' : 'postal-code'}
            autoCapitalize={askingEmail ? 'none' : 'characters'}
            spellCheck={false}
            required
          />
          <span className="sot-hint">
            {askingEmail
              ? 'The address we sent your order confirmation to.'
              : 'The postcode the order is being delivered to. Spaces and capitals do not matter.'}
          </span>
        </div>
      </div>

      <div className="sot-actions">
        <button type="submit" className="sot-btn sot-btn-primary" disabled={busy}>
          {busy ? 'Checking…' : 'View my order'}
        </button>
      </div>
    </form>
  )
}
