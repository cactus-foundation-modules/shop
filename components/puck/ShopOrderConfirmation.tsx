import { OrderConfirmationClient } from '@/modules/shop/components/public/OrderConfirmationClient'

export type ShopOrderConfirmationProps = Record<string, never>

// Registered as a SERVER component so Puck's RSC <Render> serialises only plain
// props (never its renderDropZone function bag, which a client-registered block
// chokes on). The order-status view is the OrderConfirmationClient island.
export function ShopOrderConfirmation() {
  return <OrderConfirmationClient />
}

export const shopOrderConfirmationPuckComponent = {
  label: 'Shop: Order Confirmation',
  fields: {},
  defaultProps: {},
  render: ShopOrderConfirmation,
}

export const shopOrderConfirmationPuckRscComponent = shopOrderConfirmationPuckComponent
