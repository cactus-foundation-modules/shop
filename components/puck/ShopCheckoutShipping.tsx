import { CheckoutShippingClient } from '@/modules/shop/components/public/CheckoutShippingClient'

// [ANCHOR] - core checkout step (shipping address + method).
export type ShopCheckoutShippingProps = Record<string, never>

// Registered as a SERVER component so Puck's RSC <Render> serialises only plain
// props (never its renderDropZone function bag, which a client-registered block
// chokes on). The interactive form is the CheckoutShippingClient island.
export function ShopCheckoutShipping() {
  return <CheckoutShippingClient />
}

export const shopCheckoutShippingPuckComponent = {
  label: 'Shop: Checkout - Shipping [Anchor]',
  fields: {},
  defaultProps: {},
  permissions: { delete: false, duplicate: false },
  render: ShopCheckoutShipping,
}

export const shopCheckoutShippingPuckRscComponent = shopCheckoutShippingPuckComponent
