import { CheckoutShippingClient } from '@/modules/shop/components/public/CheckoutShippingClient'

// [ANCHOR] - core checkout step (shipping address + method).
// Wording only; absent props = the historical strings (pre-settings layouts).
export type ShopCheckoutShippingProps = { heading?: string; methodHeading?: string }

// Registered as a SERVER component so Puck's RSC <Render> serialises only plain
// props (never its renderDropZone function bag, which a client-registered block
// chokes on). The interactive form is the CheckoutShippingClient island.
//
// Editor path renders in preview mode - the editor has no real basket, and the
// island hides itself when the basket is empty, so without the flag every
// checkout step would vanish from the layout editor.
export function ShopCheckoutShipping(props: ShopCheckoutShippingProps) {
  return <CheckoutShippingClient preview heading={props.heading} methodHeading={props.methodHeading} />
}

export const shopCheckoutShippingPuckComponent = {
  label: 'Shop: Checkout - Shipping [Anchor]',
  fields: {
    heading: { type: 'text' as const, label: 'Heading' },
    methodHeading: { type: 'text' as const, label: 'Delivery method heading' },
  },
  defaultProps: { heading: 'Delivery address', methodHeading: 'Delivery method' },
  permissions: { delete: false, duplicate: false },
  render: ShopCheckoutShipping,
}

// RSC half lives in ShopCheckoutShipping.rsc.tsx (manifest `rscImport`): it
// resolves the 'shop.checkout-address-lookup' extension point, and the
// generated registry behind that statically imports server-only module code -
// nothing this editor-bundled file may touch.
