import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireShopUser } from '@/modules/shop/lib/access'
import { getProductById } from '@/modules/shop/lib/db/products'
import {
  KIT_MAX_PARTS,
  KIT_MAX_PART_QUANTITY,
  getProductComponents,
  kitsUsingProducts,
  setProductComponents,
} from '@/modules/shop/lib/db/product-components'
import { notifyProductSaved } from '@/modules/shop/lib/product-saved'

// A product's parts: the products one of it is made up of, and how many of each.
// Serves a standalone product and a shop-variations child alike, because a
// variation child is an ordinary product row. See migration 075.

type Params = { params: Promise<{ id: string }> }

async function kitNamesUsing(id: string): Promise<string[]> {
  return (await kitsUsingProducts([id])).get(id) ?? []
}

/** What the editor needs to show: the parts, and what they currently make. */
async function describe(id: string) {
  const [parts, product] = await Promise.all([getProductComponents(id), getProductById(id)])
  return {
    parts,
    // The kits this product is a part of - the editor says so instead of
    // offering to make it a kit too.
    partOf: await kitNamesUsing(id),
    stock: product ? { tracked: product.trackInventory, count: product.stockCount } : null,
  }
}

export async function GET(_request: Request, { params }: Params) {
  const gate = await requireShopUser('shop.products', { allowAccess: true })
  if (gate.error) return gate.error
  const { id } = await params
  if (!(await getProductById(id))) return NextResponse.json({ error: 'Product not found' }, { status: 404 })
  return NextResponse.json(await describe(id))
}

const Body = z.object({
  parts: z
    .array(z.object({ productId: z.string().min(1), quantity: z.number().int().min(1).max(KIT_MAX_PART_QUANTITY) }))
    .max(KIT_MAX_PARTS, `A kit can have at most ${KIT_MAX_PARTS} different parts.`),
})

export async function PUT(request: Request, { params }: Params) {
  const gate = await requireShopUser('shop.products')
  if (gate.error) return gate.error
  const { id } = await params

  const parsed = Body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 })

  const result = await setProductComponents(id, parsed.data.parts)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })

  // The kit's count was just redone by the database; anything keeping an
  // outside listing in step with it needs telling.
  await notifyProductSaved(id, ['stockCount', 'trackInventory'])
  return NextResponse.json(await describe(id))
}
