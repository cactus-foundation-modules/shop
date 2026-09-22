import { describe, it, expect } from 'vitest'
import { decideShippingZone } from '@/modules/shop/lib/db/tax-shipping'
import { refusesDelivery } from '@/modules/shop/lib/excluded-postcode'

// Which zone a shopper lands in, and - the part that is new and the part that
// can quietly cost money - what it means when they land in none of them.
//
// The failure this guards against is not a wrong tax rate. It is an order from
// a postcode the shop does not deliver to going through anyway, with no
// delivery option chosen and nothing charged to carry the goods, because "no
// zone" used to be indistinguishable from "shop not set up yet".

const zone = (name: string, postcodes: string[] = [], excludedPostcodes: string[] = []) =>
  ({ name, postcodes, excludedPostcodes })

const HIGHLANDS = ['AB30-AB32', 'IV1-IV56', 'KW1-KW17', 'PA20-PA78', 'PH10-PH26', 'PO30-PO41', 'BT1-BT94']

describe('decideShippingZone', () => {
  it('puts a shopper in the catch-all when nothing more specific matches', () => {
    const zones = [zone('UK'), zone('London', ['SW', 'SE'])]
    expect(decideShippingZone(zones, 'M1 1AE').zone?.name).toBe('UK')
  })

  it('prefers the most specific rule over the catch-all', () => {
    const zones = [zone('UK'), zone('London', ['SW', 'SE'])]
    expect(decideShippingZone(zones, 'SW1A 1AA').zone?.name).toBe('London')
  })

  it('prefers the longer of two matching prefixes', () => {
    const zones = [zone('South', ['SW']), zone('Westminster', ['SW1A'])]
    expect(decideShippingZone(zones, 'SW1A 1AA').zone?.name).toBe('Westminster')
  })

  // The whole point of the excluded list: a catch-all that a shopper is carved
  // out of has to lose, or the carve-out carves nothing.
  it('takes an excluded postcode out of the catch-all', () => {
    const zones = [zone('Mainland UK', [], HIGHLANDS)]
    expect(decideShippingZone(zones, 'IV51 9XX')).toEqual({ zone: null, excluded: true, uncovered: false })
    expect(decideShippingZone(zones, 'M1 1AE').zone?.name).toBe('Mainland UK')
  })

  it('takes an excluded postcode out of a zone that also lists it', () => {
    // A contradictory pair on one zone. Excluded wins, which is the reading an
    // owner means when they add a line to the excluded box.
    const zones = [zone('Scotland', ['AB', 'IV'], ['AB30-AB32'])]
    expect(decideShippingZone(zones, 'AB31 1AA')).toEqual({ zone: null, excluded: true, uncovered: false })
    expect(decideShippingZone(zones, 'AB39 1AA').zone?.name).toBe('Scotland')
  })

  // Excluded from the cheap zone, picked up by the expensive one. This is the
  // arrangement a shop makes when it WILL deliver to the islands, for more, and
  // it must not read as a refusal.
  it('is not a refusal when another zone picks the shopper up', () => {
    const zones = [
      zone('Mainland UK', [], HIGHLANDS),
      zone('Highlands and islands', HIGHLANDS),
    ]
    const decision = decideShippingZone(zones, 'IV51 9XX')
    expect(decision.zone?.name).toBe('Highlands and islands')
    expect(decision.excluded).toBe(false)
  })

  it('is a refusal when every zone that could serve them excludes them', () => {
    const zones = [
      zone('Mainland UK', [], HIGHLANDS),
      zone('Scotland', ['AB', 'IV', 'PH'], HIGHLANDS),
    ]
    expect(decideShippingZone(zones, 'PH20 1AA')).toEqual({ zone: null, excluded: true, uncovered: false })
  })

  // A new install has no zones at all. That is not a delivery-area decision and
  // must never show a shopper a "we do not deliver there" message.
  it('does not call a shop with no zones a refusal', () => {
    expect(decideShippingZone([], 'IV51 9XX')).toEqual({ zone: null, excluded: false, uncovered: false })
  })

  // A shop with zones that simply do not reach this shopper, and no exclusion
  // anywhere. Not an exclusion - nobody named the postcode - but off the edge of
  // the map the owner drew, which the checkout needs told apart from both "no
  // map yet" above and "named and refused". What it then does is refusesDelivery's.
  it('calls an unmatched postcode uncovered, not excluded, when nothing excluded it', () => {
    const zones = [zone('London', ['SW', 'SE'])]
    expect(decideShippingZone(zones, 'M1 1AE')).toEqual({ zone: null, excluded: false, uncovered: true })
  })

  it('never calls a postcode uncovered while a catch-all is there to take it', () => {
    const zones = [zone('London', ['SW', 'SE']), zone('Everywhere else')]
    const decision = decideShippingZone(zones, 'M1 1AE')
    expect(decision.zone?.name).toBe('Everywhere else')
    expect(decision.uncovered).toBe(false)
  })

  it('keeps PO3 on the mainland while excluding the Isle of Wight', () => {
    const zones = [zone('Mainland UK', [], HIGHLANDS)]
    expect(decideShippingZone(zones, 'PO3 5JT').zone?.name).toBe('Mainland UK')
    expect(decideShippingZone(zones, 'PO31 8QU')).toEqual({ zone: null, excluded: true, uncovered: false })
  })

  it('uses the first catch-all when an owner has left two lying about', () => {
    const zones = [zone('First'), zone('Second')]
    expect(decideShippingZone(zones, 'M1 1AE').zone?.name).toBe('First')
  })
})

// What the checkout does with that decision. An order from off the edge of the
// map used to go through with nothing charged to carry it and no zone to take a
// VAT rate from; now it is turned away - but only where there is a parcel.
describe('refusesDelivery', () => {
  const physical = { product: { type: 'PHYSICAL' as const } }
  const download = { product: { type: 'DIGITAL' as const } }
  const service = { product: { type: 'SERVICE' as const } }
  const landed = { excluded: false, uncovered: false }
  const excluded = { excluded: true, uncovered: false }
  const uncovered = { excluded: false, uncovered: true }

  it('lets a postcode that landed in a zone through', () => {
    expect(refusesDelivery(landed, [physical])).toBe(false)
  })

  it('refuses an excluded postcode whatever is in the basket, as it always has', () => {
    expect(refusesDelivery(excluded, [physical])).toBe(true)
    expect(refusesDelivery(excluded, [download])).toBe(true)
  })

  it('refuses an uncovered postcode when there is something to carry there', () => {
    expect(refusesDelivery(uncovered, [download, physical])).toBe(true)
  })

  it('lets downloads and services through from anywhere', () => {
    expect(refusesDelivery(uncovered, [download, service])).toBe(false)
  })

  // The shop-with-no-zones case, end to end: decideShippingZone never calls it
  // uncovered, so a new install carries on taking orders.
  it('never refuses a shop that has no zones yet', () => {
    expect(refusesDelivery(decideShippingZone([], 'M1 1AE'), [physical])).toBe(false)
  })
})
