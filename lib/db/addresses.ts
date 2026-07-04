import { prisma } from '@/lib/db/prisma'
import type { ShpAddress, ShpSavedAddress } from '@/modules/shop/lib/types'

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
