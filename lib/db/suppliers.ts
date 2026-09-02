import { prisma } from '@/lib/db/prisma'
import { Prisma } from '@prisma/client'
import type { PuckData, ShpSupplier, ShpSupplierCatalogue, ShpSupplierWithCounts } from '@/modules/shop/lib/types'

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
    slug: (r.slug as string | null) ?? null,
    storefrontVisible: r.storefront_visible === true,
    shortDescription: (r.short_description as string | null) ?? null,
    description: (r.description as string | null) ?? null,
    // jsonb comes back from Prisma raw already parsed, and can be a bare scalar
    // if something ever wrote one - only an object is a Puck document.
    descriptionPuck: r.description_puck && typeof r.description_puck === 'object' ? (r.description_puck as PuckData) : null,
    metaTitle: (r.meta_title as string | null) ?? null,
    metaDescription: (r.meta_description as string | null) ?? null,
    createdAt: r.created_at as Date,
    updatedAt: r.updated_at as Date,
  }
}

/**
 * A supplier name as a page address: lower case, punctuation collapsed to single
 * hyphens, trimmed. The same shape migrations/034_supplier_pages.sql derives, so
 * a supplier added afterwards gets the address it would have been back-filled.
 * A name with nothing slug-shaped in it falls back to 'supplier', which
 * ensureUniqueSupplierSlug then numbers.
 */
export function supplierSlugFromName(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return slug || 'supplier'
}

/**
 * The given slug, or the first free numbering of it. The unique index is the
 * real guard - this only keeps the owner from being bounced with "that address
 * is taken" when they never chose the address in the first place.
 */
export async function ensureUniqueSupplierSlug(slug: string, exceptId?: string): Promise<string> {
  const taken = await prisma.$queryRaw<Array<{ slug: string }>>`
    SELECT "slug" FROM "shp_suppliers"
     WHERE "slug" IS NOT NULL
       AND (LOWER("slug") = LOWER(${slug}) OR LOWER("slug") LIKE LOWER(${slug + '-%'}))
       AND ("id" <> ${exceptId ?? ''})
  `
  const used = new Set(taken.map((t) => t.slug.toLowerCase()))
  if (!used.has(slug.toLowerCase())) return slug
  for (let n = 2; n < 1000; n++) {
    const candidate = `${slug}-${n}`
    if (!used.has(candidate)) return candidate
  }
  // A thousand suppliers sharing one name shape is not a real shop. Fall back to
  // something certainly free rather than looping forever.
  return `${slug}-${Date.now()}`
}

function mapCatalogue(r: Record<string, unknown>): ShpSupplierCatalogue {
  return {
    id: r.id as string,
    supplierId: r.supplier_id as string,
    name: r.name as string,
    sheetUrl: (r.sheet_url as string | null) ?? null,
    position: Number(r.position ?? 0),
  }
}

// Every column except description_puck. A designed write-up is a whole Puck
// document, and the list screen only needs to know whether there is one - the
// same reason CATEGORY_LIST_COLUMNS exists.
const SUPPLIER_LIST_COLUMNS = Prisma.sql`
  "id", "name", "slug", "storefront_visible", "short_description", "description",
  "meta_title", "meta_description", "account_number", "discount_percent", "status",
  "contact_name", "phone", "email", "address", "notes", "created_at", "updated_at"
`

export type SupplierCatalogueFields = {
  name: string
  sheetUrl?: string | null
}

