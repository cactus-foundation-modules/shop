import { CheckoutContactClient } from '@/modules/shop/components/public/CheckoutContactClient'

// [ANCHOR] - core checkout step, non-removable core fields (email/name).
export type ShopCheckoutContactProps = Record<string, never>

// Registered as a SERVER component so Puck's RSC <Render> serialises only plain
// props (never its renderDropZone function bag, which a client-registered block
// chokes on). The interactive form is the CheckoutContactClient island.
//
// Editor path renders in preview mode - the editor has no real basket, and the
// island hides itself when the basket is empty, so without the flag every
// checkout step would vanish from the layout editor.
export function ShopCheckoutContact() {
  return <CheckoutContactClient preview />
}

export const shopCheckoutContactPuckComponent = {
  label: 'Shop: Checkout - Contact [Anchor]',
  fields: {},
  defaultProps: {},
  permissions: { delete: false, duplicate: false },
  render: ShopCheckoutContact,
}

// RSC half renders live: on the storefront the island stands down when the
// basket is empty, leaving the order-summary block's empty message on its own.
export function ShopCheckoutContactRsc() {
  return <CheckoutContactClient />
}

export const shopCheckoutContactPuckRscComponent = {
  ...shopCheckoutContactPuckComponent,
  render: ShopCheckoutContactRsc,
}
