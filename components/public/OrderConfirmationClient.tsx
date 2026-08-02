'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { formatMoney } from '@/modules/shop/lib/money'

type OrderStatusResponse = {
  order: { orderNumber: string; total: string; paymentMethod: string; paymentStatus: string }
  items: Array<{ productName: string; quantity: number; total: string; lineMeta?: { fields: Array<{ label: string; value: string; href?: string }> } | null }>
  instructions: string | null
  // Whether the method has no automated confirmation (bank transfer, cash), from
  // the provider's own confirmMode. Optional so a response from an older cached
  // bundle still renders - the fallback is the built-in-methods test below.
  manualPayment?: boolean
  currencySymbol: string
}

// An automated payment sitting at AWAITING_CONFIRMATION settles a few minutes
// after the shopper lands here, and the page fetched its order exactly once, so
// nothing ever showed the change - leaving them refreshing a page that says
// "a few minutes" indefinitely. Poll while it is genuinely in flight: briskly at
// first, since most open-banking payments clear inside a minute, then slower,
// and give up at the limit rather than polling a shop's server all afternoon.
// The confirmation email is the backstop in every case, which is what makes
// giving up acceptable.
const POLL_FAST_MS = 5_000
const POLL_SLOW_MS = 15_000
const POLL_FAST_FOR_MS = 60_000
const POLL_LIMIT_MS = 5 * 60_000

// Taken from the provider's own confirmMode where the server offered it; the
// method test is the fallback for a response from an older cached bundle.
function isManualPayment(data: OrderStatusResponse): boolean {
  return data.manualPayment ?? (data.order.paymentMethod === 'BANK_TRANSFER' || data.order.paymentMethod === 'CASH')
}

// Only an automated payment that is still settling is worth waiting on. A manual
// method can sit at AWAITING_CONFIRMATION for days while the shopper gets round
// to the transfer, and polling for that would be a slow way to achieve nothing.
function isSettling(data: OrderStatusResponse): boolean {
  return data.order.paymentStatus === 'AWAITING_CONFIRMATION' && !isManualPayment(data)
}

// A shopper who paid off-site (PayPal, open banking) reaches this page by
// redirect from the provider's return route, so nothing has cleared their
// basket the way the on-page confirm path does - they'd be thanked for their
// order while still carrying it. Clear it here, but ONLY for the order this
// browsing session actually placed: the same page is where a confirmation link
// out of an email lands weeks later, and that must not empty a basket somebody
// has since refilled. Dropping the stored order keys afterwards also stops a
// finished order lingering as something a later checkout could confirm against.
//
// A failed payment keeps its basket. Emptying it would leave the shopper on a
// page telling them to try again with nothing left to try again with, which is
// the one moment the goods matter most. Returns whether it actually cleared,
// because a payment that fails LATER - after settling was under way and the
// basket had already gone - needs to be told about differently.
async function clearPlacedOrderState(orderNumber: string, paymentStatus: string): Promise<boolean> {
  if (paymentStatus !== 'PAID' && paymentStatus !== 'AWAITING_CONFIRMATION') return false
  if (sessionStorage.getItem('cactus_shop_order_number') !== orderNumber) return false
  sessionStorage.removeItem('cactus_shop_order_id')
  sessionStorage.removeItem('cactus_shop_order_number')
  sessionStorage.removeItem('cactus_shop_paypal_order_id')
  const { clearCart } = await import('@/modules/shop/components/public/cart')
  const { clearOrderSpecificState } = await import('@/modules/shop/components/public/checkout-state')
  clearCart()
  clearOrderSpecificState()
  return true
}

