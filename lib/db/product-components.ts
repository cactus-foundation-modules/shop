import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db/prisma'
import { expandToParts, type KitParts, type KitPart, type UnitLine } from '@/modules/shop/lib/kit-units'

// Products made up of other products - see migration 075 for the whole idea and
// for why a kit's stock count is kept true by the database rather than here.
//
// What this file adds is the editing side (set a kit's parts, with the
// refusals a person can act on) and the reading side the stock moves lean on
// (which products are kits, what each is made of).

/** Same client shape recordStockMovement takes: a $transaction callback's, or prisma itself. */
type Db = Pick<typeof prisma, '$queryRaw' | '$executeRaw'>

/** The most distinct parts one kit can have. A ceiling well past anything real. */
export const KIT_MAX_PARTS = 40
/** The most of one part that go into one kit. */
export const KIT_MAX_PART_QUANTITY = 9999

export type ShpKitPart = {
  componentProductId: string
  name: string
  sku: string | null
  supplierSku: string | null
  quantity: number
  position: number
  trackInventory: boolean
  stockCount: number | null
  status: string
}

type PartRow = {
  component_product_id: string
  name: string
  sku: string | null
  supplier_sku: string | null
  quantity: number
  position: number
  track_inventory: boolean
  stock_count: number | null
  status: string
}

/** A kit's parts in the order the owner arranged them. Empty for an ordinary product. */
export async function getProductComponents(productId: string, db: Db = prisma): Promise<ShpKitPart[]> {
  const rows = await db.$queryRaw<PartRow[]>`
    SELECT pc."component_product_id", c."name", c."sku", c."supplier_sku", pc."quantity", pc."position",
           c."track_inventory", c."stock_count", c."status"
      FROM "shp_product_components" pc
      JOIN "shp_products" c ON c."id" = pc."component_product_id"
     WHERE pc."product_id" = ${productId}
     ORDER BY pc."position" ASC, c."name" ASC
  `
  return rows.map((r) => ({
    componentProductId: r.component_product_id,
    name: r.name,
    sku: r.sku,
    supplierSku: r.supplier_sku,
    quantity: Number(r.quantity),
    position: Number(r.position),
    trackInventory: r.track_inventory,
    stockCount: r.stock_count === null ? null : Number(r.stock_count),
    status: r.status,
  }))
}

/** Which of these products are kits, and what each is made of. Products that are not kits are absent. */
export async function getKitParts(productIds: readonly string[], db: Db = prisma): Promise<KitParts> {
  const ids = [...new Set(productIds)]
  const kits = new Map<string, KitPart[]>()
  if (ids.length === 0) return kits
  const rows = await db.$queryRaw<{ product_id: string; component_product_id: string; quantity: number }[]>`
    SELECT "product_id", "component_product_id", "quantity"
      FROM "shp_product_components"
     WHERE "product_id" IN (${Prisma.join(ids)})
     ORDER BY "position" ASC
  `
  for (const r of rows) {
    const list = kits.get(r.product_id) ?? []
    list.push({ componentProductId: r.component_product_id, quantity: Number(r.quantity) })
    kits.set(r.product_id, list)
  }
  return kits
}

/** `lines` with every kit replaced by its parts, summed per product. */
export async function expandLinesToParts(lines: readonly UnitLine[], db: Db = prisma): Promise<Map<string, number>> {
  const kits = await getKitParts(lines.map((l) => l.productId), db)
  return expandToParts(lines, kits)
}

/** The kits that use any of these products as a part, by part id. For refusing a delete. */
export async function kitsUsingProducts(productIds: readonly string[], db: Db = prisma): Promise<Map<string, string[]>> {
  const ids = [...new Set(productIds)]
  const out = new Map<string, string[]>()
  if (ids.length === 0) return out
  const rows = await db.$queryRaw<{ component_product_id: string; kit_name: string }[]>`
    SELECT pc."component_product_id", k."name" AS kit_name
      FROM "shp_product_components" pc
      JOIN "shp_products" k ON k."id" = pc."product_id"
     WHERE pc."component_product_id" IN (${Prisma.join(ids)})
     ORDER BY k."name" ASC
  `
  for (const r of rows) {
    const list = out.get(r.component_product_id) ?? []
    list.push(r.kit_name)
    out.set(r.component_product_id, list)
  }
  return out
}

