// Contract for the 'shop.checkout-wallet-buttons' extension point. A payment
// module registers a client component under the id of its own payment method
// (`square-payment-for-shop` registers `SQUARE`), and the review step mounts it
// directly above "Place order" once that method is the one chosen.
//
// This is what puts Apple Pay and Google Pay on the shop's own checkout. Those
// buttons cannot be drawn from the payment-fields slot (see
// checkout-payment-fields.ts) for two reasons, both of them hard:
//
//  1. A wallet has to be told the total BEFORE it is clicked - the sheet the
//     shopper approves shows the amount - and there is no payment intent that
//     early. The review block is the one place that already knows the total, so
//     the amount is handed over from there.
//  2. Apple Pay refuses to open its sheet unless tokenize() is called inside the
//     button's own click handler, with nothing awaited in between. The normal
//     path (press "Place order", create the order, create the intent, then ask
//     the module for a payload) has two awaits in the middle of it, so a wallet
//     has to run the other way round: tokenize first, then hand the token over
//     and let the order be placed with it.
//
// So the flow is inverted, and that inversion is the whole of this contract. The
// component tokenises on click and calls `placeOrder(payload)`; shop then does
// exactly what "Place order" does - creates the order, creates the intent, and
// posts the payload to the confirm route for the provider's own confirmPayment
// to charge. Nothing here ever sees a card number, and nothing on the client is
// trusted to say a payment succeeded: the server re-checks the amount and the
// currency against the order and asks the provider what actually happened.
import type { ShopCheckoutPayer } from '@/modules/shop/components/public/checkout-payment-fields'

export type ShopCheckoutWalletButtonsProps = {
  // The method's publishable, order-independent config, exactly as the
  // provider's `getClientFields` returned it (the same object the payment
  // fields get before an intent exists). Shop only relays it.
  config: Record<string, unknown>
  // Who is paying, read at CALL time rather than handed over as a prop. A
  // wallet needs the billing contact only at the moment it is clicked, and the
  // address above it is still being typed into until then - a prop would either
  // be stale or re-render these buttons on every keystroke, and rebuilding a
  // Google Pay button under a shopper's finger is its own bug.
  getPayer: () => ShopCheckoutPayer
  // The order total and its ISO currency code, as the checkout session has
  // them. The wallet sheet quotes this figure, so it is the shop's own total
  // and never anything worked out in the browser.
  //
  // It is NOT what gets charged: the charge is made against the order the
  // server creates, and the provider re-checks the two agree. A basket that
  // changed between the sheet opening and the payment landing fails cleanly
  // rather than taking the wrong amount.
  amount: number
  currency: string
  // True while anything is still holding "Place order" shut, and while an order
  // is being placed. A wallet button is enabled exactly when that button is:
  // paying by Apple Pay must not skip the terms tickbox or an unfinished
  // address any more than paying by card does.
  disabled: boolean
  // Puts a message on the review step's own error line, or clears it with null.
  onError: (message: string | null) => void
  // "The shopper has approved a payment - place the order with this." Whatever
  // is passed goes to the confirm route as the payload, untouched, in place of
  // whatever the method's on-page fields would have produced.
  placeOrder: (payload: unknown) => void
}
