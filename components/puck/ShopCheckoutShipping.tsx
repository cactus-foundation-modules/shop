import { CheckoutShippingClient } from '@/modules/shop/components/public/CheckoutShippingClient'

// [ANCHOR] - core checkout step (shipping address + method).
export type ShopCheckoutShippingProps = Record<string, never>

// Registered as a SERVER component so Puck's RSC <Render> serialises only plain
// props (never its renderDropZone function bag, which a client-registered block
// chokes on). The interactive form is the CheckoutShippingClient island.
//
// Editor path renders in preview mode - the editor has no real basket, and the
// island hides itself when the basket is empty, so without the flag every
// checkout step would vanish from the layout editor.
export function ShopCheckoutShipping() {
  return <CheckoutShippingClient preview />
}

export const shopCheckoutShippingPuckComponent = {
  label: 'Shop: Checkout - Shipping [Anchor]',
  fields: {},
  defaultProps: {},
  permissions: { delete: false, duplicate: false },
  render: ShopCheckoutShipping,
}

// RSC half renders live: on the storefront the island stands down when the
// basket is empty, leaving the order-summary block's empty message on its own.
export function ShopCheckoutShippingRsc() {
  return <CheckoutShippingClient />
}

export const shopCheckoutShippingPuckRscComponent = {
  ...shopCheckoutShippingPuckComponent,
  render: ShopCheckoutShippingRsc,
}
