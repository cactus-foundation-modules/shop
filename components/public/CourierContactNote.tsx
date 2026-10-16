import type { CourierContact } from '@/modules/shop/lib/courier-contact'
import { dialable } from '@/modules/shop/lib/courier-contact'
import { OrderNote } from '@/modules/shop/components/public/OrderDetailChrome'

// What a customer is told when the courier will not book the delivery for them
// and they have to get in touch themselves (migration 073). Staff set it per
// parcel; the courier's phone and chat come from the courier's own settings,
// and the tracking number is the one thing the courier will ask for.
//
// Whichever ways of reaching the courier the shop has are listed, and none is
// invented: a courier with no phone number simply gets the chat link, and one
// with neither is still told to get in touch, with the tracking number.

export function CourierContactNote({ contact }: { contact: CourierContact }) {
  const courier = contact.courierName || 'the courier'

  return (
    <OrderNote tone="warn">
      <p><strong>Please contact {courier} to arrange delivery</strong></p>
      <p>
        {courier} need you to get in touch to agree a delivery day. They will not book one
        for you, so it is worth doing soon.
      </p>
      {contact.chatUrl && (
        <p>
          <a href={contact.chatUrl} target="_blank" rel="noopener noreferrer">Chat to {courier} online</a>
        </p>
      )}
      {contact.phone && (
        <p>
          Call {courier} on <a href={`tel:${dialable(contact.phone)}`}>{contact.phone}</a>
        </p>
      )}
      {contact.trackingNumber && (
        <p>Your tracking number is <strong>{contact.trackingNumber}</strong>, which they will ask for.</p>
      )}
    </OrderNote>
  )
}
