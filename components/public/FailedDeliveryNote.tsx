import type { DeliveryRearrange } from '@/modules/shop/lib/order-delivery'
import { OrderNote } from '@/modules/shop/components/public/OrderDetailChrome'

// What a customer is told when the courier tried and could not deliver.
//
// Two versions, and staff pick between them from the order screen:
//
//   - the customer books the new day themselves, so they are given every way
//     the courier can be reached and the one number the courier will ask for;
//   - the shop has already spoken to the courier and the courier will ring
//     them, so they are told to wait. Two people chasing one depot about one
//     wardrobe helps nobody, least of all the depot.
//
// The courier's own reason for the failure is deliberately not repeated here.
// Their wording is written for drivers - "Non Fault - RECIPIENT NOT HOME" - and
// reads as an accusation to somebody who was, as it happens, in the garden.

export function FailedDeliveryNote({ rearrange, trackingNumber }: {
  rearrange: DeliveryRearrange
  trackingNumber: string | null
}) {
  const courier = rearrange.courierName || 'the courier'
  const number = trackingNumber?.trim() || ''

  if (rearrange.courierWillContact) {
    return (
      <OrderNote tone="warn">
        <p><strong>Delivery was not possible</strong></p>
        <p>
          {courier} could not deliver this parcel. They are arranging a new delivery day and will
          be in touch with you directly, so there is nothing you need to do for now.
        </p>
        {number && (
          <p>If you need to speak to them in the meantime, your tracking number is <strong>{number}</strong>.</p>
        )}
      </OrderNote>
    )
  }

  const phoneHref = rearrange.phone ? `tel:${rearrange.phone.replace(/[^\d+]/g, '')}` : ''

  return (
    <OrderNote tone="warn">
      <p><strong>Delivery was not possible</strong></p>
      <p>
        {courier} could not deliver this parcel. Please get in touch with them to arrange a new
        delivery day
        {rearrange.chatUrl && rearrange.phone ? (
          <>
            , either by{' '}
            <a href={rearrange.chatUrl} target="_blank" rel="noopener noreferrer">live chat on their website</a>
            {' '}or by calling <a href={phoneHref}>{rearrange.phone}</a>.
          </>
        ) : rearrange.chatUrl ? (
          <>
            {' '}by{' '}
            <a href={rearrange.chatUrl} target="_blank" rel="noopener noreferrer">live chat on their website</a>.
          </>
        ) : rearrange.phone ? (
          <>
            {' '}by calling <a href={phoneHref}>{rearrange.phone}</a>.
          </>
        ) : '.'}
      </p>
      {number && (
        <p>They will ask for your tracking number, which is <strong>{number}</strong>.</p>
      )}
    </OrderNote>
  )
}
