import { stripeProvider } from '@/modules/shop/lib/payments/stripe'
import { paypalProvider } from '@/modules/shop/lib/payments/paypal'
import { bankTransferProvider } from '@/modules/shop/lib/payments/bank-transfer'
import { cashProvider } from '@/modules/shop/lib/payments/cash'
import { moduleExtensionPointComponents } from '@/lib/modules/extension-points'
import type { ShpPaymentLogo, ShpPaymentProvider } from '@/modules/shop/lib/payments/provider'

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

// payment-method id -> the manifest entry id the contributing module registered
// the provider under (e.g. GOCARDLESS_IBP -> "gocardless-ibp"). Modules that
// give their settings panel the same entry id - which every payment module so
// far does - can have their method row on the Payments tab link straight to
// their own panel. A module that names the two differently simply gets no link;
// its panel is still there, on its own tab, so nothing is lost.
export function getModuleProviderEntryIds(): Record<string, string> {
  const contributed = moduleExtensionPointComponents['shop.payment-providers']
  if (!contributed) return {}
  const byMethod: Record<string, string> = {}
  for (const [entryId, provider] of Object.entries(contributed)) {
    const id = (provider as ShpPaymentProvider).id
    if (id) byMethod[id] = entryId
  }
  return byMethod
}

// What to call a method on screen: the owner-set name where the provider offers
// one, otherwise the fixed label it ships with. A provider that throws while
// looking its name up still gets named - a checkout radio with no wording next
// to it is worse than a slightly stale one.
export async function resolveProviderLabel(provider: ShpPaymentProvider): Promise<string> {
  if (!provider.getLabel) return provider.label
  try {
    const own = (await provider.getLabel()).trim()
    return own || provider.label
  } catch (error) {
    console.error(`[shop] payment provider "${provider.id}" failed to resolve its label:`, error)
    return provider.label
  }
}

// id -> the line under the method's name at checkout. The owner's own wording
// where they have written one on the Payments tab, the provider's where they
// have not, and no entry at all where there is neither - a method with nothing
// worth saying gets a name and nothing else, as it always did. Takes the
// overrides rather than reading config, so this stays a pure function the
// checkout and the settings screen can both reason about.
export function resolvePaymentMethodDescriptions(overrides: Record<string, string>): Record<string, string> {
  const descriptions: Record<string, string> = {}
  for (const provider of getAllPaymentProviders()) {
    const own = (overrides[provider.id] ?? '').trim()
    const line = own || (provider.description ?? '').trim()
    if (line) descriptions[provider.id] = line
  }
  return descriptions
}

// id -> the wording each provider ships with, for the settings screen to show
// as the placeholder in an empty box: "leave this alone and this is what your
// shoppers read".
export function getProviderDescriptionDefaults(): Record<string, string> {
  const defaults: Record<string, string> = {}
  for (const provider of getAllPaymentProviders()) {
    const own = (provider.description ?? '').trim()
    if (own) defaults[provider.id] = own
  }
  return defaults
}

// id -> brand mark, for the providers that ship one. A method with no mark is
// left out entirely rather than given a placeholder: its name carries the row,
// exactly as it did before any method had a logo.
//
// `hidden` is the owner's own list from the Payments tab. A mark they have
// switched off is dropped here rather than in the checkout, so the image never
// reaches the browser at all.
export function getPaymentMethodLogos(hidden: readonly string[] = []): Record<string, ShpPaymentLogo> {
  const logos: Record<string, ShpPaymentLogo> = {}
  for (const provider of getAllPaymentProviders()) {
    if (provider.logo && !hidden.includes(provider.id)) logos[provider.id] = provider.logo
  }
  return logos
}

// id -> human label for every registered provider, for the checkout UI.
export async function getPaymentMethodLabels(): Promise<Record<string, string>> {
  const providers = getAllPaymentProviders()
  const resolved = await Promise.all(providers.map((p) => resolveProviderLabel(p)))
  const labels: Record<string, string> = {}
  providers.forEach((p, i) => { labels[p.id] = resolved[i] ?? p.label })
  return labels
}
