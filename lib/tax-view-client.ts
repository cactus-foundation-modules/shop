// The browser half of the shopper's VAT switch (see ./tax-view-shared for the
// pattern). Reads and writes the choice, and lets the few bits of text that
// cannot be printed as a span pair - an <option>, a tooltip - follow it too.

import { useSyncExternalStore } from 'react'
import {
  parseTaxViewSide,
  TAX_VIEW_CHANGE_EVENT,
  TAX_VIEW_CSS,
  TAX_VIEW_ROOT_ATTRIBUTE,
  TAX_VIEW_STORAGE_KEY,
  TAX_VIEW_STYLE_ID,
  type TaxViewSide,
} from '@/modules/shop/lib/tax-view-shared'

/** The side the page is showing: the attribute the boot script set, or the
 *  shop's default where it has not run. */
export function currentTaxViewSide(defaultSide: TaxViewSide): TaxViewSide {
  if (typeof document === 'undefined') return defaultSide
  return parseTaxViewSide(document.documentElement.getAttribute(TAX_VIEW_ROOT_ATTRIBUTE)) ?? defaultSide
}

function ensureTaxViewStyle(): void {
  if (document.getElementById(TAX_VIEW_STYLE_ID)) return
  const style = document.createElement('style')
  style.id = TAX_VIEW_STYLE_ID
  style.textContent = TAX_VIEW_CSS
  document.head.appendChild(style)
}

/** Shows every switchable figure on the page on `side`, and keeps the choice. */
export function applyTaxViewSide(side: TaxViewSide): void {
  ensureTaxViewStyle()
  document.documentElement.setAttribute(TAX_VIEW_ROOT_ATTRIBUTE, side)
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
