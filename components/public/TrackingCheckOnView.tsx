'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

// Asks the courier about one parcel as the order page opens, and re-renders the
// page if they had anything to say. Draws nothing: the page is already showing
// the last thing the shop knew, and replaces it with the new thing in place.
//
// Once per mount. Anything more frequent is the live map's job, and the server
// throttles per parcel regardless - see the tracking-check route.
export function TrackingCheckOnView({ orderId, shipmentId }: { orderId: string; shipmentId: string }) {
  const router = useRouter()
  // React runs effects twice in development; one question to the courier is
  // the whole point of this component.
  const asked = useRef(false)

  useEffect(() => {
    if (asked.current) return
    asked.current = true
    fetch(
      `/api/m/shop/public/orders/${encodeURIComponent(orderId)}/tracking-check?shipment=${encodeURIComponent(shipmentId)}`,
      { method: 'POST' },
    )
      .then((res) => (res.ok ? res.json() : null))
      .then((body: { refresh?: boolean } | null) => {
        if (body?.refresh) router.refresh()
      })
      // A courier that cannot be reached leaves the page showing what it
      // already had, which is exactly what it showed before it asked.
      .catch(() => {})
  }, [orderId, shipmentId, router])

  return null
}
