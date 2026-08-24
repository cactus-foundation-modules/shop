// Contract for the 'shop.checkout-contact-extras' extension point. A module
// registers a client component with these props and shop mounts it at the foot
// of the contact step, under the email box.
//
// Deliberately thin. Everything a module wants to ask for here is its own
// business - a permission tickbox, a "how did you hear about us" - and shop has
// no opinion about any of it beyond where it goes. Anything the extra needs to
// remember for the rest of the checkout it keeps in shop's own checkout state
// (updateCheckoutState), which is already shared, already persisted for the
// visit, and already what the order route reads.
//
// The email address is passed because it is the one thing an extra at this
// point is almost certainly about: a question about emails is unanswerable
// until there is an address to ask about.

export type ShopCheckoutContactExtraProps = {
  /** What is in the email box right now. Empty until they type one. */
  customerEmail: string
  /** True in the Puck editor, where there is no shopper and no basket. An extra
   *  should draw itself at rest rather than fetching anything. */
  preview?: boolean
}
