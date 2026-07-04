import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireShopUser } from '@/modules/shop/lib/access'
import { updateCategory, deleteCategory, getCategoryProductCount } from '@/modules/shop/lib/db'
import { slugify, ensureUniqueCategorySlug } from '@/modules/shop/lib/slug'

const Body = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  parentId: z.string().nullable().optional(),
  position: z.number().int().optional(),
  metaTitle: z.string().nullable().optional(),
  metaDescription: z.string().nullable().optional(),
  ogImageId: z.string().nullable().optional(),
  regenerateSlug: z.boolean().optional(),
})

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireShopUser('shop.products')
  if (gate.error) return gate.error
  const { id } = await params
  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid category' }, { status: 400 })
  const { regenerateSlug, ...fields } = parsed.data
  const slug = regenerateSlug && fields.name ? await ensureUniqueCategorySlug(slugify(fields.name), id) : undefined
  await updateCategory(id, { ...fields, ...(slug ? { slug } : {}) })
  return NextResponse.json({ success: true })
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireShopUser('shop.products')
  if (gate.error) return gate.error
  const { id } = await params
  const productCount = await getCategoryProductCount(id)
  if (productCount > 0) return NextResponse.json({ error: `Category has ${productCount} product(s) - remove them first.` }, { status: 409 })
  await deleteCategory(id)
  return NextResponse.json({ success: true })
}
