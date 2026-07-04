import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireShopUser } from '@/modules/shop/lib/access'
import { updateCollection, deleteCollection, setCollectionProducts } from '@/modules/shop/lib/db'
import { slugify, ensureUniqueCollectionSlug } from '@/modules/shop/lib/slug'

const Body = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  imageId: z.string().nullable().optional(),
  position: z.number().int().optional(),
  metaTitle: z.string().nullable().optional(),
  metaDescription: z.string().nullable().optional(),
  ogImageId: z.string().nullable().optional(),
  regenerateSlug: z.boolean().optional(),
  productIds: z.array(z.string()).optional(),
})

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireShopUser('shop.products')
  if (gate.error) return gate.error
  const { id } = await params
  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid collection' }, { status: 400 })
  const { regenerateSlug, productIds, ...fields } = parsed.data
  const slug = regenerateSlug && fields.name ? await ensureUniqueCollectionSlug(slugify(fields.name), id) : undefined
  await updateCollection(id, { ...fields, ...(slug ? { slug } : {}) })
  if (productIds) await setCollectionProducts(id, productIds)
  return NextResponse.json({ success: true })
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireShopUser('shop.products')
  if (gate.error) return gate.error
  const { id } = await params
  await deleteCollection(id)
  return NextResponse.json({ success: true })
}
