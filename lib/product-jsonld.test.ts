import { describe, expect, it } from 'vitest'
import { buildProductJsonLd, type ShopProductJsonLdInput } from './product-jsonld'

const base: ShopProductJsonLdInput = {
  name: 'Eclipse Plus Task Chair',
  images: ['https://example.test/a.webp'],
  currency: 'GBP',
  availability: 'https://schema.org/InStock',
  price: '73.00',
}

const build = (over: Partial<ShopProductJsonLdInput> = {}) =>
  buildProductJsonLd({ ...base, ...over }) as Record<string, any>

describe('buildProductJsonLd', () => {
  it('is null without a name, and only then', () => {
    expect(buildProductJsonLd({ ...base, name: '  ' })).toBeNull()
    expect(buildProductJsonLd(base)).not.toBeNull()
  })

  it('publishes a plain Offer for a single-priced product', () => {
    const offers = build().offers
    expect(offers['@type']).toBe('Offer')
    expect(offers.price).toBe('73.00')
    expect(offers.priceCurrency).toBe('GBP')
    expect(offers.availability).toBe('https://schema.org/InStock')
  })

  it('anchors itself and its offer on the product url when it has one', () => {
    const out = build({ url: 'https://example.test/chair' })
    expect(out['@id']).toBe('https://example.test/chair#product')
    expect(out.url).toBe('https://example.test/chair')
    expect(out.offers.url).toBe('https://example.test/chair')
  })

  it('omits the url and the @id rather than inventing one', () => {
    const out = build({ url: null })
    expect(out['@id']).toBeUndefined()
    expect(out.url).toBeUndefined()
    expect(out.offers.url).toBeUndefined()
  })

  describe('identifiers', () => {
    it('publishes brand as an object and condition as a schema.org member', () => {
      const out = build({ identifiers: { brand: 'Dynamic', gtin: '5012345678900', mpn: 'KC0014', condition: 'NewCondition' } })
      expect(out.brand).toEqual({ '@type': 'Brand', name: 'Dynamic' })
      expect(out.gtin).toBe('5012345678900')
      expect(out.mpn).toBe('KC0014')
      expect(out.itemCondition).toBe('https://schema.org/NewCondition')
    })

    it('publishes nothing for a fact nobody supplied', () => {
      const out = build({ identifiers: { brand: null, gtin: '  ', mpn: undefined, condition: null } })
      for (const key of ['brand', 'gtin', 'mpn', 'itemCondition']) expect(out[key]).toBeUndefined()
    })
  })

  describe('a listing whose combinations carry the money', () => {
    it('publishes an AggregateOffer with the whole range', () => {
      const offers = build({ price: null, lowPrice: '73.00', highPrice: '156.00', offerCount: 536 }).offers
      expect(offers['@type']).toBe('AggregateOffer')
      expect(offers.lowPrice).toBe('73.00')
      expect(offers.highPrice).toBe('156.00')
      expect(offers.offerCount).toBe(536)
    })

    it('never claims a range of one figure', () => {
      const offers = build({ price: null, lowPrice: '73.00', highPrice: '73.00', offerCount: 0 }).offers
      expect(offers.highPrice).toBeUndefined()
      expect(offers.offerCount).toBeUndefined()
    })

    it('copes with a pricing module too old to know the top of the range', () => {
      const offers = build({ price: null, lowPrice: '73.00' }).offers
      expect(offers['@type']).toBe('AggregateOffer')
      expect(offers.lowPrice).toBe('73.00')
      expect(offers.highPrice).toBeUndefined()
    })
  })

  describe('delivery services', () => {
    const shipping = [
      { label: 'Flat-Pack', description: 'Delivered flat-pack', price: '0.00', handlingDays: 2, transitDays: 5 },
      { label: 'Installation', description: null, price: '37.95', handlingDays: 0, transitDays: 10 },
    ]

    it('publishes one OfferShippingDetails per service, free ones included', () => {
      const details = build({ shipping, shippingCountry: 'GB' }).offers.shippingDetails
      expect(details).toHaveLength(2)
      expect(details[0].name).toBe('Flat-Pack')
      expect(details[0].description).toBe('Delivered flat-pack')
      expect(details[0].shippingRate).toEqual({ '@type': 'MonetaryAmount', value: '0.00', currency: 'GBP' })
      expect(details[0].shippingDestination).toEqual({ '@type': 'DefinedRegion', addressCountry: 'GB' })
      expect(details[1].description).toBeUndefined()
    })

    it('states each count as the range Google insists on', () => {
      const time = build({ shipping }).offers.shippingDetails[0].deliveryTime
      expect(time.handlingTime).toEqual({ '@type': 'QuantitativeValue', minValue: 2, maxValue: 2, unitCode: 'DAY' })
      expect(time.transitTime).toEqual({ '@type': 'QuantitativeValue', minValue: 5, maxValue: 5, unitCode: 'DAY' })
    })

    it('omits the destination rather than guessing a country', () => {
      const details = build({ shipping, shippingCountry: null }).offers.shippingDetails
      expect(details[0].shippingDestination).toBeUndefined()
    })

    it('publishes nothing at all where no service was offered', () => {
      expect(build({ shipping: [] }).offers.shippingDetails).toBeUndefined()
    })
  })

  describe('returns', () => {
    it('publishes a refusal, with the shop’s own wording', () => {
      const policy = build({ nonReturnableNote: 'Made to order, so it cannot come back.' }).offers.hasMerchantReturnPolicy
      expect(policy.returnPolicyCategory).toBe('https://schema.org/MerchantReturnNotPermitted')
      expect(policy.description).toBe('Made to order, so it cannot come back.')
    })

    it('says nothing about a returnable product, leaving the organisation policy to it', () => {
      expect(build({ nonReturnableNote: null }).offers.hasMerchantReturnPolicy).toBeUndefined()
    })
  })

  describe('ratings', () => {
    it('publishes the average, the count and the scale', () => {
      const rating = build({ rating: { value: '4.4', count: 440, best: 5 } }).aggregateRating
      expect(rating).toEqual({
        '@type': 'AggregateRating',
        ratingValue: '4.4',
        reviewCount: 440,
        bestRating: 5,
        worstRating: 1,
      })
    })

    it('never publishes a rating nobody gave', () => {
      expect(build({ rating: { value: '0.0', count: 0, best: 5 } }).aggregateRating).toBeUndefined()
      expect(build({ rating: null }).aggregateRating).toBeUndefined()
    })
  })

  describe('a shop that withholds its prices', () => {
    const hidden = (over: Partial<ShopProductJsonLdInput> = {}) =>
      build({ hidePrices: true, strikethrough: '187.00', shipping: [
        { label: 'Flat-Pack', description: null, price: '0.00', handlingDays: 2, transitDays: 5 },
      ], nonReturnableNote: 'Bespoke.', ...over })

    it('publishes no figure and no comparison', () => {
      const offers = hidden().offers
      expect(offers.price).toBeUndefined()
      expect(offers.lowPrice).toBeUndefined()
      expect(offers.priceCurrency).toBeUndefined()
      expect(offers.priceSpecification).toBeUndefined()
    })

    it('still says how it arrives and whether it can come back', () => {
      const offers = hidden().offers
      expect(offers.availability).toBe('https://schema.org/InStock')
      expect(offers.shippingDetails).toHaveLength(1)
      expect(offers.hasMerchantReturnPolicy).toBeDefined()
    })

    it('hides the range on a variations listing too', () => {
      const offers = hidden({ price: null, lowPrice: '73.00', highPrice: '156.00', offerCount: 9 }).offers
      expect(offers['@type']).toBe('AggregateOffer')
      expect(offers.lowPrice).toBeUndefined()
      expect(offers.highPrice).toBeUndefined()
      expect(offers.offerCount).toBeUndefined()
    })
  })

  it('publishes the strikethrough a page is showing', () => {
    const spec = build({ strikethrough: '187.00' }).offers.priceSpecification
    expect(spec.priceType).toBe('https://schema.org/StrikethroughPrice')
    expect(spec.price).toBe('187.00')
    expect(spec.priceCurrency).toBe('GBP')
  })
})
