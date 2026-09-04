import { prisma } from '@/lib/db/prisma'
import { getShopConfigCached } from './config'
import { orderTrackingRootSlug } from './order-tracking'

// Answers core's "does any module own this bare slug?" question, registered
// through publicRootSlug in cactus.module.json.
//
// Core asks only after it has failed to find an info page or a module index at
// the slug, so core content always wins a collision.
//
// Two things can be claimed, and they are independent of one another:
//
//   the order tracker - one specific word from the shop's own settings, so the
//                       shop has a front-door address for "where is my order".
//                       Claimed whatever the product URL style is: it has
//                       nothing to do with where products live.
//   a product         - only while the shop is on the ROOT product URL style.
//
// The tracker is asked first, for the reason spelt out in app/root/[slug]: a
// product that happened to be slugged 'track-order' would otherwise take the
// support page away from the shop that set it.
export async function shopClaimsRootSlug(slug: string): Promise<boolean> {
  const config = await getShopConfigCached()

  if (orderTrackingRootSlug(config) === slug) return true

  if (config.productUrlStyle !== 'ROOT') return false

  // Deliberately matches ANY product row, visible or not: a catalogue-hidden
  // variant child still owns its deep-link address (the page it hands back
  // resolves the alias to its parent exactly as /shop/products/<slug> does), and
  // a draft or inactive product's address 404s from inside the page, exactly as
  // the prefixed route always has.
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "shp_products" WHERE "slug" = ${slug} LIMIT 1
  `
  return rows.length > 0
}
