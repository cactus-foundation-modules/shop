import { CheckoutPaymentClient } from '@/modules/shop/components/public/CheckoutPaymentClient'

// [ANCHOR] - core checkout step, payment fields non-removable.
// Wording only; absent props = the historical strings (pre-settings layouts).
export type ShopCheckoutPaymentProps = { heading?: string }

// Registered as a SERVER component so Puck's RSC <Render> serialises only plain
// props (never its renderDropZone function bag, which a client-registered block
// chokes on). The Stripe Elements form is the CheckoutPaymentClient island.
//
// Editor path renders in preview mode - the editor has no real basket, and the
// island hides itself when the basket is empty, so without the flag every
// checkout step would vanish from the layout editor.
export function ShopCheckoutPayment(props: ShopCheckoutPaymentProps) {
  return <CheckoutPaymentClient preview heading={props.heading} />
}

export const shopCheckoutPaymentPuckComponent = {
  label: 'Shop: Checkout - Payment [Anchor]',
  fields: {
    heading: { type: 'text' as const, label: 'Heading' },
  },
  defaultProps: { heading: 'Payment method' },
  permissions: { delete: false, duplicate: false },
  render: ShopCheckoutPayment,
}

// RSC half renders live: on the storefront the island stands down when the
// basket is empty, leaving the order-summary block's empty message on its own.
// Explicit props only across the client boundary - never a spread of the puck bag.
export function ShopCheckoutPaymentRsc(props: ShopCheckoutPaymentProps) {
  return <CheckoutPaymentClient heading={props.heading} />
}

export const shopCheckoutPaymentPuckRscComponent = {
  ...shopCheckoutPaymentPuckComponent,
  render: ShopCheckoutPaymentRsc,
}
