// Contract for the 'shop.checkout-payment-fields' extension point. A payment
// module registers a client component under the id of its own payment method
// (`square-payments` registers `SQUARE`, say), and shop mounts it under the
// method's radio button once that method is chosen and its intent is ready.
//
// This is what lets a payment be taken WITHOUT sending the shopper to the
// provider's own site: the provider's SDK draws its card fields (in its own
// iframes, so card data still never reaches this site), and hands back a
// one-time token that shop posts to /checkout/confirm for the provider's own
// `confirmPayment` to charge. Nothing here ever sees a card number, and nothing
// on the client is trusted to say a payment succeeded - the server still asks
// the provider.
//
// Shop deliberately knows nothing about what any of it means. Whatever the
// provider's `createIntent` put in `clientFields` arrives here as `config`, and
// whatever `submit()` returns goes to the confirm route as the payload.
//
// That extends to the copy: shop draws no reassurance line of its own under
// these fields, because "your card details never touch this site" under a list
// of banks is a promise about a card nobody was asked for. A component that
// collects card details says so itself, where the claim is true.
import type { ShpAddress } from '@/modules/shop/lib/types'

// Who is paying, as the checkout has them. Handed over because a card SDK needs
// it for 3D Secure / Strong Customer Authentication - the bank wants a name and
// an address with the verification request, and refusing to supply one is how a
// live card ends up declined for no visible reason.
export type ShopCheckoutPayer = {
  email: string
  name: string
  address: ShpAddress
}

export type ShopCheckoutPaymentFieldsProps = {
  // The `clientFields` from this method's payment intent, verbatim. The provider
  // decides what goes in it (a publishable key, the amount to authorise, which
  // of its environments it is in); shop only relays it.
  config: Record<string, unknown>
  payer: ShopCheckoutPayer
  // Puts a message on the checkout's own error line, or clears it with null.
  // Used for anything the shopper needs to see that is not a failed submit -
  // an SDK that would not load, say.
  onError: (message: string | null) => void
  // Hands shop the function "Place order" calls, or null to withdraw it. It
  // returns the payload for the confirm route; throwing from it stops the order
  // and shows the thrown message, so the message has to be one a shopper can
  // read ("Enter your card details", not "sourceId undefined").
  //
  // Called on mount and on unmount - a component that never registers one
  // simply has "Place order" confirm with an empty payload, which is what a
  // method with nothing to fill in wants anyway.
  //
  // **It is handed the config again as an argument, and that argument is the
  // one to trust** - not the `config` prop this component last rendered with.
  // "Place order" creates the payment intent and then calls submit in the same
  // breath, without waiting for React to re-render, so the registered function
  // is very often still the one from before the intent existed and its closure
  // still has the half of the config that has no amount in it. Square answers a
  // verification request with no amount with "One or more of the arguments
  // needed are missing or invalid", which is a puzzling thing for a shopper to
  // be shown about a card they filled in correctly.
  registerSubmit: (submit: ((config: Record<string, unknown>) => Promise<unknown>) | null) => void
}
