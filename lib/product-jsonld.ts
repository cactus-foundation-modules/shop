// The Product structured data one product page publishes.
//
// Pulled out of ShopProductDetail.rsc.tsx and made pure so it can be exercised
// on its own: this is the markup search engines and shopping assistants read to
// decide whether to put the shop in front of somebody, and until it was testable
// the only way to check a change to it was to deploy and paste a URL into a
// validator.
//
// Everything here is data the page itself already shows. Nothing is invented and
// nothing is inferred: a fact the caller does not hand over is a property that is
// not published, because a wrong claim in structured data is worse than a missing
// one - it is a mis-price, a delivery promise the shop will not keep, or a star
// rating nobody left.

/** Where a fact came from is the caller's business. All strings, all optional. */
export type ShopProductIdentifiers = {
  /** The make. Not the shop's own name unless the shop really is the brand. */
  brand?: string | null
  /** A real GTIN - EAN, UPC, ISBN. Already validated by whoever supplies it. */
  gtin?: string | null
  /** Manufacturer's part number. */
  mpn?: string | null
  /**
   * One of schema.org's OfferItemCondition names - "NewCondition",
   * "UsedContition" and friends - WITHOUT the schema.org prefix, which this
   * file adds. Null where the shop has not said, and then nothing is published:
   * "new" is the overwhelmingly common answer and still not ours to assume on
   * a shop that might be selling reclaimed furniture.
   */
  condition?: string | null
}

/** One delivery service the product can actually be bought with. The shape the
 *  `shop.product-delivery-timing` extension point hands back, already converted
 *  to the side of tax the page prints on. */
export type ShopShippingOption = {
  label: string
  description?: string | null
  /** Decimal-major-units string, e.g. "4.95". "0.00" is free and is published
   *  as such - a free delivery service is the most quotable fact on the page. */
  price: string
  handlingDays: number
  transitDays: number
}

export type ShopProductRating = {
  /** Mean score, already rounded to however many places the caller wants shown. */
  value: string
  /** How many reviews it is the mean of. Never published as zero: schema.org
   *  reads a ratingCount of nought as a rating nobody gave. */
  count: number
  /** Top of the scale. Five on this shop; said out loud rather than assumed. */
  best: number
}

export type ShopProductJsonLdInput = {
  name: string
  description?: string | undefined
  /** Every photograph, absolute. */
  images: string[]
  /** The product's own canonical address, absolute. Null where the caller could
   *  not work one out, and then no `url` or `@id` is published. */
  url?: string | null
  sku?: string | null
  currency: string
  /** A schema.org availability URL, already chosen by the caller. */
  availability: string

  /** A product with one price. Mutually exclusive with the three below. */
  price?: string | null
  /** A listing whose combinations carry the money: the cheapest, the dearest,
   *  and how many there are. `highPrice` and `offerCount` are optional because
   *  the module that prices the combinations may be older than this field. */
  lowPrice?: string | null
  highPrice?: string | null
  offerCount?: number | null

  /** The "was" figure, where the page is showing one. */
  strikethrough?: string | null
  /** A shop that will not quote its prices publishes none of them here either. */
  hidePrices?: boolean

  identifiers?: ShopProductIdentifiers | null
  shipping?: ShopShippingOption[] | null
  /** ISO 3166 alpha-2 for the country the delivery services above cover. */
  shippingCountry?: string | null
  rating?: ShopProductRating | null
  /**
   * The owner's wording for why this one cannot be sent back, set ONLY on a
   * product that is genuinely non-returnable. A returnable product carries
   * nothing here on purpose: how long the window is and who pays the postage
   * are the shop-wide facts published on the organisation record, and restating
   * a half-remembered version of them on every offer is how the two drift apart.
   */
  nonReturnableNote?: string | null
}

const SCHEMA = 'https://schema.org'

function quantitative(days: number): Record<string, unknown> {
  // minValue and maxValue both, and equal. Google requires a range and reads a
  // bare `value` as no answer at all, so a single honest count is published as
  // the range it is rather than dropped.
  const value = Math.max(0, Math.round(days))
  return { '@type': 'QuantitativeValue', minValue: value, maxValue: value, unitCode: 'DAY' }
}

