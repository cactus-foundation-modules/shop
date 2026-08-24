import { CheckoutReviewClient } from '@/modules/shop/components/public/CheckoutReviewClient'

// [ANCHOR] - core checkout step (order review + place order).
// Wording only; absent props = the historical strings (pre-settings layouts).
// The place-order button always appends the order total to whatever label is
// set - the amount on the button is a promise the block keeps for the shopper.
export type ShopCheckoutReviewProps = { heading?: string; buttonLabel?: string; trustText?: string }

// Registered as a SERVER component so Puck's RSC <Render> serialises only plain
// props (never its renderDropZone function bag, which a client-registered block
// chokes on). The order summary + place-order button is the CheckoutReviewClient island.
//
// Editor path renders in preview mode - the editor has no real basket, and the
// island hides itself when the basket is empty, so without the flag every
// checkout step would vanish from the layout editor.
export function ShopCheckoutReview(props: ShopCheckoutReviewProps) {
  return <CheckoutReviewClient preview heading={props.heading} buttonLabel={props.buttonLabel} trustText={props.trustText} />
}

export const shopCheckoutReviewPuckComponent = {
  label: 'Shop: Checkout - Review [Anchor]',
  fields: {
    heading: { type: 'text' as const, label: 'Heading' },
    buttonLabel: { type: 'text' as const, label: 'Place order button (the total is always added)' },
    trustText: { type: 'text' as const, label: 'Reassurance line under the button (blank hides it)' },
  },
  defaultProps: { heading: 'Order review', buttonLabel: 'Place order', trustText: '' },
  permissions: { delete: false, duplicate: false },
  render: ShopCheckoutReview,
}

// RSC half lives in ShopCheckoutReview.rsc.tsx (manifest `rscImport`): it
// resolves the 'shop.checkout-wallet-buttons' extension point, and the
// generated registry behind that statically imports server-only module code -
// nothing this editor-bundled file may touch.
