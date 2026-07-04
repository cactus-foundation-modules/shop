import { prisma } from '@/lib/db/prisma'
import { getShopConfigCached } from '@/modules/shop/lib/config'

// Atomic - backed by a Postgres sequence (shp_order_number_seq) so concurrent
// checkouts can never generate the same order number.
export async function generateOrderNumber(): Promise<string> {
  const config = await getShopConfigCached()
  const rows = await prisma.$queryRaw<{ nextval: bigint }[]>`
    SELECT nextval('shp_order_number_seq') AS nextval
  `
  const seq = rows[0]!.nextval.toString().padStart(6, '0')
  return `${config.orderNumberPrefix}${seq}`
}
