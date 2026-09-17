// The browser half of the shopper's VAT switch (see ./tax-view-shared for the
// pattern). Reads and writes the choice, and lets the few bits of text that
// cannot be printed as a span pair - an <option>, a tooltip - follow it too.
//
// The choice is read from and written to the stylesheet the boot script made,
// never an attribute on <html> - see ./tax-view-shared for why that matters.

import { useSyncExternalStore } from 'react'
import {
  parseTaxViewSide,
  TAX_VIEW_CHANGE_EVENT,
  TAX_VIEW_STATE_ATTRIBUTE,
  TAX_VIEW_STORAGE_KEY,
  TAX_VIEW_STYLE_ID,
  taxViewCss,
  type TaxViewSide,
} from '@/modules/shop/lib/tax-view-shared'

/** The side the page is showing: the one the stylesheet was written for, or the
 *  shop's default where the boot script has not run. */
export function currentTaxViewSide(defaultSide: TaxViewSide): TaxViewSide {
  if (typeof document === 'undefined') return defaultSide
  const style = document.getElementById(TAX_VIEW_STYLE_ID)
  return parseTaxViewSide(style?.getAttribute(TAX_VIEW_STATE_ATTRIBUTE)) ?? defaultSide
}

function writeTaxViewStyle(side: TaxViewSide): void {
  let style = document.getElementById(TAX_VIEW_STYLE_ID)
  if (!style) {
    style = document.createElement('style')
    style.id = TAX_VIEW_STYLE_ID
    document.head.appendChild(style)
  }
  style.setAttribute(TAX_VIEW_STATE_ATTRIBUTE, side)
  style.textContent = taxViewCss(side)
}

/** Shows every switchable figure on the page on `side`, and keeps the choice. */
export function applyTaxViewSide(side: TaxViewSide): void {
  writeTaxViewStyle(side)
  // Storage can be missing or refuse writes (a private window, blocked site
  // data). The page still switches; it just forgets by the next visit.
  try {
    window.localStorage.setItem(TAX_VIEW_STORAGE_KEY, side)
  } catch {
    // Nothing to do - see above.
  }
  window.dispatchEvent(new CustomEvent<TaxViewSide>(TAX_VIEW_CHANGE_EVENT, { detail: side }))
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(TAX_VIEW_CHANGE_EVENT, onChange)
  return () => window.removeEventListener(TAX_VIEW_CHANGE_EVENT, onChange)
}

/**
 * The side the shopper is looking at, for text that cannot carry both figures.
 * Renders the shop's default on the server and during hydration - the cached
 * page cannot know the shopper - and settles on their choice straight after.
 * Anything that CAN be a span pair should be one (TaxViewText), which is right
 * from the first paint.
 */
export function useTaxViewSide(defaultSide: TaxViewSide): TaxViewSide {
  return useSyncExternalStore(
    subscribe,
    () => currentTaxViewSide(defaultSide),
    () => defaultSide,
  )
}
