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
  paymentMethod: 'STRIPE' | 'PAYPAL' | 'BANK_TRANSFER' | 'CASH' | null
}

const STORAGE_KEY = 'cactus_shop_checkout'
const EVENT = 'cactus-shop-checkout-changed'

export const EMPTY_ADDRESS: ShpAddressForm = {
  firstName: '', lastName: '', company: '', line1: '', line2: '', city: '', county: '', postcode: '', country: 'GB', phone: '',
}

export const EMPTY_CHECKOUT_STATE: CheckoutState = {
  customerEmail: '', customerName: '', customerPhone: '',
  shippingAddress: EMPTY_ADDRESS, shippingRateId: null, couponCode: null, paymentMethod: null,
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
export function clearOrderSpecificState(): void {
  updateCheckoutState({ paymentMethod: null, couponCode: null })
}

export function subscribeCheckoutState(callback: () => void): () => void {
  window.addEventListener(EVENT, callback)
  return () => window.removeEventListener(EVENT, callback)
}

// Contact + shipping are separate Puck blocks with no step gating between them,
// so Payment/Review can mount (and fire their network calls) before those fields
// are filled in. Both check this before hitting an endpoint that requires them.
export function isContactAndShippingComplete(state: CheckoutState): boolean {
  const a = state.shippingAddress
  return (
    /\S+@\S+\.\S+/.test(state.customerEmail) &&
    state.customerName.trim().length > 0 &&
    a.firstName.trim().length > 0 &&
    a.lastName.trim().length > 0 &&
    a.line1.trim().length > 0 &&
    a.city.trim().length > 0 &&
    a.postcode.trim().length > 0
  )
}
