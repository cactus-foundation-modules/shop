import { CheckoutItemsClient, type CheckoutItemsOptions } from '@/modules/shop/components/public/CheckoutItemsClient'

// [ANCHOR] - checkout order summary: every basket line with its quantity, price
// and per-line choices (chosen delivery service and promised date included), so
// the shopper sees exactly what they are paying for without leaving checkout.
export type ShopCheckoutItemsProps = Pick<CheckoutItemsOptions, 'sticky' | 'stickyOffset'>

// Editor path renders the island in preview mode (sample lines when the editor
// has no basket); the RSC path renders it live. Registered as SERVER components
// so Puck's RSC <Render> never serialises its function bag into the client.
export function ShopCheckoutItems(props: ShopCheckoutItemsProps) {
  return <CheckoutItemsClient preview sticky={props.sticky} stickyOffset={props.stickyOffset} />
}

export const shopCheckoutItemsPuckComponent = {
  label: 'Shop: Checkout - Order summary [Anchor]',
  fields: {
    sticky: {
      type: 'select' as const,
      label: 'Stay in view while scrolling',
      options: [{ value: 'off', label: 'Off' }, { value: 'on', label: 'On (give the block its own column)' }],
    },
    stickyOffset: { type: 'text' as const, label: 'Sticky top offset (CSS length, e.g. 7rem below a sticky header)' },
  },
  defaultProps: { sticky: 'off', stickyOffset: '1rem' } as ShopCheckoutItemsProps,
  permissions: { delete: false, duplicate: false },
  render: ShopCheckoutItems,
}

// RSC half: hand the island plain props only - Puck's RSC <Render> passes every
// block a `puck` bag of live functions, and spreading that into a client island
// 500s the page (see ShopCartItemsRsc).
export function ShopCheckoutItemsRsc(props: ShopCheckoutItemsProps) {
  const options = { ...props } as Record<string, unknown>
  delete options.puck
  delete options.editMode
  const { sticky, stickyOffset } = options as ShopCheckoutItemsProps
  return <CheckoutItemsClient sticky={sticky} stickyOffset={stickyOffset} />
}

export const shopCheckoutItemsPuckRscComponent = {
  ...shopCheckoutItemsPuckComponent,
  render: ShopCheckoutItemsRsc,
}
