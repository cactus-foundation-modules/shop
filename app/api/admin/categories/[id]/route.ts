import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireShopUser } from '@/modules/shop/lib/access'
import { getCategoryById, updateCategory, deleteCategory, categoryReparentWouldCycle } from '@/modules/shop/lib/db'
import { findMediaDrift } from '@/modules/shop/lib/media/refile'
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
  // Read before the write: whether this rename moved anybody's files decides
  // whether the answer carries a filing warning, and afterwards there is nothing
  // left to compare against.
  const before = await getCategoryById(id)
  await updateCategory(id, { ...fields, ...(slug ? { slug } : {}) })
  // File the picture in the category's own library folder, after the write so it
  // follows a rename or a move rather than the path the category had a moment
  // ago. A no-op when there is no picture, or when it is hosted elsewhere.
  await fileCategoryImage(id)

  // A product's files are filed under its category's NAME, and that path is
  // stamped when each file is written. Renaming or re-parenting a category
  // therefore strands every file beneath it under the old spelling - which is
  // how one category came to appear twice in the media library with its pictures
  // split between the two.
  //
  // The filing is not put right here: each product means real copies in storage,
  // and a rename that quietly turned into a thousand of them would either time
  // out half done or leave the editor staring at a spinner. The drift is counted
  // and handed back instead, so the screen can offer to tidy it up and show it
  // happening. Counting is read-only, so a failure here must not fail the rename
  // that has already been saved.
  const renamed = fields.name !== undefined && before !== null && fields.name !== before.name
  const moved = fields.parentId !== undefined && before !== null && fields.parentId !== before.parentId
  let mediaDrift: { products: number; files: number } | null = null
  if (renamed || moved) {
    try {
      const drifted = await findMediaDrift()
      if (drifted.length > 0) {
        mediaDrift = {
          products: drifted.length,
          files: drifted.reduce((sum, d) => sum + d.fileCount, 0),
        }
      }
    } catch (err) {
      console.warn(`[shop] could not measure media filing drift after renaming category ${id}:`, err)
    }
  }

  return NextResponse.json({ success: true, mediaDrift })
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
