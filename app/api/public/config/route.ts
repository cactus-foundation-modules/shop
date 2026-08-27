import { NextResponse } from 'next/server'
import { getShopConfigCached, getAvailablePaymentMethods, resolveSupplierLabel, resolveCheckoutAgreements } from '@/modules/shop/lib/config'
import { getPaymentMethodClientFields, getPaymentMethodLabels, getPaymentMethodLogos, resolvePaymentMethodDescriptions } from '@/modules/shop/lib/payments/registry'
import { displayTaxMode } from '@/modules/shop/lib/tax-display-shared'
import { resolveShopCommerceMode } from '@/modules/shop/lib/commerce-mode'
import { hasRedeemableCoupons } from '@/modules/shop/lib/db/discounts'

// Client-safe config slice the storefront needs (spec 8.1 GET /config).
//
// This is the busiest route on a shop by a wide margin - every client surface
// that needs a currency symbol or a product URL asks for it - so it is worth
// keeping cheap. Three things do that, in order of how much they save:
//
//  - the browser side coalesces its callers into one request per page: see
//    lib/public-config-client.ts, which is what every client surface uses;
//  - the answer below is built once and held for a few seconds per instance,
//    because assembling it costs half a dozen database round trips and the
//    shop-wide settings behind it do not change between one shopper and the
//    next. Concurrent callers share the one build rather than each starting
//    their own, which is the case that matters: a burst is exactly when the
//    database can least afford six queries per request;
//  - the response carries a short shared-cache lifetime, so a burst is answered
//    at the edge and never reaches a function at all. Safe to cache publicly
//    because nothing here varies by shopper: no cookie, no session, no header
//    is read anywhere in building it, only shop-wide settings.
//
// The hold matches the five seconds getShopConfigCached already used, so it
// makes nothing staler than it was. Anything a browser is told here is enforced
// again server-side when an order is placed, which is why a settings change
// taking a moment to reach the storefront costs nothing but the wait.
const PAYLOAD_TTL_MS = 5_000

let cachedPayload: unknown = null
let cachedPayloadAt = 0
let inFlight: Promise<unknown> | null = null

export async function GET() {
  const now = Date.now()
  if (cachedPayload === null || now - cachedPayloadAt >= PAYLOAD_TTL_MS) {
    // Single-flight: whoever arrives while a build is running waits on that one
    // rather than starting a second. Cleared in `finally` so a failed build is
    // not left latched as the answer everybody waits on.
    inFlight ??= buildConfigPayload()
      .then((payload) => {
        cachedPayload = payload
        cachedPayloadAt = Date.now()
        return payload
      })
      .finally(() => {
        inFlight = null
      })
    try {
      await inFlight
    } catch (error) {
      // A shop whose database is refusing connections for a moment should print
      // the settings it printed a moment ago rather than fall over - a burst
      // that exhausts the connection pool used to take the storefront's currency
      // symbol and product links down with it. Only where there is something to
      // fall back on: a first request with nothing held has no answer to give
      // and should say so honestly.
      if (cachedPayload === null) throw error
    }
  }

  return NextResponse.json(cachedPayload, {
    headers: { 'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=30' },
  })
}

