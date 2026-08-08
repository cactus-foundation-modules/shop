import { UpsellClient } from '@/modules/shop/components/public/UpsellClient'

export type ShopUpsellProductsProps = { heading?: string; layout?: string; maxItems?: number }

// Registered as a SERVER component so Puck's RSC <Render> serialises only plain
// props into the client boundary (a client-registered block chokes on Puck's
// renderDropZone function bag). The cart-driven strip is the UpsellClient island.
export function ShopUpsellProducts(props: ShopUpsellProductsProps) {
  return <UpsellClient heading={props.heading} maxItems={props.maxItems ?? 4} />
}

export const shopUpsellProductsPuckComponent = {
  label: 'Shop: Upsell Products',
  fields: {
    heading: { type: 'text' as const, label: 'Heading' },
    maxItems: { type: 'number' as const, label: 'Most suggestions to show' },
    layout: { type: 'select' as const, label: 'Layout', options: [{ value: 'Grid', label: 'Grid' }] },
  },
  defaultProps: { heading: 'You might also like', layout: 'Grid', maxItems: 4 },
  render: ShopUpsellProducts,
}

export const shopUpsellProductsPuckRscComponent = shopUpsellProductsPuckComponent
