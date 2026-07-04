import { CartSummaryClient } from '@/modules/shop/components/public/CartSummaryClient'

export type ShopCartSummaryProps = Record<string, never>

// Registered as a SERVER component so Puck's RSC <Render> serialises only plain
// props (never its renderDropZone function bag, which a client-registered block
// chokes on). The cart-driven widget is the CartSummaryClient island.
export function ShopCartSummary() {
  return <CartSummaryClient />
}

export const shopCartSummaryPuckComponent = {
  label: 'Shop: Cart Summary',
  fields: {},
  defaultProps: {},
  render: ShopCartSummary,
}

export const shopCartSummaryPuckRscComponent = shopCartSummaryPuckComponent
