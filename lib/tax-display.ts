// Server half of price-display tax (see ./tax-display-shared for the why and the
// arithmetic). Its job is to answer "what rate applies to this product" once per
// page rather than once per card, and to do no work at all on a shop that has
// left the setting alone.
//
// The rate comes from the shop's DEFAULT zone - the same zone the basket quotes
// tax against before a shopper has given an address (see getDefaultTaxZoneId).
// A catalogue price has to be printed long before anyone knows where the parcel
// is going, so there is no more honest answer available; the checkout still
// resolves the real zone from the delivery postcode and charges from that.
import { getShopConfigCached } from '@/modules/shop/lib/config'
import { getDefaultTaxZoneId, listTaxZoneRates } from '@/modules/shop/lib/db/tax-shipping'
import {
  DEFAULT_PRICE_DISPLAY,
  displayAmount,
  displayIncludesTax,
  displayPriceFactor,
  type PriceDisplay,
} from '@/modules/shop/lib/tax-display-shared'
import type { ProductTaxView, TaxViewSwitch } from '@/modules/shop/lib/tax-view-shared'
import type { ShpConfig } from '@/modules/shop/lib/config'

export type TaxDisplay = {
  display: PriceDisplay
  /** Rate per tax-class id in the default zone. A class that is absent, and a
   *  product with no class at all, is zero-rated. */
  rates: Map<string, number>
  /** The shopper's with/without VAT switch, or null where the shop has it off
   *  (lib/tax-view-shared.ts). Figures are still printed on `display`'s side;
   *  this only says the other side is to be printed beside them. */
  taxSwitch: TaxViewSwitch | null
}

/** An inert resolution: print what is stored, say nothing. Used as the answer on
 *  a shop that has not switched the setting on, and as the fallback anywhere the
 *  config could not be read. */
export const NO_TAX_DISPLAY: TaxDisplay = { display: DEFAULT_PRICE_DISPLAY, rates: new Map(), taxSwitch: null }

/** The switch as the shop has set it up, or null where it is off. The side a page
 *  opens on is the side the shop prints, so the suffix already worded for that
 *  side is that side's note, and the switch's own suffix words the other. */
function resolveTaxSwitch(config: ShpConfig, display: PriceDisplay): TaxViewSwitch | null {
  if (!config.priceDisplayTaxSwitch) return null
  const opensIncluding = displayIncludesTax(display)
  const openingNote = display.suffix
  const switchedNote = config.priceDisplayTaxSwitchSuffix.trim()
  return {
    defaultSide: opensIncluding ? 'inc' : 'ex',
    includingNote: opensIncluding ? openingNote : switchedNote,
    excludingNote: opensIncluding ? switchedNote : openingNote,
    showIncludingLabel: config.priceDisplayTaxSwitchIncludingLabel.trim() || 'Show prices including VAT',
    showExcludingLabel: config.priceDisplayTaxSwitchExcludingLabel.trim() || 'Show prices excluding VAT',
  }
}

export async function resolveTaxDisplay(): Promise<TaxDisplay> {
  const config = await getShopConfigCached()
  const display: PriceDisplay = {
    mode: config.priceDisplayTax,
    storedIncludesTax: config.taxMode === 'INCLUSIVE',
    suffix: config.priceDisplayTaxSuffix.trim(),
  }
  const taxSwitch = resolveTaxSwitch(config, display)
  // Nothing to convert: skip the zone and rate queries entirely rather than
  // loading a rate table every grid render for a multiply by one.
  //
  // Two jobs need the rates, not one. The storefront needs them to PRINT a
  // converted figure, which is the `mode` question. Structured data needs them
  // to publish a TAX-INCLUSIVE figure (makeGrossAdjuster below) whatever the
  // storefront prints - and a shop keeping its prices net needs that even on
  // 'AS_ENTERED', where it prints exactly what is stored and converts nothing.
  // So the skip is "stored gross and printing what is stored", which is the
  // default shop and still costs it no queries at all.
  //
  // A third job joined them: the shopper's switch prints the other side beside
  // every figure, at each product's own rate, whatever the storefront opens on.
  if (display.mode === 'AS_ENTERED' && display.storedIncludesTax && !taxSwitch) return { display, rates: new Map(), taxSwitch }

  const zoneId = await getDefaultTaxZoneId()
  if (!zoneId) return { display, rates: new Map(), taxSwitch }
  const rates = new Map<string, number>()
  for (const rate of await listTaxZoneRates(zoneId)) {
    const value = Number(rate.rate)
    if (Number.isFinite(value)) rates.set(rate.taxClassId, value)
  }
  return { display, rates, taxSwitch }
}

/** This product's display tax rate, as a fraction. */
export function taxDisplayRate(taxDisplay: TaxDisplay, taxClassId: string | null | undefined): number {
  return taxClassId ? taxDisplay.rates.get(taxClassId) ?? 0 : 0
}

/** The shopper's switch for one product, ready to hand to a price that prints
 *  both sides - or null where the shop has the switch off. */
export function productTaxView(taxDisplay: TaxDisplay, taxClassId: string | null | undefined): ProductTaxView | null {
  if (!taxDisplay.taxSwitch) return null
  return { ...taxDisplay.taxSwitch, rate: taxDisplayRate(taxDisplay, taxClassId) }
}

/** The multiplier for one product, ready to hand to a client island that has to
 *  reprice as a shopper picks options. 1 whenever nothing needs converting. */
export function taxDisplayFactor(taxDisplay: TaxDisplay, taxClassId: string | null | undefined): number {
  return displayPriceFactor(taxDisplay.display, taxDisplayRate(taxDisplay, taxClassId))
}

/** A one-product converter for the server-rendered price blocks. Returns null
 *  when there is nothing to do, so callers can skip the mapping altogether. */
export function makeDisplayAdjuster(
  taxDisplay: TaxDisplay,
  taxClassId: string | null | undefined,
): ((amount: number) => number) | null {
  const rate = taxDisplayRate(taxDisplay, taxClassId)
  if (displayPriceFactor(taxDisplay.display, rate) === 1) return null
  return (amount: number) => displayAmount(amount, taxDisplay.display, rate)
}

/**
 * A one-product converter to the TAX-INCLUSIVE figure, whatever the storefront
 * happens to print. Returns null when the stored figure already carries tax, or
 * the line is zero-rated, so callers can skip the mapping altogether.
 *
 * Separate from makeDisplayAdjuster above because the two answer different
 * questions and a shop selling to businesses answers them differently. The page
 * prints what the owner chose - net, with "ex. VAT" beside it, on a trade
 * catalogue. Structured data has no such latitude: a shopping channel compares
 * it against the feed, and a feed quoting UK shoppers has to quote them gross.
 * Publishing the printed figure there is how a correct feed still gets an item
 * pulled for a price mismatch.
 */
export function makeGrossAdjuster(
  taxDisplay: TaxDisplay,
  taxClassId: string | null | undefined,
): ((amount: number) => number) | null {
  const rate = taxDisplayRate(taxDisplay, taxClassId)
  // The same arithmetic the storefront runs, asked with the mode pinned to
  // INCLUSIVE. Reused rather than rewritten as `amount * (1 + rate)` so the
  // rounding is identical to every other price the shop prints - a penny of
  // drift between the feed and the markup is the very mismatch this fixes.
  const gross: PriceDisplay = { ...taxDisplay.display, mode: 'INCLUSIVE' }
  if (displayPriceFactor(gross, rate) === 1) return null
  return (amount: number) => displayAmount(amount, gross, rate)
}

export { displayAmount, displayPriceFactor }
