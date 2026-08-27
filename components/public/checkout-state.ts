'use client'

import { isValidUkPhone } from '@/modules/shop/lib/phone'

// Shared client-side checkout state, written by each checkout step block and
// read by the review/payment steps. sessionStorage (not localStorage) - a
// half-finished checkout shouldn't survive across browser sessions the way
// the cart itself does.

// Deliberately no company/organisation here. It used to sit above line 1, which
// repeated it on every saved address and described the buyer rather than the
// door a parcel goes to. It is a contact detail now (customerOrganisation
// below); a company that has to appear on the delivery label goes in line 1.
export type ShpAddressForm = {
  firstName: string
  lastName: string
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
  // The organisation the shopper is buying on behalf of, where the shop asks for
  // one. A contact detail, alongside the name and email - not part of any
  // address. Signed-in shoppers have theirs filled in from their account.
  customerOrganisation: string
  // The customer's own reference for this order - their purchase order number,
  // their job number - where the shop asks for one. A contact detail like the
  // organisation above, and nothing to do with the shop's own order number.
  customerReference: string
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
  firstName: '', lastName: '', line1: '', line2: '', city: '', county: '', postcode: '', country: 'GB', phone: '',
}

export const EMPTY_CHECKOUT_STATE: CheckoutState = {
  customerEmail: '', customerName: '', customerOrganisation: '', customerReference: '', customerPhone: '',
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

// --- The order this browsing session placed --------------------------------
//
// Remembered so the confirmation page can tell the shopper who has just paid
// from someone opening a confirmation link out of an email weeks later. Only
// the first of those should have their basket emptied.
//
// Written to BOTH storages deliberately. sessionStorage is the tighter signal,
// but the basket lives in localStorage and so outlives its own marker: a
// shopper handed off to a payment provider and handed back into a tab with a
// fresh session (a restored tab, a link opened through the provider's own app,
// storage partitioning on some mobile browsers) arrived at a thank-you page
// with their basket still full. The localStorage copy is timestamped and only
// trusted for a few hours, which is what keeps the weeks-later case safe.
const PLACED_ORDER_KEY = 'cactus_shop_placed_order'
const PLACED_ORDER_TTL_MS = 6 * 60 * 60 * 1000

type PlacedOrder = { orderId: string; orderNumber: string; at: number }

function readPlacedOrder(): PlacedOrder | null {
  try {
    const raw = window.localStorage.getItem(PLACED_ORDER_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<PlacedOrder>
    if (typeof parsed?.orderNumber !== 'string' || typeof parsed?.at !== 'number') return null
    if (Date.now() - parsed.at > PLACED_ORDER_TTL_MS) return null
    return { orderId: String(parsed.orderId ?? ''), orderNumber: parsed.orderNumber, at: parsed.at }
  } catch {
    return null
  }
}

export function rememberPlacedOrder(orderId: string, orderNumber: string): void {
  try {
    window.sessionStorage.setItem('cactus_shop_order_id', orderId)
    window.sessionStorage.setItem('cactus_shop_order_number', orderNumber)
    window.localStorage.setItem(
      PLACED_ORDER_KEY,
      JSON.stringify({ orderId, orderNumber, at: Date.now() } satisfies PlacedOrder)
    )
  } catch {
    // A browser refusing storage still gets a working checkout; it just won't
    // have its basket emptied for it, which is the smaller of the two failures.
  }
}

// Whether this browser is the one that placed the order being looked at.
export function isPlacedOrder(orderNumber: string): boolean {
  try {
    if (window.sessionStorage.getItem('cactus_shop_order_number') === orderNumber) return true
  } catch {
    // fall through to the longer-lived copy
  }
  return readPlacedOrder()?.orderNumber === orderNumber
}

// Dropped once the order is finished with, so a completed order is never
// something a later checkout could confirm itself against.
export function forgetPlacedOrder(): void {
  try {
    window.sessionStorage.removeItem('cactus_shop_order_id')
    window.sessionStorage.removeItem('cactus_shop_order_number')
    window.sessionStorage.removeItem('cactus_shop_paypal_order_id')
    window.localStorage.removeItem(PLACED_ORDER_KEY)
  } catch {
    // Nothing to clean up if storage is unavailable.
  }
}

// Contact + shipping are separate Puck blocks with no step gating between them,
// so Payment/Review can mount (and fire their network calls) before those fields
// are filled in. Both check this before hitting an endpoint that requires them.
//
// `organisationRequired` and `phoneRequired` come from shop settings and have to
// be passed in: this file is shared by blocks that each fetch config at their own
// pace, and a caller that has not got it yet is better off omitting it than
// guessing. The order-creating route enforces the same rules server-side
// regardless, so the worst an un-passed flag costs is a late error instead of an
// early one.
export function isContactAndShippingComplete(
  state: CheckoutState,
  opts?: CheckoutFieldRules,
): boolean {
  return missingCheckoutFields(state, opts).length === 0
}

// A compulsory box that is not finished yet. `label` is the wording the field's
// own <label> uses, so a shopper reads back exactly what they are looking at
// rather than a field name out of the code. `key` is the input's
// `data-shop-field`, which is what lets the review step send them to it.
//
// `hint` says what is wrong with something that was filled in, and travels with
// the row rather than being decided where the list is drawn: a phone number told
// it does not look like an email address is how that goes wrong.
export type MissingCheckoutField = { key: string; label: string; reason: 'empty' | 'invalid'; hint?: string }

export type CheckoutFieldRules = {
  organisationRequired?: boolean
  // The owner's own wording for the organisation box ("Practice name", say).
  // Only used for the label, so a caller without it yet still gets the right
  // list, just with the default name on that one row.
  organisationLabel?: string
  // Whether the customer's own reference has to be given, and what the owner
  // calls it. Same arrangement as the organisation pair above.
  customerReferenceRequired?: boolean
  customerReferenceLabel?: string
  phoneRequired?: boolean
}

// Everything still owed before an order can be placed, in the order the page
// asks for it: contact details, then the delivery address. Drives both the
// completeness test above and the "still to fill in" list on the review step -
// one list, so the button and the explanation for it can never disagree.
export function missingCheckoutFields(
  state: CheckoutState,
  opts?: CheckoutFieldRules,
): MissingCheckoutField[] {
  const a = state.shippingAddress
  const missing: MissingCheckoutField[] = []
  const add = (key: string, label: string, reason: 'empty' | 'invalid' = 'empty', hint?: string) =>
    missing.push({ key, label, reason, ...(hint ? { hint } : {}) })

  // Typed-but-wrong is worth telling apart from blank: "fill in your email" is
  // no help at all to somebody who thinks they already have.
  if (state.customerEmail.trim().length === 0) add('customerEmail', 'Email')
  else if (!/\S+@\S+\.\S+/.test(state.customerEmail)) {
    add('customerEmail', 'Email', 'invalid', 'that does not look like an email address.')
  }

  if (state.customerName.trim().length === 0) add('customerName', 'Full name')

  // Directly after the name, because that is where the box is: it says who the
  // shopper is, not where the parcel goes, so it belongs with the contact
  // details rather than in the address below.
  if (opts?.organisationRequired && state.customerOrganisation.trim().length === 0) {
    add('customerOrganisation', opts.organisationLabel?.trim() || 'Organisation name')
  }

  // Directly under it, because that is the order the boxes are drawn in: who
  // they are, then what they want the order called on their side.
  if (opts?.customerReferenceRequired && state.customerReference.trim().length === 0) {
    add('customerReference', opts.customerReferenceLabel?.trim() || 'Purchase order number')
  }

  if (a.firstName.trim().length === 0) add('firstName', 'First name')
  if (a.lastName.trim().length === 0) add('lastName', 'Last name')
  // Listed here because that is where the box now sits: under the names on the
  // delivery step, since the number belongs to the address rather than to the
  // account. Still read from customerPhone - the shipping block writes both that
  // and the address's own copy - because customerPhone is what the order carries
  // and what the order-creating route enforces. A number that is there but
  // unreadable counts as outstanding whether the shop insists on one or not: the
  // route turns it away either way, and a review step saying everything is fine
  // before that happens is no help to anybody.
  const phone = state.customerPhone.trim()
  if (opts?.phoneRequired && phone.length === 0) add('customerPhone', 'Phone')
  else if (phone.length > 0 && !isValidUkPhone(phone)) {
    add('customerPhone', 'Phone', 'invalid', 'that does not look like a UK phone number.')
  }

  if (a.line1.trim().length === 0) add('line1', 'Address line 1')
  if (a.city.trim().length === 0) add('city', 'Town or city')
  if (a.postcode.trim().length === 0) add('postcode', 'Postcode')

  return missing
}

// One part of the "still to do" line on the review step. `fieldKey` set means
// this part is a link to the box or choice it names - the review step turns it
// into a button that scrolls there; unset means it is plain wording holding the
// sentence together.
export type CheckoutBlockedSegment = { text: string; fieldKey?: string }

// The whole refusal as one sentence: the boxes still owed above, then the
// decisions still owed on the review step itself, each named as its own label
// names it and each linked to itself. One sentence rather than a bullet list
// plus a separate note by the button - a shopper told off twice for the same
// thing still had to work out that the two added up to one refusal.
//
// Pure, and separate from the block that draws it, so the wording can be tested
// without standing a checkout up around it.
export function checkoutBlockedSegments(
  missing: MissingCheckoutField[],
  decisions: { key: string; text: string }[],
): CheckoutBlockedSegment[] {
  if (missing.length === 0 && decisions.length === 0) return []

  const lower = (t: string) => `${t.charAt(0).toLowerCase()}${t.slice(1)}`
  const upper = (t: string) => `${t.charAt(0).toUpperCase()}${t.slice(1)}`
  // "a, b and c" - the separators are the only plain wording between the links.
  const list = (fields: MissingCheckoutField[]): CheckoutBlockedSegment[] => fields.flatMap((f, i) => [
    ...(i === 0 ? [] : [{ text: i === fields.length - 1 ? ' and ' : ', ' }]),
    { text: lower(f.label), fieldKey: f.key },
  ])

  // Blank and wrong are different problems and get different verbs: telling
  // somebody to fill in a box they have already filled in is no help at all.
  const empty = missing.filter((f) => f.reason !== 'invalid')
  const invalid = missing.filter((f) => f.reason === 'invalid')
  const clauses: CheckoutBlockedSegment[][] = []
  if (empty.length > 0) clauses.push([{ text: 'complete your ' }, ...list(empty)])
  if (invalid.length > 0) clauses.push([{ text: 'correct your ' }, ...list(invalid)])

  const segments: CheckoutBlockedSegment[] = []
  clauses.forEach((clause, i) => {
    // The sentence has to open with a capital, and its opening word is a link
    // whenever every box above is already filled in - so in that case the
    // capital goes on the link's own wording instead.
    if (i === 0) segments.push({ ...clause[0]!, text: upper(clause[0]!.text) })
    else segments.push({ text: ` and ${clause[0]!.text}` })
    segments.push(...clause.slice(1))
  })
  if (clauses.length > 0) segments.push({ text: ' above' })

  decisions.forEach((decision, i) => {
    if (i > 0) segments.push({ text: ' and ' })
    else if (clauses.length > 0) segments.push({ text: ', and then ' })
    const first = i === 0 && clauses.length === 0
    segments.push({ text: first ? upper(decision.text) : decision.text, fieldKey: decision.key })
  })

  segments.push({ text: ' to place your order.' })

  // What is actually wrong with a box that was filled in, from whoever decided
  // it was wrong. Naming the box here is what had a phone number told it did
  // not look like an email address.
  for (const field of invalid) {
    if (field.hint) segments.push({ text: ` ${field.label} - ${field.hint}` })
  }

  return segments
}

// Sends the shopper to the box being asked about. The contact and shipping
// steps mark their inputs with `data-shop-field`; matching them by attribute is
// what lets the review step reach across, since the three are separate Puck
// blocks with no shared React state between them.
//
// Silently does nothing when the field is not on the page: a layout that has
// dropped a step still reads correctly, it just cannot jump.
export function focusCheckoutField(key: string): void {
  const field = document.querySelector<HTMLElement>(`[data-shop-field="${CSS.escape(key)}"]`)
  if (!field) return
  field.scrollIntoView({ behavior: 'smooth', block: 'center' })
  // The scroll above is the one doing the moving; focus jumping the page to the
  // same place at full speed would fight it.
  field.focus({ preventScroll: true })
}

// Every compulsory tickbox ticked. Separate from the completeness check above
// because the two answer different questions and are shown differently: an
// unfilled address field is a step not finished yet, an unticked box is a
// decision the shopper has to make on this page before the button will work.
//
// Takes the ticks rather than the whole state so the block that draws the boxes
// can ask about the ticks it is drawing, which is not always the same object as
// the one in storage on the render it is asking on.
export function areAgreementsAccepted(
  ticked: Record<string, boolean>,
  agreements: Array<{ id: string; required: boolean }>,
): boolean {
  return agreements.every((a) => !a.required || ticked[a.id] === true)
}
