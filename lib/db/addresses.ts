import { prisma } from '@/lib/db/prisma'
import type { ShpAddress, ShpSavedAddress } from '@/modules/shop/lib/types'

// Just enough of a Prisma client to run a tagged-template statement, so a test
// can hand in a client pointed at its own throwaway database.
type RawExecutor = { $executeRaw: typeof prisma.$executeRaw }

function mapAddress(r: Record<string, unknown>): ShpSavedAddress {
  return {
    id: r.id as string,
    memberId: r.member_id as string,
    label: (r.label as string | null) ?? null,
    isDefault: r.is_default as boolean,
    address: r.address as ShpAddress,
    createdAt: r.created_at as Date,
    updatedAt: r.updated_at as Date,
  }
}

export async function listSavedAddresses(memberId: string): Promise<ShpSavedAddress[]> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT * FROM "shp_saved_addresses" WHERE "member_id" = ${memberId} ORDER BY "is_default" DESC, "created_at" ASC
  `
  return rows.map(mapAddress)
}

export async function getSavedAddressById(id: string, memberId: string): Promise<ShpSavedAddress | null> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT * FROM "shp_saved_addresses" WHERE "id" = ${id} AND "member_id" = ${memberId} LIMIT 1
  `
  return rows[0] ? mapAddress(rows[0]) : null
}

// Single-default enforcement: setting a new default clears every other row
// for the member first, all inside one transaction.
export async function createSavedAddress(memberId: string, label: string | null, address: ShpAddress, isDefault: boolean): Promise<{ id: string }> {
  return prisma.$transaction(async (tx) => {
    if (isDefault) {
      await tx.$executeRaw`UPDATE "shp_saved_addresses" SET "is_default" = false WHERE "member_id" = ${memberId}`
    }
    const rows = await tx.$queryRaw<[{ id: string }]>`
      INSERT INTO "shp_saved_addresses" ("member_id", "label", "is_default", "address")
      VALUES (${memberId}, ${label}, ${isDefault}, ${JSON.stringify(address)}::jsonb)
      RETURNING "id"
    `
    return rows[0]
  })
}

export async function updateSavedAddress(
  id: string, memberId: string, fields: { label?: string | null; address?: ShpAddress; isDefault?: boolean }
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    if (fields.isDefault) {
      await tx.$executeRaw`UPDATE "shp_saved_addresses" SET "is_default" = false WHERE "member_id" = ${memberId}`
    }
    if (fields.label !== undefined) await tx.$executeRaw`UPDATE "shp_saved_addresses" SET "label" = ${fields.label}, "updated_at" = CURRENT_TIMESTAMP WHERE "id" = ${id} AND "member_id" = ${memberId}`
    if (fields.address !== undefined) await tx.$executeRaw`UPDATE "shp_saved_addresses" SET "address" = ${JSON.stringify(fields.address)}::jsonb, "updated_at" = CURRENT_TIMESTAMP WHERE "id" = ${id} AND "member_id" = ${memberId}`
    if (fields.isDefault !== undefined) await tx.$executeRaw`UPDATE "shp_saved_addresses" SET "is_default" = ${fields.isDefault}, "updated_at" = CURRENT_TIMESTAMP WHERE "id" = ${id} AND "member_id" = ${memberId}`
  })
}

export async function deleteSavedAddress(id: string, memberId: string): Promise<void> {
  await prisma.$executeRaw`DELETE FROM "shp_saved_addresses" WHERE "id" = ${id} AND "member_id" = ${memberId}`
}

// Two addresses are the same address if a parcel for either would arrive at the
// same door. Case and spacing are noise for that question, so the key drops
// them: a shopper who types "SW1A 1AA" on one order and "sw1a1aa" on the next
// should end up with one entry in their address book, not two. Only the three
// fields that pick out a door are compared - a name change or a new phone
// number is the same address with a different recipient, not a second one.
//
// The SQL in rememberAddressForMember below rebuilds this exact key in
// Postgres. Change one and you must change the other or the dedupe stops
// matching and every order files a fresh copy. Exported for the test that
// pins the normalisation, which is the half of that pair a machine can check.
export function addressDoorKey(a: { line1?: string; line2?: string; postcode?: string }): string {
  return `${a.line1 ?? ''}|${a.line2 ?? ''}|${a.postcode ?? ''}`.replace(/\s+/g, '').toLowerCase()
}

// Files an address the member has actually ordered to into their address book,
// unless that door is already in there.
//
// Deliberately one statement rather than read-then-write: the callers are the
// order lifecycle, where the same order can be confirmed by the browser and by
// a provider webhook at nearly the same moment, and a duplicate address is a
// nuisance a shopper then has to tidy up by hand.
//
// The member's first address becomes their default, since a book with one
// address and no default in it would offer nothing at checkout. `canBecomeDefault`
// takes that away from an address that was never a delivery address: a billing
// address made default would be the one offered to deliver to next time, and it
// carries no name and no phone number because the billing form asks for neither.
//
// "First" therefore means "the first that is allowed to be the default", not
// "the first row". Asking whether the book is empty put a member whose opening
// order billed elsewhere in a book with no default in it at all: the billing
// address went in first, declined the job, and the delivery address behind it
// then found the book no longer empty.
export async function rememberAddressForMember(
  memberId: string,
  address: ShpAddress,
  // `client` is how the live-database probe in lib/backup/shop-sql.test.ts runs
  // this exact statement against a throwaway database rather than a copy of it
  // that has drifted. Raw SQL is a string to tsc, to eslint and to the build, so
  // Postgres executing it is the only thing that proves it parses.
  opts: { label?: string | null; canBecomeDefault?: boolean; client?: RawExecutor } = {},
): Promise<void> {
  const label = opts.label ?? null
  const canBecomeDefault = opts.canBecomeDefault ?? true
  const db = opts.client ?? prisma
  await db.$executeRaw`
    INSERT INTO "shp_saved_addresses" ("member_id", "label", "is_default", "address")
    SELECT
      ${memberId},
      ${label},
      ${canBecomeDefault}::boolean AND NOT EXISTS (SELECT 1 FROM "shp_saved_addresses" WHERE "member_id" = ${memberId} AND "is_default"),
      ${JSON.stringify(address)}::jsonb
    WHERE NOT EXISTS (
      SELECT 1 FROM "shp_saved_addresses"
      WHERE "member_id" = ${memberId}
        AND lower(regexp_replace(
          coalesce("address"->>'line1', '') || '|' ||
          coalesce("address"->>'line2', '') || '|' ||
          coalesce("address"->>'postcode', ''),
          -- POSIX class, not \s: a backslash in a tagged template is a trap
          -- nobody needs when there is an escape-free way to say the same thing.
          '[[:space:]]', '', 'g'
        )) = ${addressDoorKey(address)}
    )
  `
}
