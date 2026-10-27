'use client'

import { useEffect, useState } from 'react'
import DeliveryLiveMap, { type LiveDeliveryState } from '@/modules/shop/components/public/DeliveryLiveMap'
import { DELIVERY_LIVE_MAP_CSS } from '@/modules/shop/components/public/order-detail-css'

// The customer's van map, on the shop's own order screen.
//
// The customer's page renders with the stored position already in it; this
// screen is a client app fed by the dispatch GET, so it asks the staff route
// once on opening and hands the answer to the same map, which carries on
// asking on its own tick. The route says when there is nothing to show - not
// out for delivery, a courier the shop does not follow - and then this draws
// nothing at all.

type Props = { orderId: string; shipmentId: string }

export function AdminLiveDelivery({ orderId, shipmentId }: Props) {
  const endpoint = `/api/m/shop/admin/orders/${encodeURIComponent(orderId)}/live-delivery`
  const [initial, setInitial] = useState<LiveDeliveryState | null>(null)

  useEffect(() => {
    let cancelled = false
    void fetch(`${endpoint}?shipment=${encodeURIComponent(shipmentId)}`, { cache: 'no-store' })
      .then((res) => (res.ok ? (res.json() as Promise<LiveDeliveryState>) : null))
      .catch(() => null)
      .then((state) => {
        if (!cancelled && state) setInitial(state)
      })
    return () => {
      cancelled = true
    }
  }, [endpoint, shipmentId])

  // `live` false is the route saying there is no van to follow. A delivery
  // that has just landed is the dispatch GET's to show, not this panel's.
  if (!initial?.live || initial.refreshPage) return null

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: DELIVERY_LIVE_MAP_CSS }} />
      <DeliveryLiveMap orderId={orderId} shipmentId={shipmentId} initial={initial} endpoint={endpoint} />
    </>
  )
}
