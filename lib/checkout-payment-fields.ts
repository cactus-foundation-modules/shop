// Server-side resolver for the 'shop.checkout-payment-fields' extension point.
//
// Server-only on purpose, the same as lib/checkout-address-lookup.ts: the
// generated registry statically imports every extension component from every
// module - payment providers that touch Prisma included - so it must never
// reach a client bundle. The two server render paths (checkout page fallback,
// Puck RSC block) call this and hand the resolved client components down to
// CheckoutPaymentClient as a prop; the editor path deliberately does not, so
// the editor preview shows the method list on its own.
//
// Keyed by payment method id, because a shop may well have two on-page methods
// installed at once and only the chosen one may draw anything. The registered
// id IS the method id - a module registers under 'SQUARE' because that is what
// its provider's `id` is - so a mistyped id is inert rather than wrong.
//
// Read from the whole generated map rather than filtered through the installed
// manifests, and that is deliberate: the methods themselves come from the same
// map (lib/payments/registry.ts, getAllPaymentProviders), so this always agrees
// with the list of methods a shopper can pick. Gating only this half would let
// the two disagree - a method on offer with no card box to pay through.
import type { ComponentType } from 'react'
import { modulePublicExtensionPointComponents as moduleExtensionPointComponents } from '@/lib/modules/extension-points.public'
import type { ShopCheckoutPaymentFieldsProps } from '@/modules/shop/components/public/checkout-payment-fields'

export type ShopCheckoutPaymentFieldsMap = Record<string, ComponentType<ShopCheckoutPaymentFieldsProps>>

export function resolveCheckoutPaymentFields(): ShopCheckoutPaymentFieldsMap {
  const entries = moduleExtensionPointComponents['shop.checkout-payment-fields'] ?? {}
  return entries as ShopCheckoutPaymentFieldsMap
}
