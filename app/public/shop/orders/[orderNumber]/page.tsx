import { redirect } from 'next/navigation'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import { TRACK_ORDER_PATH } from '@/modules/shop/lib/order-tracking'
import { OrderLookupClient } from '@/modules/shop/components/public/OrderLookupClient'

export const metadata = { title: 'Order status' }

// Deliberately NOT behind the shop gate: looking up an order already placed is
// post-purchase, and stays open while the shop is closed (see getShopGate in
// lib/access.ts).
export default async function ShopOrderStatusPage({ params }: { params: Promise<{ orderNumber: string }> }) {
  const { orderNumber } = await params

  // Everywhere else the shop asks for the delivery postcode, and this page asked
  // for the email address - so somebody who typed the postcode they had just
  // been told to use was met with "could not find an order". Where guest
  // tracking is on, hand them to the tracker, which asks the question the rest
  // of the shop does. The email form below stays for a shop with tracking off.
  const config = await getShopConfigCached()
  if (config.guestOrderTrackingEnabled) redirect(`${TRACK_ORDER_PATH}/${encodeURIComponent(orderNumber)}`)

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '2rem 1.5rem' }}>
      <h1 style={{ fontSize: '1.5rem' }}>Order status</h1>
      <OrderLookupClient orderNumber={orderNumber} />
    </div>
  )
}
