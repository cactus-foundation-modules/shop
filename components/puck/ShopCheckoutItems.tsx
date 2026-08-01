import { CheckoutItemsClient } from '@/modules/shop/components/public/CheckoutItemsClient'

// [ANCHOR] - checkout order summary: every basket line with its quantity, price
// and per-line choices (chosen delivery service and promised date included), so
// the shopper sees exactly what they are paying for without leaving checkout.
export type ShopCheckoutItemsProps = Record<string, never>

// Editor path renders the island in preview mode (sample lines when the editor
// has no basket); the RSC path renders it live. Registered as SERVER components
// so Puck's RSC <Render> never serialises its function bag into the client.
export function ShopCheckoutItems() {
  return <CheckoutItemsClient preview />
}

export const shopCheckoutItemsPuckComponent = {
  label: 'Shop: Checkout - Order summary [Anchor]',
  fields: {},
  defaultProps: {},
  permissions: { delete: false, duplicate: false },
  render: ShopCheckoutItems,
}

export function ShopCheckoutItemsRsc() {
  return <CheckoutItemsClient />
}

export const shopCheckoutItemsPuckRscComponent = {
  ...shopCheckoutItemsPuckComponent,
  render: ShopCheckoutItemsRsc,
}
