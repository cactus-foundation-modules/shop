// One product's star line, read from whichever module publishes ratings at
// `shop.product-rating-summary`.
//
// Shop asks so its Product structured data can carry an aggregateRating. A shop
// with four hundred published reviews averaging four and a half stars was
// showing all of it on the page and none of it to a search engine or an
// assistant, which is the half that decides whether either of them puts the
// shop in front of somebody.
//
// Read through the registry rather than imported, like every other optional
// companion: a shop with no reviews module publishes no rating, exactly as
// before. And a rating with no reviews behind it is never published at all -
// schema.org reads a count of nought as a score nobody gave, and rich results
// built on one are the kind of thing a manual action is for.
import { getInstalledManifests } from '@/lib/modules/live-status'
import type { ShopProductRating } from '@/modules/shop/lib/product-jsonld'

const POINT = 'shop.product-rating-summary'

type RatingProvider = (productIds: string[]) => Promise<Record<string, unknown>>

type ExtensionPointEntry = { point: string; id: string }

/** How many decimal places a published average carries. One is what every shop
 *  prints beside the stars, and a mean quoted to six is a machine talking. */
const PLACES = 1

// The provider's answer, checked rather than trusted - it crosses a registry
// seam with no shared types. Anything that fails a check costs the page its
// rating, not the page.
function readRating(value: unknown): ShopProductRating | null {
  if (typeof value !== 'object' || value === null) return null
  const row = value as Record<string, unknown>
  const count = row.count
  if (!Number.isInteger(count) || (count as number) <= 0) return null
  const average = row.average
  if (typeof average !== 'number' || !Number.isFinite(average)) return null
  // A best of five unless the provider says otherwise. Stated rather than
  // assumed downstream: a shop rating out of ten publishes a ten here and its
  // 8.4 is read as good rather than as off the end of the scale.
  const best = Number.isFinite(row.ratingMax) && (row.ratingMax as number) > 0 ? (row.ratingMax as number) : 5
  // An average outside its own scale is a provider bug, and publishing it would
  // be a rich-results violation rather than a rounding error.
  if (average < 1 || average > best) return null
  return { value: average.toFixed(PLACES), count: count as number, best }
}

/**
 * The star line for one product, or null where there is no reviews module, the
 * product has no published reviews, or the answer did not survive its checks.
 */
export async function resolveProductRating(productId: string): Promise<ShopProductRating | null> {
  // Dynamic on purpose - same import-cycle reason as lib/card-price.ts.
  const { modulePublicExtensionPointComponents: moduleExtensionPointComponents } =
    await import('@/lib/modules/extension-points.public')
  const registered: Record<string, unknown> = moduleExtensionPointComponents[POINT] ?? {}
  if (Object.keys(registered).length === 0) return null

  // Walked in installed-modules order and gated by the manifests, as
  // lib/card-price.ts is, rather than taking whichever function the generated
  // map happens to list first: that order is the build's, so two reviews
  // modules could swap places in the structured data between two deploys, and
  // an uninstalled module still in the map could go on publishing stars. The
  // first provider with a rating that survives the checks wins.
  const modules = await getInstalledManifests()
  for (const mod of modules) {
    const manifest = mod.manifest as { extensionPoints?: ExtensionPointEntry[] } | null
    for (const entry of manifest?.extensionPoints ?? []) {
      if (entry.point !== POINT) continue
      const provider = registered[entry.id]
      if (typeof provider !== 'function') continue
      try {
        const answered = await (provider as RatingProvider)([productId])
        if (typeof answered !== 'object' || answered === null) continue
        const rating = readRating((answered as Record<string, unknown>)[productId])
        if (rating) return rating
      } catch (error) {
        console.error(`[shop] rating-summary provider "${entry.id}" failed for product ${productId}:`, error)
      }
    }
  }
  return null
}
