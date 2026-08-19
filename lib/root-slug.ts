import { prisma } from '@/lib/db/prisma'
import { getShopConfigCached } from './config'

// Answers core's "does any module own this bare slug?" question, registered
// through publicRootSlug in cactus.module.json.
//
// Core asks only after it has failed to find an info page or a module index at
// the slug, so core content always wins a collision. Claims nothing at all
// while the shop is on the default /shop/products/<slug> style.
//
// Deliberately matches ANY product row, visible or not: a catalogue-hidden
// variant child still owns its deep-link address (the page it hands back
// resolves the alias to its parent exactly as /shop/products/<slug> does), and
// a draft or inactive product's address 404s from inside the page, exactly as
// the prefixed route always has.
export async function shopClaimsRootSlug(slug: string): Promise<boolean> {
  const config = await getShopConfigCached()
  if (config.productUrlStyle !== 'ROOT') return false

  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "shp_products" WHERE "slug" = ${slug} LIMIT 1
  `
  return rows.length > 0
}
