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
import type { ComponentType } from 'react'
import { moduleExtensionPointComponents } from '@/lib/modules/extension-points'
import type { ShopCheckoutPaymentFieldsProps } from '@/modules/shop/components/public/checkout-payment-fields'

export type ShopCheckoutPaymentFieldsMap = Record<string, ComponentType<ShopCheckoutPaymentFieldsProps>>

export function resolveCheckoutPaymentFields(): ShopCheckoutPaymentFieldsMap {
  const entries = moduleExtensionPointComponents['shop.checkout-payment-fields'] ?? {}
  return entries as ShopCheckoutPaymentFieldsMap
}
