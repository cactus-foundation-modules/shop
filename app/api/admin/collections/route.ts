import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireShopUser } from '@/modules/shop/lib/access'
import { listCollections, createCollection, getCollectionProductCounts, getCollectionPreviewImages } from '@/modules/shop/lib/db'
import { slugify, ensureUniqueCollectionSlug } from '@/modules/shop/lib/slug'

export async function GET() {
  const gate = await requireShopUser('shop.products', { allowAccess: true })
  if (gate.error) return gate.error
  // The counts ride along with the list so the admin screen can print how many
  // products each collection holds without a query per row - same shape the
  // categories list route returns.
  const [collections, productCounts, previewImages] = await Promise.all([
    listCollections(), getCollectionProductCounts(), getCollectionPreviewImages(),
  ])
  return NextResponse.json({ collections, productCounts, previewImages })
}

const Body = z.object({
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  shortDescription: z.string().nullable().optional(),
  imageId: z.string().nullable().optional(),
})

export async function POST(request: NextRequest) {
  const gate = await requireShopUser('shop.products')
  if (gate.error) return gate.error
  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid collection' }, { status: 400 })
  const slug = await ensureUniqueCollectionSlug(slugify(parsed.data.name))
  const { id } = await createCollection({ ...parsed.data, slug })
  return NextResponse.json({ id, slug }, { status: 201 })
}
