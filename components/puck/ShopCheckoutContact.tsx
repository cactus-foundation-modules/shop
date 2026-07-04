import { CheckoutContactClient } from '@/modules/shop/components/public/CheckoutContactClient'

// [ANCHOR] - core checkout step, non-removable core fields (email/name).
export type ShopCheckoutContactProps = Record<string, never>

// Registered as a SERVER component so Puck's RSC <Render> serialises only plain
// props (never its renderDropZone function bag, which a client-registered block
// chokes on). The interactive form is the CheckoutContactClient island.
export function ShopCheckoutContact() {
  return <CheckoutContactClient />
}

export const shopCheckoutContactPuckComponent = {
  label: 'Shop: Checkout - Contact [Anchor]',
  fields: {},
  defaultProps: {},
  permissions: { delete: false, duplicate: false },
  render: ShopCheckoutContact,
}

export const shopCheckoutContactPuckRscComponent = shopCheckoutContactPuckComponent
