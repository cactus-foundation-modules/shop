// RSC (server) half of the checkout shipping step. Renders live: on the
// storefront the island stands down when the basket is empty, leaving the
// order-summary block's empty message on its own. Kept as a separate .rsc file
// because it resolves the 'shop.checkout-address-lookup' extension point, and
// the generated registry behind that statically imports server-only module
// code the editor bundle must never see.
import { CheckoutShippingClient } from '@/modules/shop/components/public/CheckoutShippingClient'
import { resolveCheckoutAddressLookup } from '@/modules/shop/lib/checkout-address-lookup'
import { shopCheckoutShippingPuckComponent } from '@/modules/shop/components/puck/ShopCheckoutShipping'

export function ShopCheckoutShippingRsc() {
  return <CheckoutShippingClient addressLookup={resolveCheckoutAddressLookup()} />
}

export const shopCheckoutShippingPuckRscComponent = {
  ...shopCheckoutShippingPuckComponent,
  render: ShopCheckoutShippingRsc,
}
