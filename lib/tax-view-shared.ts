// The shopper's own "with or without VAT" switch, as opposed to the shop's.
//
// lib/tax-display-shared.ts decides which side of tax the storefront prints by
// default. This lets a shopper flip that for themselves, everywhere at once, and
// keeps the choice for their next visit.
//
// The pattern is a CSS switch rather than a re-render, and that is forced by the
// page cache. Every public page is served from a shared cache, so the server can
// never know which side a particular shopper asked for - reading a cookie there
// would either bust the cache for everyone who chose or serve one shopper's
// choice to the next. So every switchable figure is printed on BOTH sides, the
// side the shop shows by default visible and the other `hidden`, and one small
// stylesheet in <head> decides which of the pair is displayed:
//
//   <style id="shop-tax-view-css" data-shop-tax-view="inc">
//     [data-shop-tax-side="ex"]{display:none!important} ...
//   <span data-shop-tax-side="ex">£97.00</span>
//   <span data-shop-tax-side="inc" hidden>£116.40</span>
//
// That stylesheet is written by a small inline script at the top of every public
// page (lib/head.ts), before anything paints, so a shopper who chose never sees
// the other figure first. Without JavaScript, or before the script has run, the
// `hidden` attribute alone shows the shop's own default - the page is right
// either way.
//
// The choice lives on the <style> element, NOT on <html>, and that is the whole
// of a bug fix. It first went on <html> as an attribute, the way core's dark mode
// does, and shoppers had to press the link again on every page: React owns <html>
// as a "singleton", and whenever it takes the element over on the client (after
// recovering from a hydration mismatch, for one) it strips every attribute it did
// not render itself (react-dom's commitHostSingletonAcquisition). A <style> it
// did not render, sat in <head>, is one of the few things React deliberately
// leaves alone - along with scripts and stylesheet links - so the choice survives
// whatever React does to the page around it.
//
// Client-safe: no database, no next. The browser half (reading and writing the
// choice) is ./tax-view-client, the markup is components/public/TaxView*.

export const TAX_VIEW_SIDES = ['inc', 'ex'] as const
export type TaxViewSide = (typeof TAX_VIEW_SIDES)[number]

/** Where the shopper's choice is kept between visits. */
export const TAX_VIEW_STORAGE_KEY = 'cactus-shop-tax-view'
/** On each printed figure: which side of tax that copy of it is. */
export const TAX_VIEW_FIGURE_ATTRIBUTE = 'data-shop-tax-side'
/** The one <style> element that shows the shopper's side (see taxViewCss). */
export const TAX_VIEW_STYLE_ID = 'shop-tax-view-css'
/** On that <style> element: which side it is showing, for code that has to ask. */
export const TAX_VIEW_STATE_ATTRIBUTE = 'data-shop-tax-view'
/** Fired on window when the shopper flips the switch, for text a span pair
 *  cannot carry (an <option>, a title). See useTaxViewSide. */
export const TAX_VIEW_CHANGE_EVENT = 'cactus-shop-tax-view-change'

/** The switch as the shop has set it up, site-wide. Null anywhere it is off. */
export type TaxViewSwitch = {
  /** The side every page shows before a shopper has chosen - the shop's own. */
  defaultSide: TaxViewSide
  /** Wording beside a figure without tax ("+ VAT"). '' for none. */
  excludingNote: string
  /** Wording beside a figure with tax in it ("inc. VAT"). '' for none. */
  includingNote: string
  /** The link offering tax-inclusive figures, shown while they are hidden. */
  showIncludingLabel: string
  /** The link offering figures without tax, shown while those are hidden. */
  showExcludingLabel: string
}

/** The switch as one product needs it: the site-wide wording, plus the rate that
 *  turns this product's figures from one side to the other. */
export type ProductTaxView = TaxViewSwitch & {
  /** This product's tax rate as a fraction (0.2). 0 for a zero-rated line. */
  rate: number
}

/** Both sides of one figure. */
export type TaxViewAmounts = { inc: number; ex: number }

export function parseTaxViewSide(value: unknown): TaxViewSide | null {
  return value === 'inc' || value === 'ex' ? value : null
}

export function otherTaxViewSide(side: TaxViewSide): TaxViewSide {
  return side === 'inc' ? 'ex' : 'inc'
}

function roundToPenny(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100) / 100
}

/**
 * Both sides of a figure, given the one the shop prints by default.
 *
 * Worked out from the PRINTED figure rather than the stored one, deliberately.
 * The printed figure is what every surface already holds - a card, a variation
 * payload, an add-on price - so deriving from it means a card and a product page
 * can never quote the same product a penny apart on the switched side. The
 * default side is always exact. The switched side is exact whenever the shop
 * prints the side it stores (a net shop printing net, as Deskwell does); a shop
 * printing the opposite of what it stores can see its switched side a rounding
 * penny away from the stored figure. The till charges from the stored figure
 * either way.
 */
export function taxViewAmounts(printed: number, view: Pick<ProductTaxView, 'defaultSide' | 'rate'>): TaxViewAmounts {
  const rate = Number.isFinite(view.rate) && view.rate > 0 ? view.rate : 0
  if (rate === 0) return { inc: printed, ex: printed }
  return view.defaultSide === 'inc'
    ? { inc: printed, ex: roundToPenny(printed / (1 + rate)) }
    : { ex: printed, inc: roundToPenny(printed * (1 + rate)) }
}

/** One figure on the side named. */
export function taxViewAmount(printed: number, view: Pick<ProductTaxView, 'defaultSide' | 'rate'>, side: TaxViewSide): number {
  return taxViewAmounts(printed, view)[side]
}

/**
 * The stylesheet that shows `side` and hides the other. The `!important` on
 * display is what beats the `hidden` attribute the non-default side is printed
 * with, and what stops a price block's own rules from showing both.
 */
export function taxViewCss(side: TaxViewSide): string {
  const hidden = otherTaxViewSide(side)
  return (
    `[${TAX_VIEW_FIGURE_ATTRIBUTE}="${hidden}"]{display:none!important}` +
    `[${TAX_VIEW_FIGURE_ATTRIBUTE}="${side}"]{display:inline!important}`
  )
}

/**
 * The inline script that writes the shopper's saved side into the stylesheet
 * before the page paints. Plain ES5 and self-contained: it runs parser-blocking
 * at the top of the body, long before any bundle.
 *
 * The same steps as applyTaxViewSide in ./tax-view-client, which the switch runs
 * when clicked. Both are covered by tax-view-shared.test.ts, which runs this
 * string for real. Both stylesheets are embedded rather than built in the
 * browser, so the CSS the page gets is exactly taxViewCss's.
 */
export function taxViewBootScript(defaultSide: TaxViewSide): string {
  const key = JSON.stringify(TAX_VIEW_STORAGE_KEY)
  const styleId = JSON.stringify(TAX_VIEW_STYLE_ID)
  const stateAttribute = JSON.stringify(TAX_VIEW_STATE_ATTRIBUTE)
  const cssBySide = JSON.stringify({ inc: taxViewCss('inc'), ex: taxViewCss('ex') })
  const fallback = JSON.stringify(defaultSide)
  return (
    `(function(){var d=document,v=null;` +
    `try{v=window.localStorage.getItem(${key})}catch(e){}` +
    `if(v!=="inc"&&v!=="ex")v=${fallback};` +
    `var s=d.getElementById(${styleId});` +
    `if(!s){s=d.createElement("style");s.id=${styleId};d.head.appendChild(s)}` +
    `s.setAttribute(${stateAttribute},v);s.textContent=${cssBySide}[v];` +
    `})();`
  )
}
