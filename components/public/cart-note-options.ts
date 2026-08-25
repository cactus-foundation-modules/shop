// How the whole-basket notes are DRAWN. The notes themselves are somebody
// else's sentence: another module contributes them through the
// `shop.cart-summary` point (see lib/cart-summary.ts) and shop prints them
// verbatim. Nothing here composes, interprets or dates anything - these options
// only decide what the finished line looks like.
//
// Set per surface, on the block that owns it, so the slide-out basket, the cart
// page and the checkout order summary can each dress the note differently, or
// hide it, without any of them knowing about the others.
//
// On its own file for the same reason cart-drawer-options.ts is: the Puck
// blocks need the shape and the defaults without dragging the renderer and its
// stylesheet into their bundles.

export type CartNoteStyle = 'hidden' | 'plain' | 'box' | 'bubble'

export type CartNoteOptions = {
  noteStyle: CartNoteStyle
  // Leading tick on each line, plain style only - the slide-out has always had
  // one, the other surfaces never did, so it stays a choice rather than a look
  // one of them silently inherits.
  noteTick: 'yes' | 'no'
  noteBold: 'yes' | 'no'
  // Every colour may carry a dark-mode arm as `light-dark(l, d)` - SiteColourField
  // composes it, the browser picks the arm, nothing here needs to know which.
  noteBg: string
  noteTextColour: string
  noteBorderColour: string
  noteRadius: number
  noteTextSize: number
  // Bubble style only. An empty image falls back to the plain coloured box
  // rather than drawing a bubble with nothing to point at.
  noteImageUrl: string
  noteImageWidth: number
  noteImageSide: 'left' | 'right'
  noteTailSize: number
}

// House defaults. Each surface overrides the two or three that decide whether
// it looks exactly as it did before these options existed.
export const CART_NOTE_DEFAULTS: CartNoteOptions = {
  noteStyle: 'plain',
  noteTick: 'no',
  noteBold: 'no',
  noteBg: 'var(--color-success-subtle)',
  noteTextColour: '',
  noteBorderColour: '',
  noteRadius: 12,
  noteTextSize: 15,
  noteImageUrl: '',
  noteImageWidth: 96,
  noteImageSide: 'left',
  noteTailSize: 12,
}

// Slide-out basket: green, bold, ticked - what the panel has always drawn.
export const DRAWER_NOTE_DEFAULTS: CartNoteOptions = {
  ...CART_NOTE_DEFAULTS,
  noteTick: 'yes',
  noteBold: 'yes',
  noteTextColour: 'var(--color-success)',
  noteTextSize: 14.5,
}

// Checkout order summary: a quiet secondary line, exactly as before.
export const CHECKOUT_NOTE_DEFAULTS: CartNoteOptions = {
  ...CART_NOTE_DEFAULTS,
  noteTextColour: 'var(--color-text-secondary)',
  noteTextSize: 14,
}

// Cart page: hidden by default, because the note has never been drawn in the
// body of that page - it rides in the sticky bar's meta line and still does.
// Switching this on is an addition an author asks for, not one they inherit.
export const CART_PAGE_NOTE_DEFAULTS: CartNoteOptions = {
  ...CART_NOTE_DEFAULTS,
  noteStyle: 'hidden',
}

// Pull just the note keys out of a block's prop bag. A block's props are one
// flat bag of thirty-odd options, and spreading the lot over a set of defaults
// hands `undefined` to every key the author never touched - which beats the
// default rather than falling back to it, and leaves the note undressed.
const CART_NOTE_KEYS = Object.keys(CART_NOTE_DEFAULTS) as (keyof CartNoteOptions)[]

export function pickCartNoteOptions(props: Partial<CartNoteOptions>): Partial<CartNoteOptions> {
  const out: Partial<CartNoteOptions> = {}
  for (const key of CART_NOTE_KEYS) {
    const value = props[key]
    if (value !== undefined && value !== null && value !== '') Object.assign(out, { [key]: value })
  }
  return out
}
