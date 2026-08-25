// Best-seller ordering: what "popular" means for a product, and how the figure
// the grids sort on gets worked out.
//
// Two inputs, kept in two columns (see migrations/017_popularity.sql):
//
//   popularity_seed  a rank the shop is given - an imported supplier best-seller
//                    order, an owner's hand-set favourite. Higher is better.
//   popularity       what everything sorts on: the seed plus what this shop has
//                    actually sold. Derived, so never hand-edited.
//
// The blend is deliberately blunt: one genuine sale outranks any seed. A shop
// that has sold a thing knows more about it than a supplier's league table does,
// and a "best sellers" page whose top row is something nobody here has ever
// bought is not telling the truth. Below the sold products, the seed orders the
// long tail, so the page says something useful from day one.
//
// Sales roll up to the listing, not the variation. Orders record the concrete
// child product a shopper chose (a specific colour and width), while the grid
// shows the parent listing - so ten sales spread across ten colours make one
// popular listing rather than ten unremarkable ones. Shop cannot see variations
// itself, so a companion module maps child to parent through the
// `shop.product-sales-rollup` point. Precedent: shop.product-card-prices ->
// lib/card-price.ts.
import { prisma } from '@/lib/db/prisma'
import { Prisma } from '@prisma/client'
import { getInstalledManifests } from '@/lib/modules/live-status'
import { modulePublicExtensionPointComponents as moduleExtensionPointComponents } from '@/lib/modules/extension-points.public'

// How much one sold unit is worth against the seed. Any figure comfortably above
// the largest seed a catalogue will carry makes "sold beats unsold" true without
// a tie-break argument, and this one leaves room for 21,000 units of a single
// product before a 32-bit integer starts to sweat.
export const POPULARITY_SALES_WEIGHT = 100_000

// Sales older than this stop counting, so a hit from three catalogues ago cannot
// sit at the top of the page forever while the thing it was replaced by is
// buried underneath it.
export const POPULARITY_WINDOW_DAYS = 365

// Maps a concrete variation's product id to the listing it belongs to. Only the
// ids it recognises come back; anything absent is a listing in its own right and
// counts for itself.
export type ShopSalesRollupProvider = {
  parentsByChild: (productIds: string[]) => Promise<Record<string, string>>
}

const POINT = 'shop.product-sales-rollup'

type ExtensionPointEntry = { point: string; id: string }

/** Listing id for each of the given product ids that turns out to be a variation
 *  of something. Empty on a shop with no variations module, and runs no query
 *  there: no provider, no work. */
export async function resolveSalesParents(productIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (productIds.length === 0) return out

  const providers = moduleExtensionPointComponents[POINT] ?? {}
  if (Object.keys(providers).length === 0) return out

  const modules = await getInstalledManifests()

  for (const mod of modules) {
    const manifest = mod.manifest as { extensionPoints?: ExtensionPointEntry[] } | null
    if (!manifest?.extensionPoints) continue
    for (const entry of manifest.extensionPoints) {
      if (entry.point !== POINT) continue
      const provider = providers[entry.id] as ShopSalesRollupProvider | undefined
      if (!provider) continue
      try {
        const parents = await provider.parentsByChild(productIds)
        for (const [child, parent] of Object.entries(parents)) {
          if (!out.has(child)) out.set(child, parent)
        }
      } catch {
        // A provider that throws must not wipe the whole shop's ranking: its
        // products just count for themselves, as on a shop with no variations.
      }
    }
  }
  return out
}

/** Units sold per listing inside the window, variations already rolled up into
 *  their parent. Only money actually taken counts, and refunded units are taken
 *  back off - an order that was placed, paid and then sent back is not evidence
 *  of a best seller. */
export async function unitsSoldByProduct(): Promise<Map<string, number>> {
  const since = new Date(Date.now() - POPULARITY_WINDOW_DAYS * 24 * 60 * 60 * 1000)
  const rows = await prisma.$queryRaw<{ product_id: string; units: bigint }[]>`
    SELECT oi."product_id", SUM(GREATEST(oi."quantity" - oi."refunded_qty", 0))::bigint AS units
    FROM "shp_order_items" oi
    JOIN "shp_orders" o ON o."id" = oi."order_id"
    WHERE oi."product_id" IS NOT NULL
      AND o."created_at" >= ${since}
      AND o."payment_status" IN ('PAID', 'PARTIALLY_REFUNDED')
      AND o."status" NOT IN ('CANCELLED', 'REFUNDED')
    GROUP BY oi."product_id"
  `

  const parents = await resolveSalesParents(rows.map((r) => r.product_id))
  const out = new Map<string, number>()
  for (const row of rows) {
    const units = Number(row.units)
    if (units <= 0) continue
    const id = parents.get(row.product_id) ?? row.product_id
    out.set(id, (out.get(id) ?? 0) + units)
  }
  return out
}

/** Rewrite the sortable figure for every product. Two statements whatever the
 *  catalogue size: one to put everything back on its seed, one to lift the
 *  products with sales above it. Returns how many products have any ranking at
 *  all, which is the number worth showing an owner - a catalogue where that is
 *  zero has a best-seller sort that does nothing. */
export async function recomputePopularity(): Promise<{ ranked: number; sold: number }> {
  const sold = await unitsSoldByProduct()

  await prisma.$executeRaw`
    UPDATE "shp_products"
    SET "popularity" = "popularity_seed"
    WHERE "popularity" IS DISTINCT FROM "popularity_seed"
  `

  if (sold.size > 0) {
    const values = Prisma.join(
      [...sold].map(([id, units]) => Prisma.sql`(${id}, ${units}::int)`),
    )
    await prisma.$executeRaw`
      UPDATE "shp_products" p
      SET "popularity" = COALESCE(p."popularity_seed", 0) + s.units * ${POPULARITY_SALES_WEIGHT}
      FROM (VALUES ${values}) AS s(id, units)
      WHERE p."id" = s.id
    `
  }

  const counted = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*)::bigint AS count FROM "shp_products" WHERE "popularity" IS NOT NULL
  `
  return { ranked: Number(counted[0]?.count ?? 0), sold: sold.size }
}
