// Server-side resolver for the 'shop.checkout-contact-extras' extension point.
//
// Server-only on purpose, exactly as lib/checkout-address-lookup.ts is: the
// generated registry statically imports every extension component from every
// module - server-only code included - so it must never reach a client bundle.
// The two server render paths (checkout page fallback, Puck RSC block) call
// this and hand the resolved client components down to CheckoutContactClient as
// a prop; the editor path passes nothing, so the editor preview shows shop's
// own fields on their own.
import type { ComponentType } from 'react'
import { modulePublicExtensionPointComponents as moduleExtensionPointComponents } from '@/lib/modules/extension-points.public'
import type { ShopCheckoutContactExtraProps } from '@/modules/shop/components/public/checkout-contact-extras'

export function resolveCheckoutContactExtras(): ComponentType<ShopCheckoutContactExtraProps>[] {
  const entries = moduleExtensionPointComponents['shop.checkout-contact-extras'] ?? {}
  // Every registered extra, in manifest order. Unlike the address lookup there
  // is no reason for these to be exclusive - two modules asking two different
  // questions is a perfectly ordinary checkout.
  return Object.values(entries) as ComponentType<ShopCheckoutContactExtraProps>[]
}
