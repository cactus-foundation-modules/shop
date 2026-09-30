import { ImageUrlPickerField } from '@/lib/puck/MediaPickerField'
import { OrderConfirmationClient, type OrderConfirmationOptions } from '@/modules/shop/components/public/OrderConfirmationClient'
import { yesNo } from '@/modules/shop/components/puck/cart-fields'

export type ShopOrderConfirmationProps = OrderConfirmationOptions

// Registered as a SERVER component so Puck's RSC <Render> serialises only plain
// props (never its renderDropZone function bag, which a client-registered block
// chokes on). The order-status view is the OrderConfirmationClient island.
//
// Explicit props only across the client boundary - never a spread of the puck bag.
export function ShopOrderConfirmation(props: ShopOrderConfirmationProps) {
  return (
    <OrderConfirmationClient
      celebrationImage={props.celebrationImage || undefined}
      celebrationImageAlt={props.celebrationImageAlt}
      celebrationImageWidth={props.celebrationImageWidth}
      holographic={props.holographic}
    />
  )
}

export const shopOrderConfirmationPuckComponent = {
  label: 'Shop: Order Confirmation',
  fields: {
    celebrationImage: { type: 'custom' as const, label: 'Celebration picture (replaces the tick; hidden if payment fails)', render: ImageUrlPickerField },
    celebrationImageAlt: { type: 'text' as const, label: 'Picture description (for screen readers)' },
    celebrationImageWidth: { type: 'number' as const, label: 'Picture width (px)' },
    holographic: { type: 'select' as const, label: 'Holographic shimmer', options: yesNo },
  },
  defaultProps: {
    celebrationImage: '',
    celebrationImageAlt: '',
    celebrationImageWidth: 220,
    holographic: 'yes',
  },
  render: ShopOrderConfirmation,
}

export const shopOrderConfirmationPuckRscComponent = shopOrderConfirmationPuckComponent
