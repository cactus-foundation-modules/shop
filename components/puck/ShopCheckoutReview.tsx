import { CheckoutReviewClient } from '@/modules/shop/components/public/CheckoutReviewClient'

// [ANCHOR] - core checkout step (order review + place order).
export type ShopCheckoutReviewProps = Record<string, never>

// Registered as a SERVER component so Puck's RSC <Render> serialises only plain
// props (never its renderDropZone function bag, which a client-registered block
// chokes on). The order summary + place-order button is the CheckoutReviewClient island.
//
// Editor path renders in preview mode - the editor has no real basket, and the
// island hides itself when the basket is empty, so without the flag every
// checkout step would vanish from the layout editor.
export function ShopCheckoutReview() {
  return <CheckoutReviewClient preview />
}

export const shopCheckoutReviewPuckComponent = {
  label: 'Shop: Checkout - Review [Anchor]',
  fields: {},
  defaultProps: {},
  permissions: { delete: false, duplicate: false },
  render: ShopCheckoutReview,
}

// RSC half renders live: on the storefront the island stands down when the
// basket is empty, leaving the order-summary block's empty message on its own.
export function ShopCheckoutReviewRsc() {
  return <CheckoutReviewClient />
}

export const shopCheckoutReviewPuckRscComponent = {
  ...shopCheckoutReviewPuckComponent,
  render: ShopCheckoutReviewRsc,
}
