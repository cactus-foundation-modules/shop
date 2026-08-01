import { CheckoutPaymentClient } from '@/modules/shop/components/public/CheckoutPaymentClient'

// [ANCHOR] - core checkout step, payment fields non-removable.
export type ShopCheckoutPaymentProps = Record<string, never>

// Registered as a SERVER component so Puck's RSC <Render> serialises only plain
// props (never its renderDropZone function bag, which a client-registered block
// chokes on). The Stripe Elements form is the CheckoutPaymentClient island.
//
// Editor path renders in preview mode - the editor has no real basket, and the
// island hides itself when the basket is empty, so without the flag every
// checkout step would vanish from the layout editor.
export function ShopCheckoutPayment() {
  return <CheckoutPaymentClient preview />
}

export const shopCheckoutPaymentPuckComponent = {
  label: 'Shop: Checkout - Payment [Anchor]',
  fields: {},
  defaultProps: {},
  permissions: { delete: false, duplicate: false },
  render: ShopCheckoutPayment,
}

// RSC half renders live: on the storefront the island stands down when the
// basket is empty, leaving the order-summary block's empty message on its own.
export function ShopCheckoutPaymentRsc() {
  return <CheckoutPaymentClient />
}

export const shopCheckoutPaymentPuckRscComponent = {
  ...shopCheckoutPaymentPuckComponent,
  render: ShopCheckoutPaymentRsc,
}
