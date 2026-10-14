import type { ShpConfig } from '@/modules/shop/lib/config'
import { courierForShipment } from '@/modules/shop/lib/courier-faqs'

// Couriers whose tracking page shows a time that is not the time.
//
// AIT Home Delivery put a HOLDING window on their tracking page as soon as a
// day is booked - a couple of hours somewhere in the morning, worked out by
// nobody - and only fix the real one the evening before, when they email it
// (order DW000219: the page said 07:48-09:48, the email that evening said
// 08:06-10:06, and the customer had been told the first). Their day is real;
// their times are not, until that email.
//
// So for these couriers the times read off the tracking page are shown to the
// shop and the customer's page as they are, but never emailed. A window
// reaches the customer's inbox only once it is on the parcel itself: typed in
// on the order screen, or read out of the courier's own email
// (lib/ait-window-inbound.ts).

/** The tracking sources whose reported times are a placeholder until emailed. */
const PROVISIONAL_TIMES: ReadonlySet<string> = new Set(['ait'])

/** Whether a courier reading from this source reports times worth emailing. */
export function courierTimesEmailable(trackingSource: string | null | undefined): boolean {
  return !PROVISIONAL_TIMES.has(trackingSource ?? '')
}

/** The same, for a parcel: judged by the courier it is on. */
export function parcelCourierTimesEmailable(
  config: Pick<ShpConfig, 'deliveryCouriers'>,
  parcel: { courierId: string | null; carrier: string | null },
): boolean {
  return courierTimesEmailable(courierForShipment(config, parcel)?.trackingSource)
}
