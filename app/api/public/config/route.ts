import { NextResponse } from 'next/server'
import { getShopConfigCached, getAvailablePaymentMethods, resolveSupplierLabel, resolveCheckoutAgreements } from '@/modules/shop/lib/config'
import { getPaymentMethodLabels, getPaymentMethodLogos } from '@/modules/shop/lib/payments/registry'
import { displayTaxMode } from '@/modules/shop/lib/tax-display-shared'
import { resolveShopCommerceMode } from '@/modules/shop/lib/commerce-mode'

// Client-safe config slice the storefront needs (spec 8.1 GET /config).
export async function GET() {
  const config = await getShopConfigCached()
  const enabledPaymentMethods = await getAvailablePaymentMethods()
  const commerce = await resolveShopCommerceMode()
  const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY ?? null

  return NextResponse.json({
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
    // The business-name box above address line 1, and whether an order can be
    // placed without one. The shipping step draws the box from this; the route
    // that creates the order enforces the same rule again, because a setting
    // the browser is told about is a setting the browser can ignore.
    businessName: {
      enabled: config.businessNameFieldEnabled,
      required: config.businessNameRequired,
      label: config.businessNameLabel.trim() || 'Business name',
    },
    // Checkout tickboxes, already resolved: disabled and blank ones dropped,
    // and the terms link filled in from the site's own terms page where the
    // owner left the URL blank.
    checkoutAgreements: await resolveCheckoutAgreements(config),
    checkoutSteps: config.checkoutSteps,
    enabledPaymentMethods,
    paymentMethodLabels: await getPaymentMethodLabels(),
    // Brand marks for the methods whose providers ship one, so checkout can put
    // a recognisable logo beside the name. Only the ones that have one appear.
    paymentMethodLogos: getPaymentMethodLogos(),
    stripePublishableKey: publishableKey,
    // How this shop is transacted with at all: shop's own basket-and-checkout,
    // or an add-on's quote flow, in which case the buttons say something else,
    // the cart leads somewhere other than checkout, and prices may be withheld.
    // Every client cart surface reads this from here rather than deciding for
    // itself - see lib/commerce-mode.ts.
    commerce,
    shopStatus: config.shopStatus,
    shopClosedMessage: config.shopClosedMessage,
    preOrderMixedCartBehaviour: config.preOrderMixedCartBehaviour,
  })
}
