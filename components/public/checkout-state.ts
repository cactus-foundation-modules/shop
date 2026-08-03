'use client'

// Shared client-side checkout state, written by each checkout step block and
// read by the review/payment steps. sessionStorage (not localStorage) - a
// half-finished checkout shouldn't survive across browser sessions the way
// the cart itself does.

export type ShpAddressForm = {
  firstName: string
  lastName: string
  company: string
  line1: string
  line2: string
  city: string
  county: string
  postcode: string
  country: string
  phone: string
}

export type CheckoutState = {
  customerEmail: string
  customerName: string
  customerPhone: string
  shippingAddress: ShpAddressForm
  shippingRateId: string | null
  couponCode: string | null
  // Any registered provider id, not just the four built in - a module can
  // contribute its own method (open banking, say) through the shop's payment
  // provider extension point, and it has to survive a round trip through here.
  paymentMethod: string | null
  // Which checkout tickboxes the shopper has ticked, keyed by agreement id.
  // Lives here rather than in the review block's own state because the block
  // that draws the boxes and the block that posts the order are different Puck
  // blocks with no shared React state between them.
  agreements: Record<string, boolean>
}

const STORAGE_KEY = 'cactus_shop_checkout'
const EVENT = 'cactus-shop-checkout-changed'

export const EMPTY_ADDRESS: ShpAddressForm = {
  firstName: '', lastName: '', company: '', line1: '', line2: '', city: '', county: '', postcode: '', country: 'GB', phone: '',
}

export const EMPTY_CHECKOUT_STATE: CheckoutState = {
  customerEmail: '', customerName: '', customerPhone: '',
  shippingAddress: EMPTY_ADDRESS, shippingRateId: null, couponCode: null, paymentMethod: null,
  agreements: {},
}

export function getCheckoutState(): CheckoutState {
  if (typeof window === 'undefined') return EMPTY_CHECKOUT_STATE
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return EMPTY_CHECKOUT_STATE
    return { ...EMPTY_CHECKOUT_STATE, ...JSON.parse(raw) }
  } catch {
    return EMPTY_CHECKOUT_STATE
  }
}

export function updateCheckoutState(patch: Partial<CheckoutState>): void {
  const next = { ...getCheckoutState(), ...patch }
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  window.dispatchEvent(new CustomEvent(EVENT))
}

export function clearCheckoutState(): void {
  window.sessionStorage.removeItem(STORAGE_KEY)
  window.dispatchEvent(new CustomEvent(EVENT))
}

// Called once an order is placed. Contact + shipping address are kept so a
// shopper placing a second order in the same session doesn't have to retype
// them - only the bits specific to the order just placed are reset.
//
// Agreements reset with the order rather than persisting like the address:
// agreeing to the terms once is not agreeing to them for every future order,
// and a pre-ticked box on the next checkout would be a record of consent nobody
// actually gave.
export function clearOrderSpecificState(): void {
  updateCheckoutState({ paymentMethod: null, couponCode: null, agreements: {} })
}

export function subscribeCheckoutState(callback: () => void): () => void {
  window.addEventListener(EVENT, callback)
  return () => window.removeEventListener(EVENT, callback)
}

// Contact + shipping are separate Puck blocks with no step gating between them,
// so Payment/Review can mount (and fire their network calls) before those fields
// are filled in. Both check this before hitting an endpoint that requires them.
//
// `businessNameRequired` comes from shop settings and has to be passed in: this
// file is shared by blocks that each fetch config at their own pace, and a
// caller that has not got it yet is better off omitting it than guessing. The
// order-creating route enforces the same rule server-side regardless, so the
// worst an un-passed flag costs is a late error instead of an early one.
export function isContactAndShippingComplete(
  state: CheckoutState,
  opts?: { businessNameRequired?: boolean },
): boolean {
  const a = state.shippingAddress
  return (
    /\S+@\S+\.\S+/.test(state.customerEmail) &&
    state.customerName.trim().length > 0 &&
    a.firstName.trim().length > 0 &&
    a.lastName.trim().length > 0 &&
    a.line1.trim().length > 0 &&
    a.city.trim().length > 0 &&
    a.postcode.trim().length > 0 &&
    (!opts?.businessNameRequired || a.company.trim().length > 0)
  )
}

// Every compulsory tickbox ticked. Separate from the completeness check above
// because the two answer different questions and are shown differently: an
// unfilled address field is a step not finished yet, an unticked box is a
// decision the shopper has to make on this page before the button will work.
export function areAgreementsAccepted(
  state: CheckoutState,
  agreements: Array<{ id: string; required: boolean }>,
): boolean {
  return agreements.every((a) => !a.required || state.agreements[a.id] === true)
}
