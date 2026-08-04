import { prisma } from '@/lib/db/prisma'
import type { ShpMemberCart, ShpMemberCartLine } from '@/modules/shop/lib/types'

// The signed-in shopper's basket, stored server-side so it follows them from
// one device to the next. Read/written only by the member cart route and the
// GDPR export; nothing here prices or validates anything, which stays the job
// of cart validate and checkout.

// Belt and braces against a basket that grew silly (a stuck sync loop, a bored
// visitor with a script): the row is one member's shopping list, not a store.
export const MEMBER_CART_MAX_LINES = 200

function mapCart(r: Record<string, unknown>): ShpMemberCart {
  const lines = r.lines
  return {
    memberId: r.member_id as string,
    lines: Array.isArray(lines) ? (lines as ShpMemberCartLine[]) : [],
    updatedAt: r.updated_at as Date,
  }
}

export async function getMemberCart(memberId: string): Promise<ShpMemberCart | null> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT "member_id", "lines", "updated_at" FROM "shp_member_carts" WHERE "member_id" = ${memberId} LIMIT 1
  `
  return rows[0] ? mapCart(rows[0]) : null
}

// Whole-basket replace, not a merge: the browser holds the merged copy and is
// the one deciding what the basket now is. `updated_at` is bumped on every
// write and handed back, because that stamp is how the other device works out
// whether what it is holding has been overtaken.
export async function saveMemberCart(memberId: string, lines: ShpMemberCartLine[]): Promise<ShpMemberCart> {
  const rows = await prisma.$queryRaw<[Record<string, unknown>]>`
    INSERT INTO "shp_member_carts" ("member_id", "lines", "updated_at")
    VALUES (${memberId}, ${JSON.stringify(lines)}::jsonb, CURRENT_TIMESTAMP)
    ON CONFLICT ("member_id") DO UPDATE
      SET "lines" = EXCLUDED."lines", "updated_at" = CURRENT_TIMESTAMP
    RETURNING "member_id", "lines", "updated_at"
  `
  return mapCart(rows[0])
}

export async function deleteMemberCart(memberId: string): Promise<void> {
  await prisma.$executeRaw`DELETE FROM "shp_member_carts" WHERE "member_id" = ${memberId}`
}
