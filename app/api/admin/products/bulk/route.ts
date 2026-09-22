import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { requireShopUser } from '@/modules/shop/lib/access'
import { bulkDeleteProducts, bulkSetProductStatus } from '@/modules/shop/lib/db'
import { BULK_PRODUCT_MAX_IDS } from '@/modules/shop/lib/admin-input-limits'

// Capped so one request cannot try to update the whole table at once, and
// refused outright past the cap rather than trimmed to it - the orders list's
// bulk change does the same. A trimmed batch answered "done" with the tail of
// the selection untouched, which reads as success to whoever asked for all of
// it. The products list never sends more than a page's worth.
const Ids = z.array(z.string().min(1)).min(1)
  .max(BULK_PRODUCT_MAX_IDS, `That is more than ${BULK_PRODUCT_MAX_IDS} products at once - select fewer and try again.`)

const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('delete'), ids: Ids }),
  z.object({ action: z.literal('status'), ids: Ids, status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']) }),
])

export async function POST(request: NextRequest) {
  const gate = await requireShopUser('shop.products')
  if (gate.error) return gate.error

  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 })

  const ids = parsed.data.ids

  try {
    if (parsed.data.action === 'delete') {
      const count = await bulkDeleteProducts(ids)
      return NextResponse.json({ success: true, count })
    }
    const count = await bulkSetProductStatus(ids, parsed.data.status)
    return NextResponse.json({ success: true, count })
  } catch (err) {
    // A product still tied to another module's data (e.g. it backs live product
    // options) can refuse to delete. Say so plainly rather than 500-ing.
    const isFkViolation = err instanceof Prisma.PrismaClientKnownRequestError
      && (err.code === 'P2003' || (err.code === 'P2010' && String(err.meta?.message ?? '').includes('foreign key')))
    if (isFkViolation) {
      return NextResponse.json({ error: 'Some of those products are still linked to other data and could not be deleted.' }, { status: 409 })
    }
    throw err
  }
}
