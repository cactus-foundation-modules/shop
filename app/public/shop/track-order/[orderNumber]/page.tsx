import { notFound, redirect } from 'next/navigation'
import { getShopGate } from '@/modules/shop/lib/access'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import { ShopClosedNotice, ShopStaffPreviewBanner } from '@/modules/shop/components/public/ShopClosedNotice'
import { getOrderByNumber } from '@/modules/shop/lib/db/orders'
import { resolveOrderViewer } from '@/modules/shop/lib/order-viewer'
import { orderTrackingBasePath, verifyOrderTrackingToken } from '@/modules/shop/lib/order-tracking'
import OrderAccessForm from '@/modules/shop/components/public/OrderAccessForm'
import { TRACK_ORDER_CSS } from '@/modules/shop/components/public/track-order-css'
import { TrackOrderPageView } from '@/modules/shop/app/public/shop/track-order/page'

export const metadata = { title: 'Track your order' }
export const dynamic = 'force-dynamic'

// Where the link in every order email lands.
//
// It decides what to do when it is CLICKED, not when it was sent - see
// lib/order-tracking.ts for why that distinction is the whole design. Three
// outcomes, in order of how much the visitor has already proved:
//
//   already allowed  - a signed-in owner, or a browser that proved this order's
//                      postcode earlier. Straight through to the order page,
//                      which is what "keep track of your order" promised.
//   genuine link     - the token checks out, so we may say which order this is
//                      and ask only for the postcode.
//   anything else    - the ordinary tracker with the number filled in. A link
//                      that has been retyped, truncated by a mail client or
//                      pasted without its token still gets somebody where they
//                      were going; it just does not confirm anything first.
//
// The token is never a way IN on its own. These emails get forwarded - to a
// partner, to an accounts department, to whoever presses the button at the bank
// - and a link that opened the order for whoever held it would hand all of them
// a delivery address and the run of the invoice.

export default async function ShopTrackOrderNumberPage({
  params,
  searchParams,
}: {
  params: Promise<{ orderNumber: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const gate = await getShopGate()
  if (gate.blocked) return <ShopClosedNotice message={gate.message} />

  const config = await getShopConfigCached()
  if (!config.guestOrderTrackingEnabled) notFound()

  const { orderNumber } = await params
  const query = await searchParams
  const rawToken = query.t
  const token = Array.isArray(rawToken) ? rawToken[0] : rawToken

  // Only looked up on a link we actually issued. Without that check this page
  // would answer "does order DW000173 exist?" for anyone willing to count.
  const order = verifyOrderTrackingToken(orderNumber, token) ? await getOrderByNumber(orderNumber) : null

  if (order) {
    const viewer = await resolveOrderViewer(order)
    if (viewer) redirect(`/shop/account/orders/${order.id}`)
  }

  // No genuine order behind the link: hand them the ordinary form with what
  // they arrived with typed in, rather than a dead end that says nothing.
  if (!order) return TrackOrderPageView({ orderNumber })

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '2rem 1.5rem' }}>
      <style dangerouslySetInnerHTML={{ __html: TRACK_ORDER_CSS }} />
      {gate.staffPreview && <ShopStaffPreviewBanner />}

      <div className="sot">
        <header className="sot-head">
          <h1 className="sot-title">Order {order.orderNumber}</h1>
          <p className="sot-lede">
            One quick check that it is you: give us the postcode this order is being delivered to and
            we will show you everything about it.
          </p>
        </header>

        <div className="sot-card">
          <OrderAccessForm mode="confirm" orderNumber={order.orderNumber} orderId={order.id} />
        </div>

        <p className="sot-hint">
          Not the right order? <a href={orderTrackingBasePath(config)}>Look up a different one</a>.
        </p>
      </div>
    </div>
  )
}
