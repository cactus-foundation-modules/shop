// RSC (server) half of the checkout payment step. Renders live: on the
// storefront the island stands down when the basket is empty, leaving the
// order-summary block's empty message on its own. Kept as a separate .rsc file
// because it resolves the 'shop.checkout-payment-fields' extension point, and
// the generated registry behind that statically imports server-only module code
// the editor bundle must never see.
import { CheckoutPaymentClient } from '@/modules/shop/components/public/CheckoutPaymentClient'
import { resolveCheckoutPaymentFields } from '@/modules/shop/lib/checkout-payment-fields'
import { shopCheckoutPaymentPuckComponent, type ShopCheckoutPaymentProps } from '@/modules/shop/components/puck/ShopCheckoutPayment'

// Explicit props only across the client boundary - never a spread of the puck bag.
export function ShopCheckoutPaymentRsc(props: ShopCheckoutPaymentProps) {
  return <CheckoutPaymentClient paymentFields={resolveCheckoutPaymentFields()} heading={props.heading} />
}

export const shopCheckoutPaymentPuckRscComponent = {
  ...shopCheckoutPaymentPuckComponent,
  render: ShopCheckoutPaymentRsc,
}
