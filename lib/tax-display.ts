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
  displayPriceFactor,
  type PriceDisplay,
} from '@/modules/shop/lib/tax-display-shared'

export type TaxDisplay = {
  display: PriceDisplay
  /** Rate per tax-class id in the default zone. A class that is absent, and a
   *  product with no class at all, is zero-rated. */
  rates: Map<string, number>
}

/** An inert resolution: print what is stored, say nothing. Used as the answer on
 *  a shop that has not switched the setting on, and as the fallback anywhere the
 *  config could not be read. */
export const NO_TAX_DISPLAY: TaxDisplay = { display: DEFAULT_PRICE_DISPLAY, rates: new Map() }

export async function resolveTaxDisplay(): Promise<TaxDisplay> {
  const config = await getShopConfigCached()
  const display: PriceDisplay = {
    mode: config.priceDisplayTax,
    storedIncludesTax: config.taxMode === 'INCLUSIVE',
    suffix: config.priceDisplayTaxSuffix.trim(),
  }
  // Nothing to convert: skip the zone and rate queries entirely rather than
  // loading a rate table every grid render for a multiply by one.
  if (display.mode === 'AS_ENTERED') return { display, rates: new Map() }

  const zoneId = await getDefaultTaxZoneId()
  if (!zoneId) return { display, rates: new Map() }
  const rates = new Map<string, number>()
  for (const rate of await listTaxZoneRates(zoneId)) {
    const value = Number(rate.rate)
    if (Number.isFinite(value)) rates.set(rate.taxClassId, value)
  }
  return { display, rates }
}

/** This product's display tax rate, as a fraction. */
export function taxDisplayRate(taxDisplay: TaxDisplay, taxClassId: string | null | undefined): number {
  return taxClassId ? taxDisplay.rates.get(taxClassId) ?? 0 : 0
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

export { displayAmount, displayPriceFactor }
