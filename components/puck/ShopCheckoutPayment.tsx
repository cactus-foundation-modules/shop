import { CheckoutPaymentClient } from '@/modules/shop/components/public/CheckoutPaymentClient'

// [ANCHOR] - core checkout step, payment fields non-removable.
export type ShopCheckoutPaymentProps = Record<string, never>

// Registered as a SERVER component so Puck's RSC <Render> serialises only plain
// props (never its renderDropZone function bag, which a client-registered block
// chokes on). The Stripe Elements form is the CheckoutPaymentClient island.
export function ShopCheckoutPayment() {
  return <CheckoutPaymentClient />
}

export const shopCheckoutPaymentPuckComponent = {
  label: 'Shop: Checkout - Payment [Anchor]',
  fields: {},
  defaultProps: {},
  permissions: { delete: false, duplicate: false },
  render: ShopCheckoutPayment,
}

export const shopCheckoutPaymentPuckRscComponent = shopCheckoutPaymentPuckComponent
