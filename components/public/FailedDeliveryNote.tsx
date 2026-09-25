import type { DeliveryRearrange } from '@/modules/shop/lib/order-delivery'
import { OrderNote } from '@/modules/shop/components/public/OrderDetailChrome'

// What a customer is told when the courier tried and could not deliver.
//
// Two versions, picked by the courier's "who books the new day" setting, or by
// staff on the order screen for one parcel:
//
//   - the customer books the new day themselves, so they are given every way
//     the courier can be reached and the one number the courier will ask for;
//   - the courier will be in touch, so they are told to wait - with the same
//     ways to reach the courier underneath for anyone who would rather not.
//     Two people chasing one depot about one wardrobe helps nobody, least of
//     all the depot, so waiting is what the note leads with.
//
// The courier's own reason is only given where the courier's settings say so.
// Their wording is written for drivers - "Non Fault - RECIPIENT NOT HOME" - so
// it is tidied first (failedReason), and even tidied it can read as an
// accusation to somebody who was, as it happens, in the garden.

export function FailedDeliveryNote({ rearrange, trackingNumber }: {
  rearrange: DeliveryRearrange
  trackingNumber: string | null
}) {
  const courier = rearrange.courierName || 'the courier'
  const number = trackingNumber?.trim() || ''

  const phoneHref = rearrange.phone ? `tel:${rearrange.phone.replace(/[^\d+]/g, '')}` : ''

  if (rearrange.courierWillContact) {
    return (
      <OrderNote tone="warn">
        <p><strong>Delivery was not possible</strong></p>
        {rearrange.reason && <p>Reason given by {courier}: {rearrange.reason}</p>}
        <p>
          {courier} could not deliver this parcel. They are arranging a new delivery day and will
          be in touch with you directly, so there is nothing you need to do for now.
        </p>
        {(rearrange.chatUrl || rearrange.phone) && (
          <p>
            If you would rather speak to them yourself in the meantime, you can reach them
            {rearrange.chatUrl && rearrange.phone ? (
              <>
                {' '}by{' '}
                <a href={rearrange.chatUrl} target="_blank" rel="noopener noreferrer">live chat on their website</a>
                {' '}or by calling <a href={phoneHref}>{rearrange.phone}</a>.
              </>
            ) : rearrange.chatUrl ? (
              <>
                {' '}by{' '}
                <a href={rearrange.chatUrl} target="_blank" rel="noopener noreferrer">live chat on their website</a>.
              </>
            ) : (
              <>
                {' '}by calling <a href={phoneHref}>{rearrange.phone}</a>.
              </>
            )}
          </p>
        )}
        {number && (
          <p>Your tracking number is <strong>{number}</strong>, which they will ask for if you get in touch.</p>
        )}
      </OrderNote>
    )
  }

  return (
    <OrderNote tone="warn">
      <p><strong>Delivery was not possible</strong></p>
      {rearrange.reason && <p>Reason given by {courier}: {rearrange.reason}</p>}
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
