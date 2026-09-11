import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireShopUser } from '@/modules/shop/lib/access'
import { listCategories, createCategory, getCategoryProductCounts } from '@/modules/shop/lib/db'
import { getCategoryFaqSets } from '@/modules/shop/lib/db/catalogue'
import { fileCategoryImage } from '@/modules/shop/lib/media/category-media'
import { slugify, ensureUniqueCategorySlug } from '@/modules/shop/lib/slug'

export async function GET() {
  const gate = await requireShopUser('shop.products', { allowAccess: true })
  if (gate.error) return gate.error
  // FAQ sets come alongside rather than on each row: listCategories feeds public
  // pages too, and none of those print a question (see getCategoryFaqSets).
  // Only categories that actually carry questions appear in the map.
  const [categories, productCounts, categoryFaqs] = await Promise.all([
    listCategories(), getCategoryProductCounts(), getCategoryFaqSets(),
  ])
  return NextResponse.json({ categories, productCounts, categoryFaqs })
}

const Body = z.object({
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  shortDescription: z.string().nullable().optional(),
  imageUrl: z.string().nullable().optional(),
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
  // A category created with a picture already on it (imports, scripted setup)
  // files it straight away; the admin's own "New category" prompt asks for a name
  // only, so this is a no-op there.
  if (parsed.data.imageUrl) await fileCategoryImage(id)
  return NextResponse.json({ id, slug }, { status: 201 })
}
