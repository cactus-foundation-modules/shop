// What a search box on a product list is allowed to match.
//
// Shop's own answer is the product's name and its SKU. That is the whole story
// on a shop with no companion modules, and it is wrong the moment one of them
// puts the codes people actually quote somewhere else: with shop-variations
// installed, a listing's own SKU column is usually empty and every real supplier
// code lives on a hidden child product. Typing one into the admin product list
// found nothing at all, because the children are excluded from it by design.
//
// So a companion module that owns codes for a product answers here, and the
// product it owns them for is what comes back - the parent listing, never the
// hidden child.
//
// Providers hand back SQL rather than a list of ids, for the same reason
// shop.product-availability does: a paginated list has to stay one query, and
// filtering ids after the LIMIT gives short pages and a count that disagrees
// with the rows under it. The product row is aliased `p` in every query this is
// spliced into; a provider writes `p."id"` into its own SQL and interpolates
// nothing from the request into it by hand (Prisma.sql parameterises the term).
import { Prisma } from '@prisma/client'
import { getInstalledManifests } from '@/lib/modules/live-status'
import { modulePublicExtensionPointComponents as moduleExtensionPointComponents } from '@/lib/modules/extension-points.public'

export type ShopProductSearchProvider = {
  // True when this provider considers the product a match for one search word.
  matchSql: (term: string) => Prisma.Sql
}

const POINT = 'shop.product-search'

type ExtensionPointEntry = { point: string; id: string }

// Discovered through the installed modules' manifests, so an uninstalled
// module's provider cannot go on quietly widening the search.
async function searchProviders(): Promise<ShopProductSearchProvider[]> {
  const registered = moduleExtensionPointComponents[POINT] ?? {}
  if (Object.keys(registered).length === 0) return []

  const modules = await getInstalledManifests()

  const out: ShopProductSearchProvider[] = []
  for (const mod of modules) {
    const manifest = mod.manifest as { extensionPoints?: ExtensionPointEntry[] } | null
    for (const entry of manifest?.extensionPoints ?? []) {
      if (entry.point !== POINT) continue
      // Duck-typed rather than trusted: the generated map carries every module's
      // providers, and one registered against this point without a matchSql
      // would take the whole query down with it.
      const provider = registered[entry.id] as ShopProductSearchProvider | undefined
      if (typeof provider?.matchSql === 'function') out.push(provider)
    }
  }
  return out
}

/** The predicate for "this product matches the search box", provider opinions
 *  and all. Every word must match somewhere (name, SKU, or a provider), but
 *  which of the three, and in what order, does not matter - so "evolve BE755"
 *  finds the listing named Evolve that has a variation with that code.
 *
 *  Ask for it once per query, not once per row. Returns null when there is
 *  nothing to match on, so the caller adds no condition at all. */
export async function productSearchSql(terms: string[]): Promise<Prisma.Sql | null> {
  if (terms.length === 0) return null
  const providers = await searchProviders()

  const perTerm = terms.map((term) => {
    const like = `%${term}%`
    const parts: Prisma.Sql[] = [
      Prisma.sql`p."name" ILIKE ${like}`,
      Prisma.sql`p."sku" ILIKE ${like}`,
    ]
    for (const provider of providers) {
      try {
        parts.push(provider.matchSql(term))
      } catch {
        // A provider that cannot build its SQL is dropped rather than allowed to
        // break the query: the search falls back to name and SKU, which is
        // exactly what happens on a shop without that module installed.
      }
    }
    return Prisma.sql`(${Prisma.join(parts, ' OR ')})`
  })

  return Prisma.sql`(${Prisma.join(perTerm, ' AND ')})`
}
