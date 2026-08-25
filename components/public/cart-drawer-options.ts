// Look/behaviour options for the slide-out basket, on their own so the header
// widget and its Puck block can read the shape and the defaults without pulling
// in the panel itself. CartDrawerClient is loaded lazily on the first click -
// importing its options from the same file would drag the whole panel back into
// the header's bundle and undo that.
import { DRAWER_NOTE_DEFAULTS, type CartNoteOptions } from '@/modules/shop/components/public/cart-note-options'

// The whole-basket note's look rides along here rather than in a set of its own:
// the panel's options are one bag from the widget's point of view, and the note
// is one more thing the panel draws.
export type CartDrawerOptions = CartNoteOptions & {
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
  // Colours for the two footer buttons. Every one is optional: blank falls back
  // to what the panel has always drawn, so a basket styled before these existed
  // looks identical. A hover arm left blank simply reuses its resting arm, which
  // is how the panel behaved when it had no hover styling at all.
  //
  // Each value may carry a dark-mode arm as `light-dark(l, d)` - SiteColourField
  // composes it, the browser picks the arm, nothing here needs to know which.
  drawerCheckoutBg: string
  drawerCheckoutBorder: string
  drawerCheckoutText: string
  drawerCheckoutHoverBg: string
  drawerCheckoutHoverBorder: string
  drawerCheckoutHoverText: string
  drawerViewCartBg: string
  drawerViewCartBorder: string
  drawerViewCartText: string
  drawerViewCartHoverBg: string
  drawerViewCartHoverBorder: string
  drawerViewCartHoverText: string
  drawerRadius: number
}

export const DRAWER_DEFAULTS: CartDrawerOptions = {
  ...DRAWER_NOTE_DEFAULTS,
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
  drawerCheckoutBorder: '',
  drawerCheckoutText: 'var(--color-on-primary)',
  drawerCheckoutHoverBg: '',
  drawerCheckoutHoverBorder: '',
  drawerCheckoutHoverText: '',
  // Blank, not a token: the cart-page button has always taken its outline and
  // lettering from the checkout button's colour, so an unset value has to keep
  // inheriting that rather than pin itself to --color-primary.
  drawerViewCartBg: '',
  drawerViewCartBorder: '',
  drawerViewCartText: '',
  drawerViewCartHoverBg: '',
  drawerViewCartHoverBorder: '',
  drawerViewCartHoverText: '',
  drawerRadius: 9999,
}
