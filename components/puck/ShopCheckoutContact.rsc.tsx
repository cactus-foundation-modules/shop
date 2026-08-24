// RSC (server) half of the checkout contact step. Renders live: on the
// storefront the island stands down when the basket is empty, leaving the
// order-summary block's empty message on its own. Kept as a separate .rsc file
// because it resolves the 'shop.checkout-contact-extras' extension point, and
// the generated registry behind that statically imports server-only module code
// the editor bundle must never see.
import { CheckoutContactClient } from '@/modules/shop/components/public/CheckoutContactClient'
import { resolveCheckoutContactExtras } from '@/modules/shop/lib/checkout-contact-extras'
import { shopCheckoutContactPuckComponent, type ShopCheckoutContactProps } from '@/modules/shop/components/puck/ShopCheckoutContact'

// Explicit props only across the client boundary - never a spread of the puck bag.
export function ShopCheckoutContactRsc(props: ShopCheckoutContactProps) {
  return <CheckoutContactClient extras={resolveCheckoutContactExtras()} heading={props.heading} />
}

export const shopCheckoutContactPuckRscComponent = {
  ...shopCheckoutContactPuckComponent,
  render: ShopCheckoutContactRsc,
}