/** Kits that use any of these products, for telling listeners about a count that moved with its part. */
export async function kitIdsUsingProducts(productIds: readonly string[], db: Db = prisma): Promise<string[]> {
  const ids = [...new Set(productIds)]
  if (ids.length === 0) return []
  const rows = await db.$queryRaw<{ product_id: string }[]>`
    SELECT DISTINCT "product_id" FROM "shp_product_components" WHERE "component_product_id" IN (${Prisma.join(ids)})
  `
  return rows.map((r) => r.product_id)
}

export type KitPartInput = { productId: string; quantity: number }
export type SetPartsResult = { ok: true; parts: ShpKitPart[] } | { ok: false; error: string }

/**
 * Replace a product's parts wholesale. An empty list turns it back into an
 * ordinary product (its count stays at whatever the parts last made it, ready
 * to be typed over).
 *
 * Every refusal is a sentence the owner can act on: the database would refuse
 * most of these too (migration 075), but with a constraint name.
 */
export async function setProductComponents(productId: string, input: readonly KitPartInput[]): Promise<SetPartsResult> {
  const merged = new Map<string, number>()
  for (const part of input) {
    const quantity = Math.trunc(Number(part.quantity))
    if (!Number.isFinite(quantity) || quantity < 1 || quantity > KIT_MAX_PART_QUANTITY) {
      return { ok: false, error: `Each part needs a quantity between 1 and ${KIT_MAX_PART_QUANTITY}.` }
    }
    merged.set(part.productId, (merged.get(part.productId) ?? 0) + quantity)
  }
  if (merged.size > KIT_MAX_PARTS) return { ok: false, error: `A kit can have at most ${KIT_MAX_PARTS} different parts.` }
  if (merged.has(productId)) return { ok: false, error: 'A product cannot be a part of itself.' }

  return prisma.$transaction(async (tx): Promise<SetPartsResult> => {
    const owner = await tx.$queryRaw<{ name: string }[]>`SELECT "name" FROM "shp_products" WHERE "id" = ${productId} FOR UPDATE`
    if (!owner[0]) return { ok: false, error: 'That product is not in the catalogue any more.' }

    const partIds = [...merged.keys()]
    if (partIds.length > 0) {
      const found = await tx.$queryRaw<{ id: string; name: string; is_kit: boolean }[]>`
        SELECT p."id", p."name",
               EXISTS (SELECT 1 FROM "shp_product_components" k WHERE k."product_id" = p."id") AS is_kit
          FROM "shp_products" p
         WHERE p."id" IN (${Prisma.join(partIds)})
      `
      if (found.length !== partIds.length) return { ok: false, error: 'One of those parts is not in the catalogue any more.' }
      const nested = found.find((p) => p.is_kit)
      if (nested) return { ok: false, error: `"${nested.name}" is itself made up of other products, so it cannot be a part of this one. Use its own parts instead.` }

      const usedAsPart = await tx.$queryRaw<{ kit_name: string }[]>`
        SELECT k."name" AS kit_name
          FROM "shp_product_components" pc
          JOIN "shp_products" k ON k."id" = pc."product_id"
         WHERE pc."component_product_id" = ${productId}
         LIMIT 1
      `
      if (usedAsPart[0]) return { ok: false, error: `This product is a part of "${usedAsPart[0].kit_name}", so it cannot also be made up of other products.` }
    }

    await tx.$executeRaw`DELETE FROM "shp_product_components" WHERE "product_id" = ${productId}`
    let position = 0
    for (const [partId, quantity] of merged) {
      await tx.$executeRaw`
        INSERT INTO "shp_product_components" ("product_id", "component_product_id", "quantity", "position")
        VALUES (${productId}, ${partId}, ${quantity}, ${position})
      `
      position += 1
    }
    return { ok: true, parts: await getProductComponents(productId, tx) }
  })
}
