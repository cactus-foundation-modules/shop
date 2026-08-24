// Who is paying, in the shape a module's card fields and wallet buttons are
// given it in. Built from the checkout state rather than from the order,
// because both exist before the order does - a card SDK needs a name and an
// address to send with its 3D Secure request, and a bank given neither declines
// a perfectly good card for no reason the shopper can see.
//
// Shared by the payment block and the review block: the wallet buttons sit
// above "Place order" (a different Puck block from the card fields entirely)
// and need the same person described the same way.
//
// The blank optionals are dropped rather than sent as empty strings: "county:
// ''" is a claim that the address has no county, and some verification services
// treat it as one.
import type { ShopCheckoutPayer } from '@/modules/shop/components/public/checkout-payment-fields'
import type { CheckoutState } from '@/modules/shop/components/public/checkout-state'

export function payerFromState(state: CheckoutState): ShopCheckoutPayer {
  const a = state.shippingAddress
  return {
    email: state.customerEmail,
    name: state.customerName,
    address: {
      firstName: a.firstName,
      lastName: a.lastName,
      line1: a.line1,
      ...(a.line2 ? { line2: a.line2 } : {}),
      city: a.city,
      ...(a.county ? { county: a.county } : {}),
      postcode: a.postcode,
      country: a.country || 'GB',
      ...(a.phone ? { phone: a.phone } : {}),
    },
  }
}
