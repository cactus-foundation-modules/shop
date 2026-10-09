import type { DeliveryDelayNote } from '@/modules/shop/lib/order-delivery'
import { OrderNote } from '@/modules/shop/components/public/OrderDetailChrome'

// What a customer is told when the shop has reported their delivery is late.
// See lib/delivery-delay.ts.
//
//   today      running late, still trying today - with the day and window it
//              is still aiming for, and what happens if it cannot make it;
//   rebooking  delayed, and the new day will follow. No day at all: the one
//              still on the parcel is the one that is not happening.
//
// Staff's own sentence, where they gave one, goes underneath.

export function DelayedDeliveryNote({ delay, day, window }: {
  delay: DeliveryDelayNote
  day: string
  window: string
}) {
  if (delay.kind === 'today') {
    return (
      <OrderNote tone="warn">
        <p><strong>Running late</strong></p>
        <p>
          Sorry - this delivery is running late{day === 'today' && window ? ` (it was due ${window})` : ''}.
          We are still trying to get it to you today. If we cannot make it today, we will be in
          touch with a new delivery date.
        </p>
        {delay.note && <p>{delay.note}</p>}
      </OrderNote>
    )
  }

  return (
    <OrderNote tone="warn">
      <p><strong>Delivery delayed</strong></p>
      <p>
        Sorry - this delivery has been delayed. We do not have a new date yet, and will let
        you know as soon as we do. There is nothing you need to do in the meantime.
      </p>
      {delay.note && <p>{delay.note}</p>}
    </OrderNote>
  )
}
