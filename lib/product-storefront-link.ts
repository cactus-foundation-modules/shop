// `shop.product-storefront-link` - where a product actually lives on the
// storefront, for staff screens that want to open it there.
//
// Why a seam. A product's own slug is not always the address a shopper would
// recognise: a variation is a catalogue-hidden child row, and the page anybody
// actually looks at is its parent listing with that combination chosen -
// `/desk?width=160cm&finish=walnut`. Shop knows nothing about how children map
// to parents or how a combination is spelt in a query string (that is
// shop-variations' codec, and the same spelling it publishes in the sitemap and
// declares canonical), so it asks. A provider answers the ids it recognises with
// the slug of the page to open and the query string to open it with; everything
// else falls back to the product's own slug, which is exactly the link every
// order screen had before this existed.
//
// Shop still applies the URL style itself, so a provider never has to know
// whether this shop puts products at the root or under /shop/products.
//
// Server-only: the answer is for an admin screen, and a provider goes back to its
// own tables. Contribute it with `serverOnly: true` on the manifest entry.
import { getInstalledManifests } from '@/lib/modules/live-status'
import { getProductSlugsByIds } from '@/modules/shop/lib/db/products'
import { productHref } from '@/modules/shop/lib/product-url'
import { getProductUrlStyle } from '@/modules/shop/lib/product-url-server'

/** One product's storefront address, as a provider gives it: the slug of the
 *  page to open, and the query string to open it with ('a=b&c=d', no leading
 *  '?'), or null for the bare page. */
export type ProductStorefrontLink = { slug: string; query: string | null }

// Product id -> its link. A product the provider does not recognise is simply
// left out, and shop falls back to that product's own slug.
export type ProductStorefrontLinkProvider = (
  productIds: string[],
) => Promise<Record<string, ProductStorefrontLink>> | Record<string, ProductStorefrontLink>

const POINT = 'shop.product-storefront-link'

type ExtensionPointEntry = { point: string; id: string }

/** A provider's answer, checked rather than trusted: it ends up in an href. */
function validLink(link: unknown): ProductStorefrontLink | null {
  if (!link || typeof link !== 'object') return null
  const { slug, query } = link as { slug?: unknown; query?: unknown }
  if (typeof slug !== 'string' || !slug.trim()) return null
  if (query !== null && query !== undefined && typeof query !== 'string') return null
  const cleanQuery = typeof query === 'string' ? query.replace(/^\?+/, '').trim() : ''
  return { slug: slug.trim(), query: cleanQuery || null }
}

/** The href for one link, in this shop's URL style. Pure, for the tests. */
export function storefrontHref(link: ProductStorefrontLink, style: Parameters<typeof productHref>[1]): string {
  const base = productHref(link.slug, style)
  return link.query ? `${base}?${link.query}` : base
}

/**
 * Site-relative storefront hrefs by product id, for every id that still names a
 * product. A deleted product is left out, so the caller can print its name as
 * plain text rather than link to a 404.
 *
 * The first provider to answer an id wins, in installed-module order. A provider
 * that throws is logged and skipped: a link to the child's own slug still opens
 * the right page, and an order screen that will not load is no trade for a
 * tidier address.
 */
export async function resolveProductStorefrontHrefs(productIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const ids = [...new Set(productIds.filter(Boolean))]
  if (ids.length === 0) return out

  const [slugs, style] = await Promise.all([getProductSlugsByIds(ids), getProductUrlStyle()])
  const links = new Map<string, ProductStorefrontLink>()

  // Dynamic, and the SERVER map, for the reasons lib/card-media.ts gives: a
  // static edge to the registry closes an import cycle, and the public map is
  // where client code reads from.
  const { moduleServerExtensionPointComponents } = await import('@/lib/modules/extension-points.server')
  const providers = moduleServerExtensionPointComponents[POINT] ?? {}
  if (Object.keys(providers).length > 0) {
    const modules = await getInstalledManifests()
    for (const mod of modules) {
      const manifest = mod.manifest as { extensionPoints?: ExtensionPointEntry[] } | null
      if (!manifest?.extensionPoints) continue
      for (const entry of manifest.extensionPoints) {
        if (entry.point !== POINT) continue
        const provider = providers[entry.id] as ProductStorefrontLinkProvider | undefined
        if (!provider) continue
        const unanswered = ids.filter((id) => !links.has(id) && slugs.has(id))
        if (unanswered.length === 0) break
        let answered: Record<string, ProductStorefrontLink>
        try {
          answered = await provider(unanswered)
        } catch (error) {
          console.error(`[shop.product-storefront-link] provider "${entry.id}" failed`, error)
          continue
        }
        for (const id of unanswered) {
          const link = validLink(answered?.[id])
          if (link) links.set(id, link)
        }
      }
    }
  }

  for (const id of ids) {
    const slug = slugs.get(id)
    if (!slug) continue
    out.set(id, storefrontHref(links.get(id) ?? { slug, query: null }, style))
  }
  return out
}
