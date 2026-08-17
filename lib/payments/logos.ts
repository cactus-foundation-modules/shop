// Brand marks for shop's own payment methods.
//
// Held as markup rather than as files under `public/`: the same rule the
// contributed providers follow (see ShpPaymentLogo), and it keeps the checkout
// from waiting on a second request to show who is taking the money. Stripe and
// PayPal bring their own brands; bank transfer is nobody's brand, so it gets a
// plain bank building instead - a mark an owner can switch off on the Payments
// tab if they would rather the name stood on its own. Cash has none: a shopper
// paying in cash knows what cash is.
import type { ShpPaymentLogo } from '@/modules/shop/lib/payments/provider'

function dataUri(svg: string): string {
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

// Stripe's "S". One colourway: the brand purple carries on a white page and a
// dark one alike, so there is nothing to swap.
const STRIPE_MARK = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="#635BFF"><path d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-6.99-2.109l-.9 5.555C5.175 22.99 8.385 24 11.714 24c2.641 0 4.843-.624 6.328-1.813 1.664-1.305 2.525-3.236 2.525-5.732 0-4.128-2.524-5.851-6.594-7.305h.003z"/></svg>`

// PayPal's double-P monogram. Its own navy disappears against a dark page, so
// the mark ships twice and the checkout shows whichever the theme calls for.
function paypalMark(colour: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="${colour}"><path d="M15.607 4.653H8.941L6.645 19.251H1.82L4.862 0h7.995c3.754 0 6.375 2.294 6.473 5.513-.648-.478-2.105-.86-3.722-.86m6.57 5.546c0 3.41-3.01 6.853-6.958 6.853h-2.493L11.595 24H6.74l1.845-11.538h3.592c4.208 0 7.346-3.634 7.153-6.949a5.24 5.24 0 0 1 2.848 4.686M9.653 5.546h6.408c.907 0 1.942.222 2.363.541-.195 2.741-2.655 5.483-6.441 5.483H8.714Z"/></svg>`
}

export const stripeLogo: ShpPaymentLogo = {
  light: dataUri(STRIPE_MARK),
  width: 24,
  height: 24,
}

export const paypalLogo: ShpPaymentLogo = {
  light: dataUri(paypalMark('#003087')),
  dark: dataUri(paypalMark('#FFFFFF')),
  width: 24,
  height: 24,
}

// A bank building, for bank transfer. Drawn in ink rather than a brand colour
// because there is no brand to be true to, which also means it needs the pale
// colourway in the dark theme like PayPal's does.
function bankMark(colour: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="${colour}"><path d="M12 1.5 1.5 7.25V9.5h21V7.25L12 1.5Z"/><path d="M4 11.25h2.75v7H4v-7Zm6.625 0h2.75v7h-2.75v-7Zm6.625 0H20v7h-2.75v-7Z"/><path d="M1.5 20h21v2.5h-21V20Z"/></svg>`
}

export const bankTransferLogo: ShpPaymentLogo = {
  light: dataUri(bankMark('#1F2937')),
  dark: dataUri(bankMark('#FFFFFF')),
  width: 24,
  height: 24,
}
