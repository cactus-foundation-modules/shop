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
    }

export default function OrderAccessForm(props: Props) {
  const router = useRouter()
  const [orderNumber, setOrderNumber] = useState(props.orderNumber ?? '')
  const [postcode, setPostcode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const confirming = props.mode === 'confirm'

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)

    try {
      const res = await fetch('/api/m/shop/public/orders/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          confirming
            ? { orderId: props.orderId, postcode }
            : { orderNumber, postcode },
        ),
      })
      const body = await res.json().catch(() => null)

      if (!res.ok || !body?.path) {
        setError(body?.error ?? 'Something went wrong. Please try again.')
        setBusy(false)
        return
      }

      // refresh() as well as push(), because the gate is very often rendered by
      // the very page being navigated to: without it Next serves the cached
      // render of that route - the gate again - and the customer clicks a button
      // that appears to do nothing. Left busy on purpose; the page is going.
      router.push(body.path)
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
          <label htmlFor="sot-postcode">Delivery postcode</label>
          <input
            id="sot-postcode"
            name="postcode"
            value={postcode}
            onChange={(e) => setPostcode(e.target.value)}
            autoComplete="postal-code"
            autoCapitalize="characters"
            spellCheck={false}
            required
          />
          <span className="sot-hint">
            The postcode the order is being delivered to. Spaces and capitals do not matter.
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