export type SupplierFields = {
  name: string
  slug?: string | null
  storefrontVisible?: boolean
  shortDescription?: string | null
  description?: string | null
  descriptionPuck?: PuckData | null
  metaTitle?: string | null
  metaDescription?: string | null
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
  const [rows, counts, catalogues] = await Promise.all([
    prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT ${SUPPLIER_LIST_COLUMNS}, ("description_puck" IS NOT NULL) AS has_designed_description
        FROM "shp_suppliers" ORDER BY "name" ASC
    `,
    prisma.$queryRaw<Array<{ supplier: string; products: bigint; variations: bigint }>>`
      SELECT LOWER("supplier") AS supplier,
             COUNT(*) FILTER (WHERE "catalogue_hidden" = false) AS products,
             COUNT(*) FILTER (WHERE "catalogue_hidden" = true) AS variations
      FROM "shp_products"
      WHERE "supplier" IS NOT NULL AND "supplier" <> ''
      GROUP BY LOWER("supplier")
    `,
    // Every catalogue in one pass, grouped in JS below - same reasoning as the
    // counts: one query however many suppliers the directory holds.
    prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT * FROM "shp_supplier_catalogues" ORDER BY "position" ASC, "name" ASC
    `,
  ])

  const byName = new Map(counts.map((c) => [c.supplier, c]))
  const bySupplier = new Map<string, ShpSupplierCatalogue[]>()
  for (const row of catalogues) {
    const c = mapCatalogue(row)
    const list = bySupplier.get(c.supplierId)
    if (list) list.push(c)
    else bySupplier.set(c.supplierId, [c])
  }

  return rows.map((r) => {
    const supplier = mapSupplier(r)
    const hit = byName.get(supplier.name.toLowerCase())
    return {
      ...supplier,
      hasDesignedDescription: r.has_designed_description === true,
      productCount: Number(hit?.products ?? 0),
      variationCount: Number(hit?.variations ?? 0),
      catalogues: bySupplier.get(supplier.id) ?? [],
    }
  })
}

/**
 * Supplier names with their discount and catalogues, name-ordered - the shape an
 * export wants (the Google Sheet module's Suppliers tab), without the per-product
 * count aggregate that only the admin screen needs. Disabled suppliers are
 * included: the record and its catalogues still exist, they are simply not
 * offered on new products.
 */
export async function listSupplierCatalogues(): Promise<
  Array<{ id: string; name: string; status: 'ENABLED' | 'DISABLED'; discountPercent: number | null; catalogues: ShpSupplierCatalogue[] }>
