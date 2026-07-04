import { CheckoutReviewClient } from '@/modules/shop/components/public/CheckoutReviewClient'

// [ANCHOR] - core checkout step (order review + place order).
export type ShopCheckoutReviewProps = Record<string, never>

// Registered as a SERVER component so Puck's RSC <Render> serialises only plain
// props (never its renderDropZone function bag, which a client-registered block
// chokes on). The order summary + place-order button is the CheckoutReviewClient island.
export function ShopCheckoutReview() {
  return <CheckoutReviewClient />
}

export const shopCheckoutReviewPuckComponent = {
  label: 'Shop: Checkout - Review [Anchor]',
  fields: {},
  defaultProps: {},
  permissions: { delete: false, duplicate: false },
  render: ShopCheckoutReview,
}

export const shopCheckoutReviewPuckRscComponent = shopCheckoutReviewPuckComponent
