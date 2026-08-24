// Who gets shown a product that has sold out.
//
// The owner's answer lives in two config keys (lib/config.ts):
//
//   outOfStockVisibility     SHOW | HIDE_FROM_LISTS | HIDE_EVERYWHERE
//   outOfStockHiddenFromStaff  whether signed-in staff are hidden from too
//
// and this file is the one place that turns them into an answer for a surface.
// Every storefront list asks getStockGate() what to do and, when the answer is
// "hide", filters with the SQL this file composes. Nothing else works out what
// "out of stock" means for itself, because two surfaces disagreeing about that
// is how a product ends up hidden from the grid and still linked from the strip
// underneath it.
//
// Three properties worth keeping when editing this:
//
//  1. A shop on the default (SHOW) pays nothing. No provider is asked, no cookie
//     is read, no extra SQL is added, so its public pages stay as cacheable as
//     they were before the setting existed.
//  2. The cookie is only read when staff are exempt AND hiding is on. That is
//     the one combination where two visitors must be shown different pages.
//  3. Hiding is a display decision only. It never changes what can be bought:
//     an out-of-stock product was already unbuyable at the checkout, and the
//     admin never has anything hidden from it.
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db/prisma'
import { getInstalledManifests } from '@/lib/modules/live-status'
import { moduleExtensionPointComponents } from '@/lib/modules/extension-points'
import { canSeeHiddenOutOfStock } from '@/modules/shop/lib/access'
import { getShopConfigCached, type ShpConfig } from '@/modules/shop/lib/config'

// Shop's own rule for "sold out", and the same one the card badge and the
// product page have always drawn: it tracks stock, has none, will not take a
// backorder and is not a pre-order. A product not tracking stock is never out of
// stock, so a made-to-order catalogue is untouched by any of this.
//
// The product table is aliased `p` here and in every query this predicate is
// spliced into. Providers below inherit that contract.
const SHOP_OUT_OF_STOCK_SQL = Prisma.sql`(
  p."track_inventory" = true
  AND COALESCE(p."stock_count", 0) <= 0
  AND p."out_of_stock_behaviour" = 'BLOCK'
  AND p."is_pre_order" = false
)`

// A companion module that owns availability for some products, because shop's
// own stock columns are not the whole story for them. shop-variations is the
// case in point: a listing with variations carries no stock of its own, and is
// sold out only once every variation of it is.
//
// Both halves are SQL rather than a list of ids, so a paginated grid stays one
// query: filtering ids after the LIMIT would hand back short pages and a product
// count that disagrees with the products under it.
//
// The product row is aliased `p`. A provider writes `p."id"` into its own SQL
// and interpolates nothing from a request into it.
export type ShopAvailabilityProvider = {
  // True when this provider, not shop, decides whether the product is in stock.
  ownsSql: () => Prisma.Sql
  // True when this provider considers it out of stock. Only consulted for the
  // products it owns.
  outOfStockSql: () => Prisma.Sql
}

const POINT = 'shop.product-availability'

type ExtensionPointEntry = { point: string; id: string }

// Precedent: shop.product-card-prices -> lib/card-price.ts. Discovered through
// the installed modules' manifests, so an uninstalled module's provider cannot
// go on quietly filtering the shop.
async function availabilityProviders(): Promise<ShopAvailabilityProvider[]> {
  const registered = moduleExtensionPointComponents[POINT] ?? {}
  if (Object.keys(registered).length === 0) return []

  const modules = await getInstalledManifests()

  const out: ShopAvailabilityProvider[] = []
  for (const mod of modules) {
    const manifest = mod.manifest as { extensionPoints?: ExtensionPointEntry[] } | null
    for (const entry of manifest?.extensionPoints ?? []) {
      if (entry.point !== POINT) continue
      // Duck-typed rather than trusted: the generated map carries every
      // module's providers, and one registered against this point without both
      // halves would take the whole query down with it.
      const provider = registered[entry.id] as ShopAvailabilityProvider | undefined
      if (typeof provider?.ownsSql === 'function' && typeof provider?.outOfStockSql === 'function') out.push(provider)
    }
  }
  return out
}

/** The predicate for "this product is out of stock", provider opinions and all.
 *  A product a provider owns is judged entirely by that provider; everything
 *  else by shop's own columns. Ask for it once per query, not once per row.
 *
 *  Composed as a CASE so each provider is asked whether the product is its
 *  business exactly once and the first one to say yes settles it - the same
 *  first-provider-wins rule as shop.product-card-prices, and a good deal cheaper
 *  than an OR chain that re-tests ownership in every branch. */
