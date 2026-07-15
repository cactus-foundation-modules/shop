import { stripeProvider } from '@/modules/shop/lib/payments/stripe'
import { paypalProvider } from '@/modules/shop/lib/payments/paypal'
import { bankTransferProvider } from '@/modules/shop/lib/payments/bank-transfer'
import { cashProvider } from '@/modules/shop/lib/payments/cash'
import { moduleExtensionPointComponents } from '@/lib/modules/extension-points'
import type { ShpPaymentProvider } from '@/modules/shop/lib/payments/provider'

// Providers that ship with shop. Additional providers (e.g. an open-banking
// method) register themselves through the generic `shop.payment-providers`
// extension point and are merged in below - shop never names a specific module.
const builtInProviders: ShpPaymentProvider[] = [
  stripeProvider,
  paypalProvider,
  bankTransferProvider,
  cashProvider,
]

// Providers contributed by installed modules via the shop.payment-providers
// extension point. Each contributed component IS a ShpPaymentProvider object,
// keyed in the manifest by its own entry id; we re-key them by their runtime
// payment-method id (e.g. GOCARDLESS_IBP) below.
function moduleProviders(): ShpPaymentProvider[] {
  const contributed = moduleExtensionPointComponents['shop.payment-providers']
  if (!contributed) return []
  return Object.values(contributed) as ShpPaymentProvider[]
}

// All providers, built-in first, keyed at call sites by their payment-method id.
export function getAllPaymentProviders(): ShpPaymentProvider[] {
  return [...builtInProviders, ...moduleProviders()]
}

export function getPaymentProvider(method: string): ShpPaymentProvider | undefined {
  return getAllPaymentProviders().find((p) => p.id === method)
}

// id -> human label for every registered provider, for the checkout UI.
export function getPaymentMethodLabels(): Record<string, string> {
  const labels: Record<string, string> = {}
  for (const p of getAllPaymentProviders()) labels[p.id] = p.label
  return labels
}
