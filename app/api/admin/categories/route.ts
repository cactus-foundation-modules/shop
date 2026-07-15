import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireShopUser } from '@/modules/shop/lib/access'
import { listCategories, createCategory } from '@/modules/shop/lib/db'
import { slugify, ensureUniqueCategorySlug } from '@/modules/shop/lib/slug'

export async function GET() {
  const gate = await requireShopUser('shop.products', { allowAccess: true })
  if (gate.error) return gate.error
  const categories = await listCategories()
  return NextResponse.json({ categories })
}

const Body = z.object({
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  parentId: z.string().nullable().optional(),
  productDisplayMode: z.enum(['rollup', 'exact']).nullable().optional(),
})

export async function POST(request: NextRequest) {
  const gate = await requireShopUser('shop.products')
  if (gate.error) return gate.error
  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid category' }, { status: 400 })
  const slug = await ensureUniqueCategorySlug(slugify(parsed.data.name))
  const { id } = await createCategory({ ...parsed.data, slug })
  return NextResponse.json({ id, slug }, { status: 201 })
}
