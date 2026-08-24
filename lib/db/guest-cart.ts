import { prisma } from '@/lib/db/prisma'
import type { ShpGuestCart, ShpMemberCartLine } from '@/modules/shop/lib/types'

// The basket of a shopper who is not signed in, stored server-side so it is not
// lost with a cleared cache and so the shop knows what is in it without reading
// the shopper's own browser storage.
//
// Deliberately the same shape and the same rules as lib/db/member-cart.ts: a
// whole-basket replace, a bumped stamp handed back, nothing priced or validated
// here. The only differences are the key (a cookie id rather than a member) and
// the sweep below, because nobody ever comes back to claim a guest row.
//
// Lines only. Nothing a shopper types into the checkout is stored here - see the
// note at the top of migrations/026_guest_carts.sql for why that boundary is the
// whole point of the table.

export const GUEST_CART_MAX_LINES = 200

// How long a row is kept after its last touch. Twice the life of the cookie
// that points at it, so a basket is never swept out from under a browser still
// holding the id, and a browser that never comes back leaves nothing behind for
// long.
const RETENTION_DAYS = 60

// The sweep costs a DELETE, so it does not ride on every basket keystroke. One
// write in this many does it, which on any real shop is several a day and on a
// quiet one is still comfortably more often than the retention window.
const SWEEP_ODDS = 50

function mapCart(r: Record<string, unknown>): ShpGuestCart {
  const lines = r.lines
  return {
    cartId: r.cart_id as string,
    lines: Array.isArray(lines) ? (lines as ShpMemberCartLine[]) : [],
    updatedAt: r.updated_at as Date,
  }
}

export async function getGuestCart(cartId: string): Promise<ShpGuestCart | null> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT "cart_id", "lines", "updated_at" FROM "shp_guest_carts" WHERE "cart_id" = ${cartId} LIMIT 1
  `
  return rows[0] ? mapCart(rows[0]) : null
}

export async function saveGuestCart(cartId: string, lines: ShpMemberCartLine[]): Promise<ShpGuestCart> {
  const rows = await prisma.$queryRaw<[Record<string, unknown>]>`
    INSERT INTO "shp_guest_carts" ("cart_id", "lines", "updated_at")
    VALUES (${cartId}, ${JSON.stringify(lines)}::jsonb, CURRENT_TIMESTAMP)
    ON CONFLICT ("cart_id") DO UPDATE
      SET "lines" = EXCLUDED."lines", "updated_at" = CURRENT_TIMESTAMP
    RETURNING "cart_id", "lines", "updated_at"
  `
  await sweepGuestCarts()
  return mapCart(rows[0])
}

export async function deleteGuestCart(cartId: string): Promise<void> {
  await prisma.$executeRaw`DELETE FROM "shp_guest_carts" WHERE "cart_id" = ${cartId}`
}

/** Housekeeping on the way past, the same bargain lib/checkout-draft.ts strikes:
 *  one DELETE now and then beats a cron job for one DELETE. Failure is ignored
 *  on purpose - a sweep that cannot run must never cost a shopper their add to
 *  basket. */
export async function sweepGuestCarts(): Promise<void> {
  if (Math.random() * SWEEP_ODDS >= 1) return
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000)
  await prisma
    .$executeRaw`DELETE FROM "shp_guest_carts" WHERE "updated_at" < ${cutoff}`
    .catch(() => 0)
}