// Client island for the order-confirmation view (reads order from the URL query).
// Registered Puck block wrapper (ShopOrderConfirmation) is a server component that
// renders this, so Puck's RSC <Render> never serialises its renderDropZone
// function bag into the client.
export function OrderConfirmationClient() {
  const [data, setData] = useState<OrderStatusResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Whether we watched this order settle rather than arriving to find it done.
  // Only that shopper waited, so only that shopper is owed the good news.
  const [watched, setWatched] = useState(false)
  const [pollGaveUp, setPollGaveUp] = useState(false)
  const [basketCleared, setBasketCleared] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const orderNumber = params.get('orderNumber')
    const email = params.get('email')
    if (!orderNumber || !email) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- guard clause on URL params read at mount, no async boundary applies
      setError('Missing order details')
      return
    }

    const url = `/api/m/shop/public/orders/status?orderNumber=${encodeURIComponent(orderNumber)}&email=${encodeURIComponent(email)}`
    const startedAt = Date.now()
    let cancelled = false
    let loaded = false
    let latest: OrderStatusResponse | null = null
    let timer: ReturnType<typeof setTimeout> | undefined

    async function load(): Promise<OrderStatusResponse | null> {
      let body: OrderStatusResponse & { error?: string }
      try {
        const res = await fetch(url)
        body = await res.json()
        if (cancelled) return null
        if (!res.ok) {
          // Only the very first read is allowed to call the order missing. A
          // failed poll is a blip on a page already showing a real order, and
          // replacing that with an error is a worse answer than the one already
          // on screen.
          if (!loaded) setError(body.error ?? 'Order not found')
          return null
        }
      } catch {
        return null
      }
      if (cancelled) return null
      loaded = true
      latest = body
      setData(body)
      return body
    }

    // Coming back to a backgrounded tab. Hidden time still counts towards the
    // give-up limit, so a shopper who wandered off could return to a stale "any
    // minute now" - one catch-up read fixes that. Deliberately does not restart
    // the loop: while the loop is alive this is just an eager extra read, and
    // once it has given up a single read is the whole point.
    async function onVisibilityChange() {
      if (cancelled || document.visibilityState !== 'visible') return
      if (!latest || !isSettling(latest)) return
      await load()
    }

    function schedule() {
      const elapsed = Date.now() - startedAt
      if (elapsed >= POLL_LIMIT_MS) { setPollGaveUp(true); return }
      timer = setTimeout(tick, elapsed < POLL_FAST_FOR_MS ? POLL_FAST_MS : POLL_SLOW_MS)
    }

    async function tick() {
      // A backgrounded tab is nobody watching, so there is nothing to be timely
      // about - skip the request and take the next slot instead.
      if (document.visibilityState === 'hidden') { schedule(); return }
      const body = await load()
      if (cancelled) return
      // A one-off network failure returns null; keep waiting rather than
      // abandoning a payment that is very probably still on its way.
      if (!body || isSettling(body)) schedule()
    }

    load().then(async (body) => {
      if (cancelled || !body) return
      const cleared = await clearPlacedOrderState(orderNumber, body.order.paymentStatus)
      if (cancelled) return
      if (cleared) setBasketCleared(true)
      if (isSettling(body)) { setWatched(true); schedule() }
    })

    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [])

  if (error) return <p style={{ color: 'var(--color-danger)' }}>{error}</p>
  if (!data) return null

  const isManual = isManualPayment(data)
  const awaiting = data.order.paymentStatus === 'AWAITING_CONFIRMATION'
  const failed = data.order.paymentStatus === 'FAILED'
  // Announced only to the shopper who sat here through the wait. Someone opening
  // the same link later just sees an ordinary confirmed order.
  const settledWhileWatching = watched && data.order.paymentStatus === 'PAID'

  return (
    <section style={{ display: 'grid', gap: '1rem', maxWidth: 480 }}>
      {/* A payment that failed on the provider's side still lands here, because
          the return route has nowhere else to send it. Thanking someone for an
          order that was never paid for is the wrong thing to say. */}
      <h1 style={{ fontSize: '1.5rem', margin: 0 }}>{failed ? 'Your payment didn’t go through' : 'Thanks for your order'}</h1>
      <p style={{ color: 'var(--color-text-muted)' }}>Order <strong>{data.order.orderNumber}</strong></p>
      {/* Two different failures, and the difference is whether the basket is
          still there. Straight out of the bank it is, because nothing was
          cleared. Falling over after settling had begun means the basket went
          when the order looked good, so pointing at a checkout that is now empty
          would be the second unhelpful thing to happen in a row. */}
      {failed && (
        <p style={{ background: 'var(--color-bg-subtle)', borderRadius: 6, padding: '0.75rem' }}>
          Your bank didn&apos;t complete the payment, so this order hasn&apos;t been placed and you haven&apos;t been charged.{' '}
          {basketCleared ? (
            <>Do start again from <Link href="/shop">the shop</Link> whenever you&apos;re ready - and sorry for the runaround.</>
          ) : (
            <>Your basket is still where you left it - <Link href="/shop/checkout">head back to checkout</Link> and try again,
              with another payment method if you&apos;d rather.</>
          )}
        </p>
      )}
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.375rem' }}>
        {data.items.map((item, i) => (
          <li key={i} style={{ display: 'grid', gap: '0.125rem' }}>
            <span style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>{item.productName} x{item.quantity}</span>
              <span>{formatMoney(item.total, data.currencySymbol)}</span>
            </span>
            {item.lineMeta?.fields?.length ? (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.125rem' }}>
                {item.lineMeta.fields.map((f, j) => (
                  <li key={j} style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
                    <span style={{ fontWeight: 500 }}>{f.label}:</span>{' '}
                    {f.href ? <a href={f.href} target="_blank" rel="noopener noreferrer">{f.value}</a> : f.value}
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>
      {/* "Awaiting confirmation" means two opposite things, so it must not read
          the same way twice. On a manual method the shopper still has to go and
          pay; on an automated one they already have, and all that is left is the
          wait. Saying "a few minutes" out loud stops the order looking stuck to
          someone refreshing the page. */}
      {awaiting && isManual && (
        <p style={{ background: 'var(--color-bg-subtle)', borderRadius: 6, padding: '0.75rem' }}>
          Your order is awaiting payment confirmation. We&apos;ll be in touch once it clears.
        </p>
      )}
      {awaiting && !isManual && (
        <p style={{ background: 'var(--color-bg-subtle)', borderRadius: 6, padding: '0.75rem' }}>
          Your payment has gone through, thank you. Banks being banks, it usually takes a few minutes to clear -
          this page updates itself the moment it does, and your confirmation email follows then.
          Nothing further is needed from you in the meantime.
          {pollGaveUp && ' This one is taking longer than usual, which happens. Feel free to close the page: the email will still arrive.'}
        </p>
      )}
      {settledWhileWatching && (
        <p style={{ background: 'var(--color-bg-subtle)', borderRadius: 6, padding: '0.75rem' }}>
          That&apos;s the payment cleared - your order is now being processed, and the confirmation email is on its way.
        </p>
      )}
      {isManual && data.instructions && (
        <p style={{ whiteSpace: 'pre-wrap', background: 'var(--color-bg-subtle)', borderRadius: 6, padding: '0.75rem' }}>
          {data.instructions}
        </p>
      )}
    </section>
  )
}
