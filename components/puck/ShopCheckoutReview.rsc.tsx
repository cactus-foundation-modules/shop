// RSC (server) half of the checkout review step. Renders live: on the
// storefront the island stands down when the basket is empty, leaving the
// order-summary block's empty message on its own. Kept as a separate .rsc file
// because it resolves the 'shop.checkout-wallet-buttons' extension point, and
// the generated registry behind that statically imports server-only module code
// the editor bundle must never see.
import { CheckoutReviewClient } from '@/modules/shop/components/public/CheckoutReviewClient'
import { resolveCheckoutWalletButtons } from '@/modules/shop/lib/checkout-wallet-buttons'
import { shopCheckoutReviewPuckComponent, type ShopCheckoutReviewProps } from '@/modules/shop/components/puck/ShopCheckoutReview'

// Explicit props only across the client boundary - never a spread of the puck bag.
export function ShopCheckoutReviewRsc(props: ShopCheckoutReviewProps) {
  return (
    <CheckoutReviewClient
      walletButtons={resolveCheckoutWalletButtons()}
      heading={props.heading}
      buttonLabel={props.buttonLabel}
      trustText={props.trustText}
    />
  )
}

export const shopCheckoutReviewPuckRscComponent = {
  ...shopCheckoutReviewPuckComponent,
  render: ShopCheckoutReviewRsc,
}
