// The slide-out basket's two browser seams, for modules that are not shop.
//
// 1. Whether the basket is open. Anything floating over the page - a chat
//    bubble, a "back to top" button - covers the panel's own buttons while it
//    is up, and has to know when to step aside. The panel announces every open
//    and shut as a window event, parks the latest answer on `window` for
//    anything that mounts late, and marks the root element with
//    data-cactus-cart-drawer="open" for a stylesheet that would rather not
//    listen at all.
//
// 2. Extra buttons at the foot of the panel, under "View full basket". A module
//    registers a client component in a small registry on `window` and the panel
//    draws it, with a `close` prop to shut the basket first if the button takes
//    the shopper somewhere else. Shop draws them in registration order and
//    knows nothing about what they are. A module whose own widget is not on the
//    page simply never registers, so there is nothing to draw.
//
// Plain browser seams, no import in either direction, for the same reason the
// variant-selection seam is one (see OrderSizeDeductionClient): a module that
// imported shop's files would break the build on an install without shop, and
// shop naming another module would ship that knowledge to every shop without
// it. A registering module declares the names below itself rather than
// importing them; this file is the contract it copies.
//
// Registered buttons are drawn inside the panel, so they should wear its chrome
// rather than their own geometry: the class `scd-extra` (cart-drawer-css.ts) is
// full width and the same height and corner radius as the panel's own buttons.
// Colours are the registering module's own business.
//
// Plain module, no 'use client': the names are read by client components only,
// but a shared constant in a directive file becomes a throwing proxy the moment
// anything server-side touches it.
import type { ComponentType } from 'react'

export const CART_DRAWER_STATE_EVENT = 'cactus-shop:cart-drawer'
export const CART_DRAWER_OPEN_KEY = '__cactusCartDrawerOpen'
export const CART_DRAWER_ROOT_ATTRIBUTE = 'data-cactus-cart-drawer'

export const CART_DRAWER_EXTRAS_EVENT = 'cactus-shop:cart-drawer-extras'
export const CART_DRAWER_EXTRAS_KEY = '__cactusCartDrawerExtras'

export type CartDrawerExtraProps = {
  /** Shuts the basket. Call it before taking the shopper anywhere else. */
  close: () => void
}

/** id -> component. Replaced whole, never mutated, on every change - so the
 *  object itself is a stable snapshot until something registers or leaves. */
export type CartDrawerExtras = Readonly<Record<string, ComponentType<CartDrawerExtraProps>>>

type SeamWindow = {
  [CART_DRAWER_OPEN_KEY]?: boolean
  [CART_DRAWER_EXTRAS_KEY]?: CartDrawerExtras
}

const NO_EXTRAS: CartDrawerExtras = Object.freeze({})

export function publishCartDrawerOpen(open: boolean): void {
  ;(window as unknown as SeamWindow)[CART_DRAWER_OPEN_KEY] = open
  if (open) document.documentElement.setAttribute(CART_DRAWER_ROOT_ATTRIBUTE, 'open')
  else document.documentElement.removeAttribute(CART_DRAWER_ROOT_ATTRIBUTE)
  window.dispatchEvent(new CustomEvent(CART_DRAWER_STATE_EVENT, { detail: { open } }))
}

export function readCartDrawerExtras(): CartDrawerExtras {
  return (window as unknown as SeamWindow)[CART_DRAWER_EXTRAS_KEY] ?? NO_EXTRAS
}

export function serverCartDrawerExtras(): CartDrawerExtras {
  return NO_EXTRAS
}

export function subscribeCartDrawerExtras(onChange: () => void): () => void {
  window.addEventListener(CART_DRAWER_EXTRAS_EVENT, onChange)
  return () => window.removeEventListener(CART_DRAWER_EXTRAS_EVENT, onChange)
}