async function buildConfigPayload() {
  const config = await getShopConfigCached()
  const enabledPaymentMethods = await getAvailablePaymentMethods()
  const commerce = await resolveShopCommerceMode()
  // Whether any code exists that a shopper could redeem today. The basket keeps
  // its coupon box out of sight entirely when there is none - see CartFullClient.
  const couponsAvailable = await hasRedeemableCoupons()
  const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY ?? null

  return {
    currency: config.currency,
    currencySymbol: config.currencySymbol,
    taxMode: config.taxMode,
    // How the storefront prints prices, as against how they are stored. The
    // basket's own arithmetic follows `displayTaxMode`: once the lines it is
    // handed have been converted, a shop printing gross prices adds up exactly
    // like an INCLUSIVE one whatever `taxMode` says. `suffix` is the wording
    // ("inc. VAT"). Left inert on a shop that has not switched this on.
    priceDisplay: {
      mode: config.priceDisplayTax,
      storedIncludesTax: config.taxMode === 'INCLUSIVE',
      suffix: config.priceDisplayTaxSuffix.trim(),
      displayTaxMode: displayTaxMode({
        mode: config.priceDisplayTax,
        storedIncludesTax: config.taxMode === 'INCLUSIVE',
        suffix: config.priceDisplayTaxSuffix,
      }),
    },
    // Which optional price types the owner has switched on. The storefront uses
    // it to know whether an RRP is worth rendering; the admin product editor
    // uses the same slice to decide which price boxes to offer, which is why it
    // rides along on the config call it already makes rather than a new one.
    enabledPriceTypes: config.enabledPriceTypes,
    showRetailPrice: config.showRetailPrice,
    // Whether the shop prices postage by weight. The admin product editor uses
    // it to decide whether a weight box is worth showing, which is why it rides
    // along on the config call it already makes rather than a new one.
    weightBasedShippingEnabled: config.weightBasedShippingEnabled,
    // Where a product page lives - /shop/products/<slug> or the bare /<slug>.
    // Rides along for the same reason as the two above: the admin product
    // editor's search preview prints the product's address, and printing the
    // one the shop has moved off makes a liar of the preview.
    productUrlStyle: config.productUrlStyle,
    // Supplier field settings. Storefront rendering is decided server-side, so
    // this slice exists for the admin product editor, which reads its config
    // from here: whether to offer the box, what to call it, and whether the
    // variations grid gets a column of its own.
    supplierField: {
      enabled: config.supplierFieldEnabled,
      label: resolveSupplierLabel(config),
      showOnFrontend: config.supplierShowOnFrontend,
      scope: config.supplierFieldScope,
    },
    guestCheckoutEnabled: config.guestCheckoutEnabled,
    minimumOrderValue: config.minimumOrderValue,
    maximumOrderValue: config.maximumOrderValue,
    requirePhone: config.requirePhone,
    // The organisation-name box under the shopper's own name, and whether an
    // order can be placed without one. The contact step draws the box from this;
    // the route that creates the order enforces the same rule again, because a
    // setting the browser is told about is a setting the browser can ignore.
    organisation: {
      enabled: config.organisationFieldEnabled,
      required: config.organisationRequired,
      label: config.organisationLabel.trim() || 'Organisation name',
    },
    // The customer's own reference box - their purchase order number - under the
    // organisation. Same arrangement as above: the contact step draws it from
    // here and the route that creates the order enforces the rule again.
    customerReference: {
      enabled: config.customerReferenceFieldEnabled,
      required: config.customerReferenceRequired,
      label: config.customerReferenceLabel.trim() || 'Purchase order number',
    },
    // Checkout tickboxes, already resolved: disabled and blank ones dropped,
    // and the terms link filled in from the site's own terms page where the
    // owner left the URL blank.
    checkoutAgreements: await resolveCheckoutAgreements(config),
    checkoutSteps: config.checkoutSteps,
    enabledPaymentMethods,
    paymentMethodLabels: await getPaymentMethodLabels(),
    // Brand marks for the methods whose providers ship one, so checkout can put
    // a recognisable logo beside the name. Only the ones that have one appear,
    // less any the owner has switched off on the Payments tab.
    paymentMethodLogos: getPaymentMethodLogos(config.hiddenPaymentMethodLogos),
    // The line under each method's name: the owner's wording where they have
    // written one, the provider's where they have not.
    paymentMethodDescriptions: resolvePaymentMethodDescriptions(config.paymentMethodDescriptions),
    // The publishable, order-independent half of what a method's own on-page
    // fields need to draw - see getClientFields on ShpPaymentProvider. Here
    // rather than only on the payment intent because an intent cannot be made
    // until the checkout is filled in and the compulsory boxes are ticked, and
    // a card box that appears only after somebody has agreed to the terms is a
    // card box nobody expected to have to go looking for.
    paymentMethodClientFields: await getPaymentMethodClientFields(),
    stripePublishableKey: publishableKey,
    // How this shop is transacted with at all: shop's own basket-and-checkout,
    // or an add-on's quote flow, in which case the buttons say something else,
    // the cart leads somewhere other than checkout, and prices may be withheld.
    // Every client cart surface reads this from here rather than deciding for
    // itself - see lib/commerce-mode.ts.
    commerce,
    couponsAvailable,
    shopStatus: config.shopStatus,
    shopClosedMessage: config.shopClosedMessage,
    preOrderMixedCartBehaviour: config.preOrderMixedCartBehaviour,
  }
}
