import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireShopUser } from '@/modules/shop/lib/access'
import { listCollectionProducts, addProductsToCollection, setCollectionProducts } from '@/modules/shop/lib/db'

// What is in one collection, and the two ways the admin screen changes it.
//
//   GET  - the collection's products in their listed order, with a picture and
//          a status per row.
//   POST - add these products to the end, leaving the existing order alone.
//   PUT  - this is now the whole membership, in this order. Covers both a
//          reorder and a removal, which are the same write from the database's
//          point of view.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireShopUser('shop.products', { allowAccess: true })
  if (gate.error) return gate.error
  const { id } = await params
  return NextResponse.json({ products: await listCollectionProducts(id) })
}

const Body = z.object({ productIds: z.array(z.string()) })

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireShopUser('shop.products')
  if (gate.error) return gate.error
  const { id } = await params
  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid products' }, { status: 400 })
  await addProductsToCollection(id, parsed.data.productIds)
  return NextResponse.json({ products: await listCollectionProducts(id) })
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireShopUser('shop.products')
  if (gate.error) return gate.error
  const { id } = await params
  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid products' }, { status: 400 })
  await setCollectionProducts(id, parsed.data.productIds)
  return NextResponse.json({ products: await listCollectionProducts(id) })
}
