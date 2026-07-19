import { prisma } from '@/lib/db/prisma'
import { Prisma } from '@prisma/client'
import type { ShpSupplier, ShpSupplierWithCounts } from '@/modules/shop/lib/types'

// ---------------------------------------------------------------------------
// Suppliers
//
// The directory behind the free-text supplier name on a product. Products are
// linked by name, not id (see migrations/007_suppliers.sql), so every write that
// changes a supplier's name has to carry the products with it - renameSupplier
// does both halves in one transaction.
// ---------------------------------------------------------------------------

// numeric(5,2) comes back from Prisma raw as a Decimal, never a JS number.
function decimalToNumber(v: unknown): number | null {
  if (v == null) return null
  if (v instanceof Prisma.Decimal) return v.toNumber()
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function mapSupplier(r: Record<string, unknown>): ShpSupplier {
  return {
    id: r.id as string,
    name: r.name as string,
    accountNumber: (r.account_number as string | null) ?? null,
    discountPercent: decimalToNumber(r.discount_percent),
    status: (r.status as 'ENABLED' | 'DISABLED') ?? 'ENABLED',
    contactName: (r.contact_name as string | null) ?? null,
    phone: (r.phone as string | null) ?? null,
    email: (r.email as string | null) ?? null,
    address: (r.address as string | null) ?? null,
    notes: (r.notes as string | null) ?? null,
    createdAt: r.created_at as Date,
    updatedAt: r.updated_at as Date,
  }
}

export type SupplierFields = {
  name: string
  accountNumber?: string | null
  discountPercent?: number | null
  status?: 'ENABLED' | 'DISABLED'
  contactName?: string | null
  phone?: string | null
  email?: string | null
  address?: string | null
  notes?: string | null
}

/**
 * Every supplier, each with how many catalogue products and how many variation
 * rows carry its name. The counts come from one grouped pass over shp_products
 * rather than a per-supplier subquery, so the page costs two queries however
 * many suppliers there are.
 *
 * The split is catalogue_hidden: false for a product a shopper can browse to,
 * true for a variation child row. That is a shop-owned column, so the counts
 * work whether or not the variations module is installed.
 */
export async function listSuppliersWithCounts(): Promise<ShpSupplierWithCounts[]> {
  const [rows, counts] = await Promise.all([
    prisma.$queryRaw<Record<string, unknown>[]>`SELECT * FROM "shp_suppliers" ORDER BY "name" ASC`,
    prisma.$queryRaw<Array<{ supplier: string; products: bigint; variations: bigint }>>`
      SELECT LOWER("supplier") AS supplier,
             COUNT(*) FILTER (WHERE "catalogue_hidden" = false) AS products,
             COUNT(*) FILTER (WHERE "catalogue_hidden" = true) AS variations
      FROM "shp_products"
      WHERE "supplier" IS NOT NULL AND "supplier" <> ''
      GROUP BY LOWER("supplier")
    `,
  ])

  const byName = new Map(counts.map((c) => [c.supplier, c]))
  return rows.map((r) => {
    const supplier = mapSupplier(r)
    const hit = byName.get(supplier.name.toLowerCase())
    return {
      ...supplier,
      productCount: Number(hit?.products ?? 0),
      variationCount: Number(hit?.variations ?? 0),
    }
  })
}

/** Enabled suppliers only, name-ordered - what the product/variation picker offers. */
export async function listSupplierNames(): Promise<Array<{ id: string; name: string }>> {
  return prisma.$queryRaw<Array<{ id: string; name: string }>>`
    SELECT "id", "name" FROM "shp_suppliers" WHERE "status" = 'ENABLED' ORDER BY "name" ASC
  `
}

export async function getSupplierById(id: string): Promise<ShpSupplier | null> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`SELECT * FROM "shp_suppliers" WHERE "id" = ${id} LIMIT 1`
  return rows[0] ? mapSupplier(rows[0]) : null
}

/** Case-insensitive, matching the unique index the name is stored under. */
export async function getSupplierByName(name: string): Promise<ShpSupplier | null> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT * FROM "shp_suppliers" WHERE LOWER("name") = LOWER(${name}) LIMIT 1
  `
  return rows[0] ? mapSupplier(rows[0]) : null
}

export async function createSupplier(data: SupplierFields): Promise<{ id: string }> {
  const rows = await prisma.$queryRaw<[{ id: string }]>`
    INSERT INTO "shp_suppliers" (
      "name", "account_number", "discount_percent", "status",
      "contact_name", "phone", "email", "address", "notes"
    ) VALUES (
      ${data.name}, ${data.accountNumber ?? null}, ${data.discountPercent ?? null}, ${data.status ?? 'ENABLED'},
      ${data.contactName ?? null}, ${data.phone ?? null}, ${data.email ?? null}, ${data.address ?? null}, ${data.notes ?? null}
    )
    RETURNING "id"
  `
  return rows[0]
}

/**
 * Update everything except the name. A name change goes through renameSupplier
 * instead, because the products filed under the old name have to move with it.
 */
export async function updateSupplier(id: string, fields: Partial<Omit<SupplierFields, 'name'>>): Promise<void> {
  const sets: Prisma.Sql[] = []
  if (fields.accountNumber !== undefined) sets.push(Prisma.sql`"account_number" = ${fields.accountNumber}`)
  if (fields.discountPercent !== undefined) sets.push(Prisma.sql`"discount_percent" = ${fields.discountPercent}`)
  if (fields.status !== undefined) sets.push(Prisma.sql`"status" = ${fields.status}`)
  if (fields.contactName !== undefined) sets.push(Prisma.sql`"contact_name" = ${fields.contactName}`)
  if (fields.phone !== undefined) sets.push(Prisma.sql`"phone" = ${fields.phone}`)
  if (fields.email !== undefined) sets.push(Prisma.sql`"email" = ${fields.email}`)
  if (fields.address !== undefined) sets.push(Prisma.sql`"address" = ${fields.address}`)
  if (fields.notes !== undefined) sets.push(Prisma.sql`"notes" = ${fields.notes}`)
  if (sets.length === 0) return
  sets.push(Prisma.sql`"updated_at" = CURRENT_TIMESTAMP`)
  await prisma.$executeRaw`UPDATE "shp_suppliers" SET ${Prisma.join(sets, ', ')} WHERE "id" = ${id}`
}

/**
 * Rename a supplier and re-file every product and variation that named it, in
 * one transaction. Without the second statement a rename would silently orphan
 * the whole catalogue behind it and the new record would show a count of zero.
 */
export async function renameSupplier(id: string, oldName: string, newName: string): Promise<void> {
  await prisma.$transaction([
    prisma.$executeRaw`UPDATE "shp_suppliers" SET "name" = ${newName}, "updated_at" = CURRENT_TIMESTAMP WHERE "id" = ${id}`,
    prisma.$executeRaw`UPDATE "shp_products" SET "supplier" = ${newName}, "updated_at" = CURRENT_TIMESTAMP WHERE LOWER("supplier") = LOWER(${oldName})`,
  ])
}

/**
 * Delete a supplier record. Products keep the name they had - deleting a
 * directory entry is tidying the address book, not a decision to forget where
 * several hundred products came from. Re-adding the same name picks them all
 * back up, since the link was only ever the name.
 */
export async function deleteSupplier(id: string): Promise<void> {
  await prisma.$executeRaw`DELETE FROM "shp_suppliers" WHERE "id" = ${id}`
}
