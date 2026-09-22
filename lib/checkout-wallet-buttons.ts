// Server-side resolver for the 'shop.checkout-wallet-buttons' extension point.
//
// Server-only for the same reason as lib/checkout-payment-fields.ts: the
// generated registry statically imports every extension component from every
// module - payment providers that touch Prisma included - so it must never
// reach a client bundle. The two server render paths (checkout page fallback,
// Puck RSC block) call this and hand the resolved client components down to
// CheckoutReviewClient as a prop; the editor path deliberately does not, so the
// layout editor shows the review step without live wallet buttons in it.
//
// Keyed by payment method id, exactly as the payment-fields map is: a module
// registers under 'SQUARE' because that is what its provider's `id` is, and the
// review step only mounts the entry for the method the shopper has picked.
//
// Read from the whole generated map rather than filtered through the installed
// manifests, and that is deliberate: the methods themselves come from the same
// map (lib/payments/registry.ts, getAllPaymentProviders), so this always agrees
// with the list of methods a shopper can pick. Gating only this half would let
// the two disagree - a method on offer with its buttons filtered away.
import type { ComponentType } from 'react'
import { modulePublicExtensionPointComponents as moduleExtensionPointComponents } from '@/lib/modules/extension-points.public'
import type { ShopCheckoutWalletButtonsProps } from '@/modules/shop/components/public/checkout-wallet-buttons'

export type ShopCheckoutWalletButtonsMap = Record<string, ComponentType<ShopCheckoutWalletButtonsProps>>

export function resolveCheckoutWalletButtons(): ShopCheckoutWalletButtonsMap {
  const entries = moduleExtensionPointComponents['shop.checkout-wallet-buttons'] ?? {}
  return entries as ShopCheckoutWalletButtonsMap
}