> {
  const [suppliers, catalogues] = await Promise.all([
    prisma.$queryRaw<Array<{ id: string; name: string; status: 'ENABLED' | 'DISABLED'; discount_percent: unknown }>>`
      SELECT "id", "name", "status", "discount_percent" FROM "shp_suppliers" ORDER BY "name" ASC
    `,
    prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT * FROM "shp_supplier_catalogues" ORDER BY "position" ASC, "name" ASC
    `,
  ])

  const bySupplier = new Map<string, ShpSupplierCatalogue[]>()
  for (const row of catalogues) {
    const c = mapCatalogue(row)
    const list = bySupplier.get(c.supplierId)
    if (list) list.push(c)
    else bySupplier.set(c.supplierId, [c])
  }

  return suppliers.map((s) => ({
    id: s.id,
    name: s.name,
    status: s.status,
    // numeric(5,2) comes back from Prisma raw as a Decimal - see decimalToNumber.
    discountPercent: decimalToNumber(s.discount_percent),
    catalogues: bySupplier.get(s.id) ?? [],
  }))
}

/**
 * Replace a supplier's catalogues with exactly the list given, in the order
 * given. Delete-then-insert rather than a diff: the editor hands over the whole
 * list every save, ids are never shown to the owner, and nothing else in the
 * database points at a catalogue row, so there is no identity worth preserving.
 * Both halves run in one transaction, so a failure cannot leave the supplier
 * with no catalogues at all.
 */
export async function replaceSupplierCatalogues(supplierId: string, catalogues: SupplierCatalogueFields[]): Promise<void> {
  const statements: Prisma.PrismaPromise<unknown>[] = [
    prisma.$executeRaw`DELETE FROM "shp_supplier_catalogues" WHERE "supplier_id" = ${supplierId}`,
  ]
  catalogues.forEach((c, index) => {
    statements.push(prisma.$executeRaw`
      INSERT INTO "shp_supplier_catalogues" ("supplier_id", "name", "sheet_url", "position")
      VALUES (${supplierId}, ${c.name}, ${c.sheetUrl ?? null}, ${index})
    `)
  })
  await prisma.$transaction(statements)
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
  // Every supplier gets an address whether or not its page is ever published, so
  // switching one on later is one tick rather than a tick and a decision. An
  // address the owner typed is taken as typed (bar the tidy-up); one they left
  // blank is derived from the name, exactly as the back-fill did.
  const slug = await ensureUniqueSupplierSlug(supplierSlugFromName(data.slug?.trim() || data.name))
  const rows = await prisma.$queryRaw<[{ id: string }]>`
    INSERT INTO "shp_suppliers" (
      "name", "slug", "storefront_visible", "short_description", "description",
      "description_puck", "meta_title", "meta_description",
      "account_number", "discount_percent", "status",
      "contact_name", "phone", "email", "address", "notes"
    ) VALUES (
      ${data.name}, ${slug}, ${data.storefrontVisible === true},
      ${data.shortDescription ?? null}, ${data.description ?? null},
      ${data.descriptionPuck ? JSON.stringify(data.descriptionPuck) : null}::jsonb, ${data.metaTitle ?? null}, ${data.metaDescription ?? null},
      ${data.accountNumber ?? null}, ${data.discountPercent ?? null}, ${data.status ?? 'ENABLED'},
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
  if (fields.slug !== undefined) {
    // Blanking the address is not an option - the page has to live somewhere -
    // so an empty box falls back to the name, same as it did on create.
    const wanted = supplierSlugFromName(fields.slug?.trim() || '')
    sets.push(Prisma.sql`"slug" = ${await ensureUniqueSupplierSlug(wanted, id)}`)
  }
  if (fields.storefrontVisible !== undefined) sets.push(Prisma.sql`"storefront_visible" = ${fields.storefrontVisible}`)
  if (fields.shortDescription !== undefined) sets.push(Prisma.sql`"short_description" = ${fields.shortDescription}`)
  if (fields.description !== undefined) sets.push(Prisma.sql`"description" = ${fields.description}`)
  if (fields.descriptionPuck !== undefined) {
    sets.push(Prisma.sql`"description_puck" = ${fields.descriptionPuck ? JSON.stringify(fields.descriptionPuck) : null}::jsonb`)
  }
  if (fields.metaTitle !== undefined) sets.push(Prisma.sql`"meta_title" = ${fields.metaTitle}`)
  if (fields.metaDescription !== undefined) sets.push(Prisma.sql`"meta_description" = ${fields.metaDescription}`)
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


/**
 * The supplier behind a page address, published or not. Case-insensitive, the
 * same way getSupplierByName is, because the unique index is on LOWER(slug) and
 * a shopper typing the address in capitals should still land on the page.
 *
 * Deliberately does NOT check storefront_visible: the page route decides what an
 * unpublished supplier means (a 404 for a shopper), and the admin screens want
 * the row regardless.
 */
export async function getSupplierBySlug(slug: string): Promise<ShpSupplier | null> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT * FROM "shp_suppliers" WHERE LOWER("slug") = LOWER(${slug}) LIMIT 1
  `
  return rows[0] ? mapSupplier(rows[0]) : null
}

/**
 * The suppliers with a page on the site, name-ordered. What the sitemap lists,
 * what the menu builder offers and what a supplier index prints.
 *
 * DISABLED suppliers are included where their page is published: disabling stops
 * the name being offered on new products, which says nothing about whether the
 * range they supplied is still on sale. Unpublishing the page is the switch for
 * that, and it is right here beside it.
 */
export async function listStorefrontSuppliers(): Promise<Array<{ id: string; name: string; slug: string; shortDescription: string | null }>> {
  const rows = await prisma.$queryRaw<Array<{ id: string; name: string; slug: string; short_description: string | null }>>`
    SELECT "id", "name", "slug", "short_description"
      FROM "shp_suppliers"
     WHERE "storefront_visible" = true AND "slug" IS NOT NULL
     ORDER BY "name" ASC
  `
  return rows.map((r) => ({ id: r.id, name: r.name, slug: r.slug, shortDescription: r.short_description }))
}