/** One delivery service as an OfferShippingDetails. */
function shippingDetails(
  option: ShopShippingOption,
  currency: string,
  country: string | null | undefined,
): Record<string, unknown> {
  const description = option.description?.trim()
  return {
    '@type': 'OfferShippingDetails',
    name: option.label,
    ...(description ? { description } : {}),
    shippingRate: { '@type': 'MonetaryAmount', value: option.price, currency },
    // Omitted rather than guessed. A DefinedRegion naming the wrong country is a
    // delivery promise to people the shop will not ship to.
    ...(country ? { shippingDestination: { '@type': 'DefinedRegion', addressCountry: country } } : {}),
    deliveryTime: {
      '@type': 'ShippingDeliveryTime',
      handlingTime: quantitative(option.handlingDays),
      transitTime: quantitative(option.transitDays),
    },
  }
}

/**
 * The return policy for a product that cannot go back.
 *
 * Only ever this one shape. A returnable product is covered by the organisation
 * record's policy, and a shop that has not written one publishes nothing -
 * which is the honest answer, and the one that sends an owner to fill the
 * setting in rather than leaving them believing a default they never chose.
 */
function returnPolicy(note: string): Record<string, unknown> {
  return {
    '@type': 'MerchantReturnPolicy',
    returnPolicyCategory: `${SCHEMA}/MerchantReturnNotPermitted`,
    description: note,
  }
}

function identifierProps(identifiers: ShopProductIdentifiers | null | undefined): Record<string, unknown> {
  if (!identifiers) return {}
  const out: Record<string, unknown> = {}
  const brand = identifiers.brand?.trim()
  const gtin = identifiers.gtin?.trim()
  const mpn = identifiers.mpn?.trim()
  const condition = identifiers.condition?.trim()
  // Brand is an object, not a string. Both parse, and every reference example
  // and every validator output uses the object - which is what an owner will be
  // comparing their markup against when they check it.
  if (brand) out.brand = { '@type': 'Brand', name: brand }
  if (gtin) out.gtin = gtin
  if (mpn) out.mpn = mpn
  if (condition) out.itemCondition = `${SCHEMA}/${condition}`
  return out
}

/**
 * The whole Product block, or null when there is not enough to say - which is a
 * product with no name, and nothing else.
 */
export function buildProductJsonLd(input: ShopProductJsonLdInput): Record<string, unknown> | null {
  const name = input.name?.trim()
  if (!name) return null

  const hidePrices = input.hidePrices === true
  const strikethrough = !hidePrices && input.strikethrough
    ? {
        priceSpecification: {
          '@type': 'UnitPriceSpecification',
          priceType: `${SCHEMA}/StrikethroughPrice`,
          price: input.strikethrough,
          priceCurrency: input.currency,
        },
      }
    : {}

  // Shipping and the return policy survive a shop that withholds its prices:
  // "free, three to five days, cannot be sent back" says nothing about what the
  // thing costs, and it is the half of an offer a shopper most needs.
  const options = input.shipping ?? []
  const shipping = options.length
    ? { shippingDetails: options.map((o) => shippingDetails(o, input.currency, input.shippingCountry)) }
    : {}
  const returns = input.nonReturnableNote?.trim()
    ? { hasMerchantReturnPolicy: returnPolicy(input.nonReturnableNote.trim()) }
    : {}
  const offerUrl = input.url ? { url: input.url } : {}

  const varies = input.lowPrice != null
  const money = hidePrices
    ? {}
    : varies
      ? {
          lowPrice: input.lowPrice,
          // Published only where the module pricing the combinations actually
          // knows them. A highPrice equal to the lowPrice would say the listing
          // has one price, which is the one thing it does not have.
          ...(input.highPrice && input.highPrice !== input.lowPrice ? { highPrice: input.highPrice } : {}),
          ...(input.offerCount && input.offerCount > 0 ? { offerCount: input.offerCount } : {}),
          priceCurrency: input.currency,
        }
      : { price: input.price, priceCurrency: input.currency }

  const offers = {
    '@type': varies ? 'AggregateOffer' : 'Offer',
    ...money,
    availability: input.availability,
    ...offerUrl,
    ...strikethrough,
    ...shipping,
    ...returns,
  }

  const rating = input.rating && input.rating.count > 0
    ? {
        aggregateRating: {
          '@type': 'AggregateRating',
          ratingValue: input.rating.value,
          reviewCount: input.rating.count,
          bestRating: input.rating.best,
          worstRating: 1,
        },
      }
    : {}

  const description = input.description?.trim()
  return {
    '@context': SCHEMA,
    '@type': 'Product',
    ...(input.url ? { '@id': `${input.url}#product` } : {}),
    name,
    ...(description ? { description } : {}),
    ...(input.images.length ? { image: input.images } : {}),
    ...(input.sku?.trim() ? { sku: input.sku.trim() } : {}),
    ...identifierProps(input.identifiers),
    ...(input.url ? { url: input.url } : {}),
    ...rating,
    offers,
  }
}