export async function outOfStockSql(): Promise<Prisma.Sql> {
  const branches: Prisma.Sql[] = []
  for (const provider of await availabilityProviders()) {
    try {
      branches.push(Prisma.sql`WHEN ${provider.ownsSql()} THEN ${provider.outOfStockSql()}`)
    } catch {
      // A provider that cannot build its SQL is dropped rather than allowed to
      // break the query: its products fall back to shop's own columns, which is
      // exactly what happens on a shop without that module installed.
    }
  }
  if (branches.length === 0) return SHOP_OUT_OF_STOCK_SQL
  return Prisma.sql`(CASE ${Prisma.join(branches, ' ')} ELSE ${SHOP_OUT_OF_STOCK_SQL} END)`
}

export type StockGate = {
  // Drop out-of-stock products from grids, category and collection pages,
  // search results and recommendation strips.
  hideFromLists: boolean
  // Give the product's own page the not-found treatment as well.
  hideProductPage: boolean
  // The viewer is staff seeing what shoppers are not. Drives the banner on a
  // product page only they can reach.
  staffPreview: boolean
}

const SHOWN: StockGate = { hideFromLists: false, hideProductPage: false, staffPreview: false }

/** What the shopper in front of us is allowed to see. The answer for a signed-in
 *  member of staff differs from the answer for everyone else, so anything using
 *  this is rendered per visitor rather than served from cache - which is why the
 *  default (SHOW) returns before any of that can happen. */
export async function getStockGate(): Promise<StockGate> {
  const config = await getShopConfigCached()
  if (config.outOfStockVisibility === 'SHOW') return SHOWN

  // Only this branch reads a cookie, and only because staff have been left an
  // exemption. Take the exemption away and the storefront goes back to being
  // the same page for everybody.
  if (!config.outOfStockHiddenFromStaff && (await canSeeHiddenOutOfStock())) {
    return { hideFromLists: false, hideProductPage: false, staffPreview: true }
  }

  return {
    hideFromLists: true,
    hideProductPage: config.outOfStockVisibility === 'HIDE_EVERYWHERE',
    staffPreview: false,
  }
}

/** The shopper's answer with nobody signed in, for surfaces that have no viewer
 *  to speak of: the sitemap is one file served to the whole world, and a staff
 *  exemption in it would publish the URLs the setting exists to withhold. */
export function hidesOutOfStockFromShoppers(config: ShpConfig): boolean {
  return config.outOfStockVisibility !== 'SHOW'
}

/** Which of these products are out of stock. For lists already in hand (a
 *  recommendation strip, a page of search results) where re-running the query
 *  is not an option. Paginated lists filter in SQL instead - see listProducts. */
export async function outOfStockProductIds(productIds: string[]): Promise<Set<string>> {
  if (productIds.length === 0) return new Set()
  const predicate = await outOfStockSql()
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT p."id" FROM "shp_products" p
    WHERE p."id" IN (${Prisma.join(productIds)}) AND ${predicate}
  `
  return new Set(rows.map((r) => r.id))
}

/** Drop the products this visitor should not be shown in a list. Returns the
 *  list untouched on a shop that hides nothing, having asked the database
 *  nothing either. */
export async function filterHiddenOutOfStock<T extends { id: string }>(products: T[]): Promise<T[]> {
  if (products.length === 0) return products
  const gate = await getStockGate()
  if (!gate.hideFromLists) return products
  const hidden = await outOfStockProductIds(products.map((p) => p.id))
  return products.filter((p) => !hidden.has(p.id))
}

/** Whether this product's own page should turn a shopper away, and whether the
 *  staff standing on it need telling that it does. One query, and only on a shop
 *  set to hide the page at all. */
export async function getProductPageStockGate(productId: string): Promise<{ notFound: boolean; staffPreview: boolean }> {
  const gate = await getStockGate()
  if (!gate.hideProductPage && !gate.staffPreview) return { notFound: false, staffPreview: false }
  const config = await getShopConfigCached()
  // Staff on a shop set to hide lists only are seeing the same page a shopper
  // would, so there is nothing to warn them about.
  if (gate.staffPreview && config.outOfStockVisibility !== 'HIDE_EVERYWHERE') {
    return { notFound: false, staffPreview: false }
  }
  const hidden = await outOfStockProductIds([productId])
  if (!hidden.has(productId)) return { notFound: false, staffPreview: false }
  return { notFound: gate.hideProductPage, staffPreview: gate.staffPreview }
}
