'use client'

import { useEffect, useState } from 'react'
import { deliveryProgress } from '@/modules/shop/lib/delivery-slot'
import { Icon, ICON_VAN } from '@/modules/shop/components/public/OrderDetailChrome'

// The van on the progress rail, and the only thing on this page that moves.
//
// It slides between Dispatched and Complete as the booked window goes by, which
// is the one question somebody who is waiting in has: not "has it been sent",
// which they know, but "how much of my morning is left".
//
// A client component for one reason: the server renders the page once, and a
// van frozen where it stood when the page loaded is worse than no van at all -
// it says 11:15 at half past twelve. The first render uses the position the
// server worked out, so the markup matches; after that this ticks it on.
//
// The arithmetic is deliberately the SAME function the server called, taking the
// clock as an argument, so the two cannot drift apart in how they read a window.

export type DeliveryVanProps = {
  /** 'YYYY-MM-DD'. */
  date: string
  /** 'HH:MM', or null before the courier confirms a window. */
  slotStart: string | null
  slotEnd: string | null
  /** The shop's timezone, so the van moves on the customer's clock and not the
   *  server's. */
  timezone: string
  /** Where the server put it. Used for the first paint, so hydration matches. */
  initialProgress: number
}

/** How often the van is nudged along. A four-hour window is 240 minutes wide,
 *  so a minute is under half a percent of the rail - smooth enough to look
 *  alive, cheap enough to leave running on a tab somebody forgot about. */
const TICK_MS = 60_000

export function DeliveryVanDot({ date, slotStart, slotEnd, timezone, initialProgress }: DeliveryVanProps) {
  const [progress, setProgress] = useState(initialProgress)

  useEffect(() => {
    const update = () => {
      const next = deliveryProgress({ date, slotStart, slotEnd, now: new Date(), timezone })
      if (next) setProgress(next.progress)
    }
    update()
    const timer = setInterval(update, TICK_MS)
    return () => clearInterval(timer)
  }, [date, slotStart, slotEnd, timezone])

  return (
    <span className="sod-van-track">
      <span className="sod-dot sod-van" style={{ left: `${Math.round(progress * 100)}%` }}>
        <Icon>{ICON_VAN}</Icon>
      </span>
    </span>
  )
}
