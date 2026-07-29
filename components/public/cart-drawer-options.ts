// Look/behaviour options for the slide-out basket, on their own so the header
// widget and its Puck block can read the shape and the defaults without pulling
// in the panel itself. CartDrawerClient is loaded lazily on the first click -
// importing its options from the same file would drag the whole panel back into
// the header's bundle and undo that.

export type CartDrawerOptions = {
  drawerHeading: string
  drawerSide: 'right' | 'left'
  drawerWidth: number
  drawerShowImage: 'yes' | 'no'
  drawerShowDelivery: 'yes' | 'no'
  drawerSubtotalLabel: string
  drawerCheckoutLabel: string
  // Empty hides the secondary button - a shop happy for the panel to be the only
  // basket needs no way through to the cart page.
  drawerViewCartLabel: string
  drawerEmptyText: string
  drawerContinueLabel: string
  drawerCheckoutBg: string
  drawerCheckoutText: string
  drawerRadius: number
}

export const DRAWER_DEFAULTS: CartDrawerOptions = {
  drawerHeading: 'Your basket',
  drawerSide: 'right',
  drawerWidth: 420,
  drawerShowImage: 'yes',
  drawerShowDelivery: 'yes',
  drawerSubtotalLabel: 'Subtotal',
  drawerCheckoutLabel: 'Checkout',
  drawerViewCartLabel: 'View full basket',
  drawerEmptyText: 'Your basket is empty.',
  drawerContinueLabel: 'Continue shopping',
  drawerCheckoutBg: 'var(--color-primary)',
  drawerCheckoutText: 'var(--color-on-primary)',
  drawerRadius: 9999,
}
