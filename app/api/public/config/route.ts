import { NextResponse } from 'next/server'
import { getShopConfigCached, getAvailablePaymentMethods } from '@/modules/shop/lib/config'
import { getPaymentMethodLabels } from '@/modules/shop/lib/payments/registry'

// Client-safe config slice the storefront needs (spec 8.1 GET /config).
export async function GET() {
  const config = await getShopConfigCached()
  const enabledPaymentMethods = await getAvailablePaymentMethods()
  const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY ?? null

  return NextResponse.json({
    currency: config.currency,
    currencySymbol: config.currencySymbol,
    taxMode: config.taxMode,
    guestCheckoutEnabled: config.guestCheckoutEnabled,
    minimumOrderValue: config.minimumOrderValue,
    maximumOrderValue: config.maximumOrderValue,
    requirePhone: config.requirePhone,
    checkoutSteps: config.checkoutSteps,
    enabledPaymentMethods,
    paymentMethodLabels: getPaymentMethodLabels(),
    stripePublishableKey: publishableKey,
    shopStatus: config.shopStatus,
    shopClosedMessage: config.shopClosedMessage,
    preOrderMixedCartBehaviour: config.preOrderMixedCartBehaviour,
  })
}
