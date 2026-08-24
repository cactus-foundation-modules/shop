import { redirect } from 'next/navigation'
import { Render } from '@puckeditor/core/rsc'
import type { Data } from '@puckeditor/core'
import { getModuleLayoutPuckRscConfig } from '@/lib/puck/config.rsc'
import { resolveThemeLayout } from '@/lib/layout/resolveThemeLayout'
import { getShopGate } from '@/modules/shop/lib/access'
import { resolveShopCommerceMode } from '@/modules/shop/lib/commerce-mode'
import { ShopClosedNotice, ShopStaffPreviewBanner } from '@/modules/shop/components/public/ShopClosedNotice'
import { CheckoutItemsClient } from '@/modules/shop/components/public/CheckoutItemsClient'
import { CheckoutContactClient } from '@/modules/shop/components/public/CheckoutContactClient'
import { CheckoutShippingClient } from '@/modules/shop/components/public/CheckoutShippingClient'
import { resolveCheckoutAddressLookup } from '@/modules/shop/lib/checkout-address-lookup'
import { resolveCheckoutContactExtras } from '@/modules/shop/lib/checkout-contact-extras'
import { CheckoutPaymentClient } from '@/modules/shop/components/public/CheckoutPaymentClient'
import { resolveCheckoutPaymentFields } from '@/modules/shop/lib/checkout-payment-fields'
import { CheckoutReviewClient } from '@/modules/shop/components/public/CheckoutReviewClient'
import { resolveCheckoutWalletButtons } from '@/modules/shop/lib/checkout-wallet-buttons'

export const metadata = { title: 'Checkout' }

export default async function ShopCheckoutPage() {
  const gate = await getShopGate()
  if (gate.blocked) return <ShopClosedNotice message={gate.message} />

  // A shop switched to quote-only takes no payments, so this page has nothing to
  // do. Sending the shopper on to wherever that mode does its business beats a
  // dead end: a bookmarked or search-indexed /shop/checkout is exactly how
  // somebody arrives here after the switch. The checkout API routes refuse the
  // same way, so a client still holding an old page cannot get through either.
  const commerce = await resolveShopCommerceMode()
  if (commerce.mode === 'quote') redirect(commerce.cartCtaHref)

  const layout = await resolveThemeLayout('shopCheckout', { moduleName: 'shop' })

  // A published layout gets room to breathe - a two-column design (order
  // summary beside the steps) is unusable inside the old 640px straitjacket.
  // The hardcoded fallback flow is single-column by nature, so it keeps the
  // narrow centred wrapper it was designed around.
  return (
    <div style={{ maxWidth: layout?.builderData ? 1100 : 640, margin: '0 auto', padding: '2rem 1.5rem', display: 'grid', gap: '2rem' }}>
      {gate.staffPreview && <ShopStaffPreviewBanner />}
      <h1 style={{ fontSize: '1.75rem', margin: 0 }}>Checkout</h1>
      {layout?.builderData ? (
        <Render config={getModuleLayoutPuckRscConfig('shopCheckout') as any} data={layout.builderData as Data} />
      ) : (
        // No published shopCheckout layout: render the full default flow rather
        // than a bare heading over nothing. Same shape as the classic starter,
        // matching the cart page's own hardcoded fallback.
        <>
          <CheckoutItemsClient />
          <CheckoutContactClient extras={resolveCheckoutContactExtras()} />
          <CheckoutShippingClient addressLookup={resolveCheckoutAddressLookup()} />
          <CheckoutPaymentClient paymentFields={resolveCheckoutPaymentFields()} />
          <CheckoutReviewClient walletButtons={resolveCheckoutWalletButtons()} />
        </>
      )}
    </div>
  )
}
