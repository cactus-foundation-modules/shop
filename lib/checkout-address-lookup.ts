// Server-side resolver for the 'shop.checkout-address-lookup' extension point.
//
// Server-only on purpose: the generated registry statically imports every
// extension component from every module - line resolvers that touch Prisma
// included - so it must never reach a client bundle. The two server render
// paths (checkout page fallback, Puck RSC block) call this and hand the
// resolved client component down to CheckoutShippingClient as a prop; the
// editor path deliberately does not, so the editor preview shows the plain
// field (identical at-rest markup, since the provider renders shop's own input
// via renderInput).
import type { ComponentType } from 'react'
import { modulePublicExtensionPointComponents as moduleExtensionPointComponents } from '@/lib/modules/extension-points.public'
import type { ShopCheckoutAddressLookupProps } from '@/modules/shop/components/public/checkout-address-lookup'

export function resolveCheckoutAddressLookup(): ComponentType<ShopCheckoutAddressLookupProps> | null {
  const entries = moduleExtensionPointComponents['shop.checkout-address-lookup'] ?? {}
  // One lookup field, one provider: first registered wins, in manifest order.
  const first = Object.values(entries)[0]
  return (first as ComponentType<ShopCheckoutAddressLookupProps> | undefined) ?? null
}
