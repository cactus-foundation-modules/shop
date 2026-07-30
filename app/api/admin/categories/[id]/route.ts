import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireShopUser } from '@/modules/shop/lib/access'
import { updateCategory, deleteCategory, categoryReparentWouldCycle } from '@/modules/shop/lib/db'
import { fileCategoryImage } from '@/modules/shop/lib/media/category-media'
import { slugify, ensureUniqueCategorySlug } from '@/modules/shop/lib/slug'

const Body = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  shortDescription: z.string().nullable().optional(),
  imageUrl: z.string().nullable().optional(),
  // The designed description's whole builder document, saved on its own by the
  // full-screen category description builder. Shape-checked by Puck, not here.
  descriptionPuck: z.any().nullable().optional(),
  parentId: z.string().nullable().optional(),
  productDisplayMode: z.enum(['rollup', 'exact']).nullable().optional(),
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
  // Reject a move that would make a category its own ancestor - it would strand
  // the sub-tree and hang any recursive walk.
  if (fields.parentId != null && await categoryReparentWouldCycle(id, fields.parentId)) {
    return NextResponse.json({ error: 'A category cannot be moved inside itself or one of its own sub-categories.' }, { status: 400 })
  }
  const slug = regenerateSlug && fields.name ? await ensureUniqueCategorySlug(slugify(fields.name), id) : undefined
  await updateCategory(id, { ...fields, ...(slug ? { slug } : {}) })
  // File the picture in the category's own library folder, after the write so it
  // follows a rename or a move rather than the path the category had a moment
  // ago. A no-op when there is no picture, or when it is hosted elsewhere.
  await fileCategoryImage(id)
  return NextResponse.json({ success: true })
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireShopUser('shop.products')
  if (gate.error) return gate.error
  const { id } = await params
  // Cascades the whole sub-tree (parent_id ON DELETE CASCADE). Products keep
  // existing; they just lose their filing under these categories.
  await deleteCategory(id)
  return NextResponse.json({ success: true })
}
