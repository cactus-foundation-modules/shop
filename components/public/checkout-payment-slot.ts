// The seam that lets the card fields be drawn in the review step while every
// bit of their logic stays in the payment step.
//
// The two are separate Puck blocks and share no React state, so the fields
// cannot simply be moved: the intent that feeds them, the submit handle "Place
// order" calls, and the withdrawal of that handle when the shopper switches
// method all live in CheckoutPaymentClient and belong together. What moves is
// only where the fields are DRAWN - CheckoutPaymentClient renders them into
// this slot with a React portal, so the component never remounts, never loses
// what the shopper has typed, and never has to know where on the page it ended
// up.
//
// Why they are drawn there at all: a card is typed to pay, and the thing that
// pays is the button. Fields three blocks up the page, above the delivery
// options and the order summary, are filled in before the shopper has seen what
// they are about to be charged - and left behind entirely by anyone who scrolls
// straight to the button. Beside it, the order reads the way the shopper thinks
// about it: here is what is still missing, here are the quick ways to pay, here
// is the card, here is the button.
//
// The slot may come and go (an empty basket takes the whole review step with
// it), and there is no guarantee a layout has a review step at all - a custom
// checkout might not. Both cases fall back to drawing the fields in the payment
// step, exactly as they were before.

/** The element CheckoutPaymentClient portals its card fields into. */
export const CHECKOUT_PAYMENT_SLOT_ID = 'shop-checkout-payment-fields-slot'

// Fired by the review step when its slot appears or disappears. The payment
// step cannot poll for it: both blocks are islands hydrated independently, and
// which of them mounts first is not ours to decide.
export const CHECKOUT_PAYMENT_SLOT_EVENT = 'cactus-shop-payment-slot-changed'

export function announceCheckoutPaymentSlot(): void {
  window.dispatchEvent(new CustomEvent(CHECKOUT_PAYMENT_SLOT_EVENT))
}

export function findCheckoutPaymentSlot(): HTMLElement | null {
  if (typeof document === 'undefined') return null
  return document.getElementById(CHECKOUT_PAYMENT_SLOT_ID)
}
