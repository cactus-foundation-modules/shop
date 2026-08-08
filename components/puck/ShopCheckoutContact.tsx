import { CheckoutContactClient } from '@/modules/shop/components/public/CheckoutContactClient'

// [ANCHOR] - core checkout step, non-removable core fields (email/name).
// Wording only - the fields themselves are not configurable. A layout saved
// before these settings existed passes nothing, and the island falls back to
// the historical strings, so nothing changes until a setting is changed.
export type ShopCheckoutContactProps = { heading?: string }

// Registered as a SERVER component so Puck's RSC <Render> serialises only plain
// props (never its renderDropZone function bag, which a client-registered block
// chokes on). The interactive form is the CheckoutContactClient island.
//
// Editor path renders in preview mode - the editor has no real basket, and the
// island hides itself when the basket is empty, so without the flag every
// checkout step would vanish from the layout editor.
export function ShopCheckoutContact(props: ShopCheckoutContactProps) {
  return <CheckoutContactClient preview heading={props.heading} />
}

export const shopCheckoutContactPuckComponent = {
  label: 'Shop: Checkout - Contact [Anchor]',
  fields: {
    heading: { type: 'text' as const, label: 'Heading' },
  },
  defaultProps: { heading: 'Contact details' },
  permissions: { delete: false, duplicate: false },
  render: ShopCheckoutContact,
}

// RSC half renders live: on the storefront the island stands down when the
// basket is empty, leaving the order-summary block's empty message on its own.
// Explicit props only across the client boundary - never a spread of the puck bag.
export function ShopCheckoutContactRsc(props: ShopCheckoutContactProps) {
  return <CheckoutContactClient heading={props.heading} />
}

export const shopCheckoutContactPuckRscComponent = {
  ...shopCheckoutContactPuckComponent,
  render: ShopCheckoutContactRsc,
}
