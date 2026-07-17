import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { requireShopUser } from '@/modules/shop/lib/access'
import { bulkDeleteProducts, bulkSetProductStatus } from '@/modules/shop/lib/db'

const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('delete'), ids: z.array(z.string().min(1)).min(1) }),
  z.object({ action: z.literal('status'), ids: z.array(z.string().min(1)).min(1), status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']) }),
])

export async function POST(request: NextRequest) {
  const gate = await requireShopUser('shop.products')
  if (gate.error) return gate.error

  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 })

  // Cap the batch so one request can't try to update the whole table at once.
  const ids = parsed.data.ids.slice(0, 200)

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
