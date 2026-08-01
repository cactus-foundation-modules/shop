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

// RSC half lives in ShopCheckoutShipping.rsc.tsx (manifest `rscImport`): it
// resolves the 'shop.checkout-address-lookup' extension point, and the
// generated registry behind that statically imports server-only module code -
// nothing this editor-bundled file may touch.
