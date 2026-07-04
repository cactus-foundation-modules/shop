import { UpsellClient } from '@/modules/shop/components/public/UpsellClient'

export type ShopUpsellProductsProps = { heading?: string; layout?: string }

// Registered as a SERVER component so Puck's RSC <Render> serialises only plain
// props into the client boundary (a client-registered block chokes on Puck's
// renderDropZone function bag). The cart-driven strip is the UpsellClient island.
export function ShopUpsellProducts(props: ShopUpsellProductsProps) {
  return <UpsellClient heading={props.heading} />
}

export const shopUpsellProductsPuckComponent = {
  label: 'Shop: Upsell Products',
  fields: { heading: { type: 'text' as const, label: 'Heading' }, layout: { type: 'select' as const, label: 'Layout', options: [{ value: 'Grid', label: 'Grid' }] } },
  defaultProps: { heading: 'You might also like', layout: 'Grid' },
  render: ShopUpsellProducts,
}

export const shopUpsellProductsPuckRscComponent = shopUpsellProductsPuckComponent
