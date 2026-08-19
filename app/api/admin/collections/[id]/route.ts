import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireShopUser } from '@/modules/shop/lib/access'
import { updateCollection, deleteCollection, setCollectionProducts } from '@/modules/shop/lib/db'
import { slugify, ensureUniqueCollectionSlug } from '@/modules/shop/lib/slug'

const Body = z.object({
  name: z.string().min(1).optional(),
  slug: z.string().optional(),
  description: z.string().nullable().optional(),
  imageId: z.string().nullable().optional(),
  position: z.number().int().optional(),
  metaTitle: z.string().nullable().optional(),
  metaDescription: z.string().nullable().optional(),
  ogImageId: z.string().nullable().optional(),
  regenerateSlug: z.boolean().optional(),
  productIds: z.array(z.string()).optional(),
})

// A collection's web address can be typed out by hand (`slug`) or derived from
// the name (`regenerateSlug`). A typed one wins - it is the more deliberate of
// the two - and either way it goes through the same tidy-up and uniqueness
// check, so no amount of punctuation in the box can produce a broken URL or
// collide with another collection.
async function resolveSlug(id: string, data: z.infer<typeof Body>): Promise<string | undefined> {
  if (data.slug !== undefined) {
    const base = slugify(data.slug)
    if (!base) return undefined
    return ensureUniqueCollectionSlug(base, id)
  }
  if (data.regenerateSlug && data.name) return ensureUniqueCollectionSlug(slugify(data.name), id)
  return undefined
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireShopUser('shop.products')
  if (gate.error) return gate.error
  const { id } = await params
  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid collection' }, { status: 400 })
  const { regenerateSlug: _regenerateSlug, productIds, slug: _slug, ...fields } = parsed.data
  const slug = await resolveSlug(id, parsed.data)
  await updateCollection(id, { ...fields, ...(slug ? { slug } : {}) })
  if (productIds) await setCollectionProducts(id, productIds)
  return NextResponse.json({ success: true, ...(slug ? { slug } : {}) })
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireShopUser('shop.products')
  if (gate.error) return gate.error
  const { id } = await params
  await deleteCollection(id)
  return NextResponse.json({ success: true })
}
