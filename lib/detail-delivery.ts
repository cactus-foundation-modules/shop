// The delivery services one product can be bought with, read from whichever
// module publishes delivery timing at `shop.product-delivery-timing`.
//
// Shop asks for them so its Product structured data can say what they are. A
// shop with eight services - flat-pack, pre-assembled, express, installed, made
// to order - publishes eight prices and eight timings on the page for a shopper
// and, until this file, none of them anywhere a search engine or an assistant
// could read. "Free, five days, or assembled by Thursday for £37.95" is the
// answer to the question a shopper actually asks, and it was the one thing the
// markup did not carry.
//
// An OPTIONAL companion, looked up through the registry rather than imported:
// naming '@/modules/advanced-shipping-for-shop/...' here would break the build
// on every install that has not got it. A shop with no such module publishes no
// shippingDetails, which is what it did before.
import type { ShopShippingOption } from '@/modules/shop/lib/product-jsonld'

const POINT = 'shop.product-delivery-timing'

type TimingProvider = (productIds: string[]) => Promise<Map<string, unknown>>

/** The raw shape off the seam, before tax conversion. Price stays a number here
 *  because the caller has to run it through the product's own adjuster before it
 *  becomes a figure anyone should see. */
export type ShopDeliveryOption = Omit<ShopShippingOption, 'price'> & { price: number }

// One service, checked rather than trusted: it crosses a registry seam with no
// shared types, so a shape that has drifted must cost the page one line of
// markup, not the page. A service missing a usable price or count is dropped on
// its own - the others are still true.
function readOption(value: unknown): ShopDeliveryOption | null {
  if (typeof value !== 'object' || value === null) return null
  const row = value as Record<string, unknown>
  const label = typeof row.label === 'string' ? row.label.trim() : ''
  if (!label) return null
  const price = row.price
  if (typeof price !== 'number' || !Number.isFinite(price) || price < 0) return null
  const { handlingDays, transitDays } = row
  if (!Number.isInteger(handlingDays) || !Number.isInteger(transitDays)) return null
  if ((handlingDays as number) < 0 || (transitDays as number) < 0) return null
  const description = typeof row.description === 'string' ? row.description.trim() : ''
  return {
    label,
    description: description || null,
    price,
    handlingDays: handlingDays as number,
    transitDays: transitDays as number,
  }
}

/** Every service the product is offered, or an empty list. Two services under
 *  one name would publish as two shipping entries nothing could tell apart, so
 *  the first of a name wins. */
function readOptions(value: unknown): ShopDeliveryOption[] {
  if (typeof value !== 'object' || value === null) return []
  const row = value as Record<string, unknown>
  const seen = new Set<string>()
  const options: ShopDeliveryOption[] = []
  for (const entry of Array.isArray(row.options) ? row.options : []) {
    const option = readOption(entry)
    if (!option || seen.has(option.label)) continue
    seen.add(option.label)
    options.push(option)
  }
  return options
}

/**
 * The delivery services for one product, in the order the basket lists them.
 *
 * Empty on a shop with no delivery-timing module, and empty for a product that
 * module will not deliver - in which case nothing is published, rather than a
 * zero-priced service the shop does not offer.
 */
export async function resolveProductDeliveryOptions(productId: string): Promise<ShopDeliveryOption[]> {
  // Dynamic on purpose: a static edge from here to the generated registry closes
  // an import cycle through this module's own contributed components. Same
  // reason as lib/card-price.ts. See scripts/check-import-cycles.mjs.
  const { modulePublicExtensionPointComponents: moduleExtensionPointComponents } =
    await import('@/lib/modules/extension-points.public')
  const registered: Record<string, unknown> = moduleExtensionPointComponents[POINT] ?? {}
  const provider = Object.values(registered).find((e): e is TimingProvider => typeof e === 'function')
  if (!provider) return []

  try {
    const answered = await provider([productId])
    if (!(answered instanceof Map)) return []
    return readOptions(answered.get(productId))
  } catch (error) {
    // A page that still sells the product beats a 500 over a delivery line.
    console.error(`[shop] delivery-timing provider failed for product ${productId}:`, error)
    return []
  }
}
