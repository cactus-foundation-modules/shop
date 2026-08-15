'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { formatMoney } from '@/modules/shop/lib/money'
import { sortLinesByGroup } from '@/modules/shop/lib/cart-group'
import { ORDER_CONFIRMATION_CSS } from '@/modules/shop/components/public/order-confirmation-css'
import RegisterForm from '@/components/members/RegisterForm'
import type { ShpAddress } from '@/modules/shop/lib/types'

type OrderStatusResponse = {
  order: {
    orderNumber: string
    status: string
    customerName: string
    customerEmail: string
    shippingAddress: ShpAddress
    subtotal: string
    discountAmount: string
    shippingAmount: string
    taxAmount: string
    total: string
    taxMode: 'INCLUSIVE' | 'EXCLUSIVE'
    couponCode: string | null
    shippingRateName: string | null
    paymentMethod: string
    paymentMethodLabel: string
    paymentStatus: string
    createdAt: string
  }
  items: Array<{
    productName: string
    productSku: string | null
    quantity: number
    unitPrice: string
    total: string
    lineMeta?: {
      fields: Array<{ label: string; value: string; href?: string }>
      // Shop's own generic grouping, persisted at checkout - see lib/cart-group.
      group?: { key: string; role: 'main' | 'attachment'; caption?: string; depth?: number; order?: number } | null
    } | null
    imageUrl?: string | null
  }>
  instructions: string | null
  // Whether the method has no automated confirmation (bank transfer, cash), from
  // the provider's own confirmMode. Optional so a response from an older cached
  // bundle still renders - the fallback is the built-in-methods test below.
  manualPayment?: boolean
  // Present only when this order was placed as a guest, the owner has asked for
  // the prompt, and the site actually takes registrations. Optional so a
  // response from an older cached bundle simply shows no prompt.
  //
  // Everything past registerUrl is what the embedded registration form needs.
  // All optional, because an older cached bundle answers with the url alone -
  // and without a registration mode there is no form to render, so that case
  // falls back to the link this prompt used to be.
  accountPrompt?: {
    registerUrl: string
    verifyEmailUrl?: string
    registrationMode?: 'OPEN' | 'INVITE_ONLY' | 'APPROVAL_REQUIRED'
    collectUsername?: boolean
    collectDisplayName?: boolean
    privacyPolicyUrl?: string | null
  } | null
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
//
// PENDING counts as settling too. A shopper redirected back from the provider
// before its return route could confirm the payment - or before the webhook
// landed - arrives on an order that has not moved off PENDING yet. Left out of
// this test, that page never polled, so it never noticed the payment settle and
// never emptied the basket.
function isSettling(data: OrderStatusResponse): boolean {
  const status = data.order.paymentStatus
  return (status === 'AWAITING_CONFIRMATION' || status === 'PENDING') && !isManualPayment(data)
}

// A shopper who paid off-site (PayPal, open banking, Square) reaches this page
// by redirect from the provider's return route, so nothing has cleared their
// basket the way the on-page confirm path does - they'd be thanked for their
// order while still carrying it. Clear it here, but ONLY for the order this
// browsing session actually placed: the same page is where a confirmation link
// out of an email lands weeks later, and that must not empty a basket somebody
// has since refilled. Dropping the stored order afterwards also stops a
// finished order lingering as something a later checkout could confirm against.
//
// A failed payment keeps its basket. Emptying it would leave the shopper on a
// page telling them to try again with nothing left to try again with, which is
// the one moment the goods matter most. Returns whether it actually cleared,
// because a payment that fails LATER - after settling was under way and the
// basket had already gone - needs to be told about differently.
async function clearPlacedOrderState(orderNumber: string, paymentStatus: string): Promise<boolean> {
  if (paymentStatus !== 'PAID' && paymentStatus !== 'AWAITING_CONFIRMATION') return false
  const { isPlacedOrder, forgetPlacedOrder, clearOrderSpecificState } =
    await import('@/modules/shop/components/public/checkout-state')
  if (!isPlacedOrder(orderNumber)) return false
  forgetPlacedOrder()
  const { clearCart } = await import('@/modules/shop/components/public/cart')
  clearCart()
  clearOrderSpecificState()
  return true
}

const ICON_TICK = <path d="m4 12 5.5 5.5L20 7" />
const ICON_CLOCK = <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>
const ICON_ALERT = <><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" /></>
const ICON_IMAGE = <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="m4 16 5-5 4 4 3-3 4 4" /></>

function Icon({ children, className }: { children: React.ReactNode; className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">{children}</svg>
}

// First name only, and only when it looks like one. "Thanks, Dr Amelia
// Fortescue-Smythe" is not how anyone is thanked out loud, and a name field
// holding a company ("Fortescue Ltd") should simply drop out rather than be
// chopped into something that reads as a person.
function greetingName(customerName: string, address: ShpAddress): string | null {
  const first = (address.firstName || customerName.trim().split(/\s+/)[0] || '').trim()
  return first.length > 0 && first.length <= 24 ? first : null
}

// The address as an envelope would carry it: blank lines dropped, no trailing
// commas, business name above the street where a business address puts it.
function addressLines(address: ShpAddress): string[] {
  return [
    [address.firstName, address.lastName].filter(Boolean).join(' '),
    address.company,
    address.line1,
    address.line2,
    address.city,
    address.county,
    address.postcode,
    address.country && address.country !== 'GB' ? address.country : '',
  ].map((line) => (line ?? '').trim()).filter((line) => line.length > 0)
}

function formatOrderDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })
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
    // `t` is the signed receipt token the checkout now hands over; `email` is
    // the older shape, still read so a link somebody bookmarked or had emailed
    // to them before this change keeps working. Neither is invented here - the
    // server decides which one it will accept.
    const token = params.get('t')
    const email = params.get('email')
    if (!orderNumber || (!token && !email)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- guard clause on URL params read at mount, no async boundary applies
      setError('Missing order details')
      return
    }

    // Narrowed once here: the guard above doesn't reach inside the hoisted
    // helpers below, and an assertion at each use is a worse way to say it.
    const placedOrderNumber: string = orderNumber
    const url = token
      ? `/api/m/shop/public/orders/status?orderNumber=${encodeURIComponent(orderNumber)}&t=${encodeURIComponent(token)}`
      : `/api/m/shop/public/orders/status?orderNumber=${encodeURIComponent(orderNumber)}&email=${encodeURIComponent(email!)}`
    const startedAt = Date.now()
    let cancelled = false
    let loaded = false
    let cleared = false
    let latest: OrderStatusResponse | null = null
    let timer: ReturnType<typeof setTimeout> | undefined

    // Attempted after every read rather than only the first. An order that had
    // not settled by the time this page opened settles a moment later, with the
    // shopper whose basket it is sitting right here watching it happen - and
    // before, nothing tried again, so they were thanked for an order they were
    // still carrying.
    async function tryClearBasket(body: OrderStatusResponse) {
      if (cleared) return
      const didClear = await clearPlacedOrderState(placedOrderNumber, body.order.paymentStatus)
      if (cancelled || !didClear) return
      cleared = true
      setBasketCleared(true)
    }

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
      await tryClearBasket(body)
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

    load().then((body) => {
      if (cancelled || !body) return
      if (isSettling(body)) { setWatched(true); schedule() }
    })

    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [])

  if (error) {
    return (
      <>
        <style dangerouslySetInnerHTML={{ __html: ORDER_CONFIRMATION_CSS }} />
        <section className="soc">
          <div className="soc-note soc-note-bad" role="alert">
            <Icon>{ICON_ALERT}</Icon>
            <p>{error}</p>
          </div>
        </section>
      </>
    )
  }
  if (!data) return null

  const { order, items } = data
  const money = (amount: string | number) => formatMoney(amount, data.currencySymbol)
  const isManual = isManualPayment(data)
  const awaiting = order.paymentStatus === 'AWAITING_CONFIRMATION'
  const failed = order.paymentStatus === 'FAILED'
  const paid = order.paymentStatus === 'PAID'
  // Announced only to the shopper who sat here through the wait. Someone opening
  // the same link later just sees an ordinary confirmed order.
  const settledWhileWatching = watched && paid
  const name = greetingName(order.customerName, order.shippingAddress)

  // A payment that failed on the provider's side still lands here, because the
  // return route has nowhere else to send it. Thanking someone for an order that
  // was never paid for is the wrong thing to say - and neither is a manual
  // method, where the money has not moved yet and saying so plainly is the only
  // way the shopper knows they still have something to do.
  const hero = failed
    ? { mark: 'soc-mark-bad', icon: ICON_ALERT, title: 'Your payment didn’t go through' }
    : awaiting && isManual
      ? { mark: 'soc-mark-todo', icon: ICON_CLOCK, title: 'Order received' }
      : awaiting
        ? { mark: 'soc-mark-wait', icon: ICON_CLOCK, title: 'Payment on its way' }
        : { mark: 'soc-mark-ok', icon: ICON_TICK, title: name ? `Thanks, ${name}` : 'Thanks for your order' }

  const discount = Number(order.discountAmount)
  const shipping = Number(order.shippingAmount)
  const tax = Number(order.taxAmount)

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: ORDER_CONFIRMATION_CSS }} />
      <section className="soc">
        <header className="soc-hero">
          <div className={`soc-mark ${hero.mark}`}><Icon>{hero.icon}</Icon></div>
          <h1 className="soc-title">{hero.title}</h1>
          {/* The one sentence anyone actually reads. Where the confirmation is
              going matters more than the order number - a typo in the email
              address is the single most common reason a shopper thinks nothing
              happened, and this is the only moment they can still spot it. */}
          {!failed && (
            <p className="soc-sub">
              {isManual && awaiting
                ? <>We’ve got your order. There are payment details below - your confirmation is on its way to <strong>{order.customerEmail}</strong>.</>
                : <>A confirmation is on its way to <strong>{order.customerEmail}</strong>.</>}
            </p>
          )}
        </header>

        {/* Two different failures, and the difference is whether the basket is
            still there. Straight out of the bank it is, because nothing was
            cleared. Falling over after settling had begun means the basket went
            when the order looked good, so pointing at a checkout that is now empty
            would be the second unhelpful thing to happen in a row. */}
        {failed && (
          <div className="soc-note soc-note-bad" role="alert">
            <Icon>{ICON_ALERT}</Icon>
            <p>
              Your bank didn&apos;t complete the payment, so this order hasn&apos;t been placed and you haven&apos;t been charged.{' '}
              {basketCleared ? (
                <>Do start again from <Link href="/shop">the shop</Link> whenever you&apos;re ready - and sorry for the runaround.</>
              ) : (
                <>Your basket is still where you left it - <Link href="/shop/checkout">head back to checkout</Link> and try again,
                  with another payment method if you&apos;d rather.</>
              )}
            </p>
          </div>
        )}

        {/* "Awaiting confirmation" means two opposite things, so it must not read
            the same way twice. On a manual method the shopper still has to go and
            pay; on an automated one they already have, and all that is left is the
            wait. Saying "a few minutes" out loud stops the order looking stuck to
            someone refreshing the page. */}
        {awaiting && isManual && (
          <div className="soc-note soc-note-warn">
            <Icon>{ICON_CLOCK}</Icon>
            <div>
              <p>Your order is awaiting payment confirmation. We&apos;ll be in touch once it clears.</p>
              {data.instructions && <p className="soc-instructions">{data.instructions}</p>}
            </div>
          </div>
        )}
        {awaiting && !isManual && (
          <div className="soc-note soc-note-info" aria-live="polite">
            <Icon>{ICON_CLOCK}</Icon>
            <p>
              Your payment has gone through, thank you. Banks being banks, it usually takes a few minutes to clear -
              this page updates itself the moment it does, and your confirmation email follows then.
              Nothing further is needed from you in the meantime.
              {pollGaveUp && ' This one is taking longer than usual, which happens. Feel free to close the page: the email will still arrive.'}
            </p>
          </div>
        )}
        {settledWhileWatching && (
          <div className="soc-note soc-note-ok" aria-live="polite">
            <Icon>{ICON_TICK}</Icon>
            <p>That&apos;s the payment cleared - your order is now being processed, and the confirmation email is on its way.</p>
          </div>
        )}
        {/* Nothing here for a manual method that has already been cleared: the
            instructions are a job to go and do, and once the shop has marked the
            money as arrived the job is done. Leaving the bank details up reads as
            a second demand for a bill already paid. */}

        {/* Guest orders only, and only where the site actually takes
            registrations - the server has already made that call. Sits below the
            payment details and above the receipt: anything the shopper still has
            to do about their money comes first, and the offer is then in front of
            them rather than stranded under a long list of items. */}
        {data.accountPrompt && !failed && (
          <div className="soc-account">
            <h2>Keep track of this order</h2>
            <p>Create an account with {order.customerEmail} and this order joins it automatically. It takes about a minute.</p>
            <ul>
              <li>Track and revisit every order in one place</li>
              <li>Check out faster next time - your address is already there</li>
              <li>No password to remember: sign in from a link we email you</li>
            </ul>
            {/* The form itself, not a link to it. Sending someone who has just
                finished paying off to another page to fill in three boxes is
                how an offer worth about a minute of their time gets declined.
                Heading suppressed because the box already has one, and the
                verify-email destination is spelt out because the form can no
                longer work it out from the address bar. */}
            {data.accountPrompt.registrationMode ? (
              <RegisterForm
                registrationMode={data.accountPrompt.registrationMode}
                initialEmail={order.customerEmail}
                privacyPolicyUrl={data.accountPrompt.privacyPolicyUrl ?? undefined}
                collectUsername={data.accountPrompt.collectUsername}
                collectDisplayName={data.accountPrompt.collectDisplayName}
                verifyEmailUrl={data.accountPrompt.verifyEmailUrl}
                showHeading={false}
              />
            ) : (
              <div className="soc-actions">
                <a className="soc-btn soc-btn-primary" href={data.accountPrompt.registerUrl}>Create an account</a>
              </div>
            )}
          </div>
        )}

        <div className="soc-card">
          <div className="soc-card-head">
            <h2 className="soc-card-title">Order {order.orderNumber}</h2>
            <p className="soc-meta">
              {formatOrderDate(order.createdAt) && <span>{formatOrderDate(order.createdAt)}</span>}
              <span>{items.reduce((n, i) => n + i.quantity, 0)} item{items.reduce((n, i) => n + i.quantity, 0) === 1 ? '' : 's'}</span>
            </p>
          </div>

          <div className="soc-card-body">
            <ul className="soc-items">
              {/* Grouped lines (a product and its accessories) kept together,
                  from the group persisted on the order's own line meta. */}
              {sortLinesByGroup(items.map((item) => ({ ...item, group: item.lineMeta?.group ?? null }))).map((item, i) => (
                <li key={i} className="soc-item">
                  {item.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- product media is an absolute storage URL, not a build-time asset
                    <img className="soc-thumb" src={item.imageUrl} alt="" />
                  ) : (
                    <div className="soc-thumb soc-thumb-empty" aria-hidden="true"><Icon>{ICON_IMAGE}</Icon></div>
                  )}
                  <p className="soc-item-name">
                    {item.group?.role === 'attachment' && item.group.caption && (
                      <span className="soc-item-groupcap"><span aria-hidden="true">↳ </span>{item.group.caption}<br /></span>
                    )}
                    {item.productName}
                  </p>
                  {/* Unit price only where it tells you something a single line
                      doesn't already: on one of a thing, "£40 x 1" is noise. */}
                  <span className="soc-item-price">{money(item.total)}</span>
                  <p className="soc-item-qty">
                    {item.quantity > 1 ? `${money(item.unitPrice)} × ${item.quantity}` : 'Qty 1'}
                  </p>
                  {item.lineMeta?.fields?.length ? (
                    <ul className="soc-item-meta">
                      {item.lineMeta.fields.map((f, j) => (
                        <li key={j}>
                          <span>{f.label}:</span>{' '}
                          {f.href ? <a href={f.href} target="_blank" rel="noopener noreferrer">{f.value}</a> : f.value}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>

          <dl className="soc-totals">
            <div className="soc-row"><dt>Subtotal</dt><dd>{money(order.subtotal)}</dd></div>
            {discount > 0 && (
              <div className="soc-row soc-discount">
                <dt>Discount{order.couponCode ? <span className="soc-code"> ({order.couponCode})</span> : null}</dt>
                <dd>-{money(discount)}</dd>
              </div>
            )}
            {shipping > 0 && (
              <div className="soc-row">
                <dt>Delivery{order.shippingRateName ? <span className="soc-code"> ({order.shippingRateName})</span> : null}</dt>
                <dd>{money(shipping)}</dd>
              </div>
            )}
            {/* Free delivery is worth saying out loud - a row that isn't there
                reads as a charge nobody has told you about yet. */}
            {shipping === 0 && order.shippingRateName && (
              <div className="soc-row"><dt>Delivery <span className="soc-code">({order.shippingRateName})</span></dt><dd>Free</dd></div>
            )}
            {tax > 0 && (
              <div className="soc-row">
                <dt>VAT{order.taxMode === 'INCLUSIVE' ? ' (included)' : ''}</dt>
                <dd>{money(tax)}</dd>
              </div>
            )}
            <div className="soc-row soc-grand"><dt>Total</dt><dd>{money(order.total)}</dd></div>
          </dl>
        </div>

        <div className="soc-details">
          <div className="soc-detail">
            <h3>Delivery address</h3>
            <address>
              {addressLines(order.shippingAddress).map((line, i) => <div key={i}>{line}</div>)}
            </address>
          </div>
          {order.shippingRateName && (
            <div className="soc-detail">
              <h3>Delivery method</h3>
              <p>{order.shippingRateName}</p>
            </div>
          )}
          <div className="soc-detail">
            <h3>Payment</h3>
            <p>{order.paymentMethodLabel}</p>
            <p className="soc-dim">
              {paid ? 'Paid' : awaiting && isManual ? 'Awaiting your payment' : awaiting ? 'Clearing' : failed ? 'Not taken' : 'Pending'}
            </p>
          </div>
        </div>

        {!failed && (
          <div className="soc-actions">
            <Link className="soc-btn soc-btn-primary" href="/shop">Continue shopping</Link>
          </div>
        )}
      </section>
    </>
  )
}
