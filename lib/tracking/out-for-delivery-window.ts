// A parcel on the van today, carrying a window for a later day.
//
// Palletways' status table names the day a pallet is "currently due" and does
// not move it when the delivering depot puts the pallet on an earlier lorry:
// their own page will say OUT FOR DELIVERY and "due tomorrow" in the same row,
// all afternoon. Stored as read, that later day outranks a day staff typed in
// and the order page tells everybody tomorrow while the driver is on the road.
//
// Out for delivery means today. So a window dated after today, on a parcel the
// courier says is out, is moved to today at the same times - "by 5pm" stays
// "by 5pm", only the day changes. A window for today or earlier is left alone:
// today's is right, and an earlier one is the courier's business to correct.

import { calendarDateIn } from '@/lib/config/timezone'
import { courierInstant } from '@/modules/shop/lib/tracking/courier-clock'
import { slotTimeFromInstant } from '@/modules/shop/lib/delivery-slot'

export type CarrierWindow = { windowFrom: Date | null; windowTo: Date | null }

export function windowForParcelOutToday(
  window: CarrierWindow,
  outForDelivery: boolean,
  now: Date,
  timezone: string,
): CarrierWindow {
  if (!outForDelivery || !window.windowFrom || !window.windowTo) return window
  const today = calendarDateIn(now, timezone)
  if (calendarDateIn(window.windowFrom, timezone) <= today) return window
  const windowFrom = courierInstant(`${today}T${slotTimeFromInstant(window.windowFrom, timezone)}:00`, timezone)
  const windowTo = courierInstant(`${today}T${slotTimeFromInstant(window.windowTo, timezone)}:00`, timezone)
  return windowFrom && windowTo ? { windowFrom, windowTo } : window
}
