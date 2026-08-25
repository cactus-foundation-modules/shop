// What "this product is reduced" means in a query.
//
// Shop's own answer is the product's own two columns: a sale price that is set
// and genuinely undercuts the normal price (the SQL twin of isOnSale in
// lib/pricing.ts, which is what the card and the checkout use - the two must
// never disagree about who is on offer).
//
// That answer is incomplete the moment variations are in play. A listing with
// variations carries no real price of its own: every figure lives on a hidden
// child product this module is not allowed to know about. So a companion module
// that prices a listing answers here too, and a listing counts as reduced while
// any of its variations is.
//
// Providers hand back SQL rather than a list of ids, for the same reason
// shop.product-search and shop.product-availability do: the tag page is
// paginated, and filtering ids after the LIMIT gives short pages and a count
// that disagrees with the rows above it. The product row is aliased `p` in every
// query this is spliced into.
import { Prisma } from '@prisma/client'
import { getInstalledManifests } from '@/lib/modules/live-status'
import { modulePublicExtensionPointComponents as moduleExtensionPointComponents } from '@/lib/modules/extension-points.public'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import { isPriceTypeEnabled } from '@/modules/shop/lib/pricing'

export type ShopProductSaleProvider = {
  // True when this provider considers the product reduced.
  onSaleSql: () => Prisma.Sql
}

const POINT = 'shop.product-on-sale'

type ExtensionPointEntry = { point: string; id: string }

async function saleProviders(): Promise<ShopProductSaleProvider[]> {
  const registered = moduleExtensionPointComponents[POINT] ?? {}
  if (Object.keys(registered).length === 0) return []

  const modules = await getInstalledManifests()

  const out: ShopProductSaleProvider[] = []
  for (const mod of modules) {
    const manifest = mod.manifest as { extensionPoints?: ExtensionPointEntry[] } | null
    for (const entry of manifest?.extensionPoints ?? []) {
      if (entry.point !== POINT) continue
      // Duck-typed rather than trusted: one registered here without an
      // onSaleSql would take the whole query down with it.
      const provider = registered[entry.id] as ShopProductSaleProvider | undefined
      if (typeof provider?.onSaleSql === 'function') out.push(provider)
    }
  }
  return out
}

/** The predicate for "this product is reduced right now", provider opinions and
 *  all. Returns null when the shop has sale prices switched off altogether, in
 *  which case nothing is on offer and the caller should match no products at
 *  all rather than fall back to matching every one of them. */
export async function productOnSaleSql(): Promise<Prisma.Sql | null> {
  const { enabledPriceTypes } = await getShopConfigCached()
  if (!isPriceTypeEnabled(enabledPriceTypes, 'sale')) return null

  const parts: Prisma.Sql[] = [
    Prisma.sql`(p."sale_price" IS NOT NULL AND p."sale_price" >= 0 AND p."sale_price" < p."price")`,
  ]
  for (const provider of await saleProviders()) {
    try {
      parts.push(provider.onSaleSql())
    } catch {
      // A provider that cannot build its SQL is dropped rather than allowed to
      // break the page: the list falls back to shop's own columns, exactly as
      // on a shop without that module installed.
    }
  }
  return Prisma.sql`(${Prisma.join(parts, ' OR ')})`
}
