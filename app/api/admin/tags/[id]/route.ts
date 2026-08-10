import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireShopUser } from '@/modules/shop/lib/access'
import { deleteTag, updateTag } from '@/modules/shop/lib/db'
import { slugify, ensureUniqueTagSlug } from '@/modules/shop/lib/slug'

// Slug is edited on purpose, not regenerated behind a rename the way a
// collection's is: a tag's slug is load-bearing. It is what the Product Grid and
// filter blocks are pointed at (`tagSlug`), what `?tag=` on the public products
// API takes, and what the tag's own page lives at. Renaming "New in" to "Just
// landed" must not silently move /shop/tag/new-in out from under whoever linked
// to it. The screen offers the slug as its own field and warns before changing
// one; `regenerateSlug` remains for callers that do want the old behaviour.
const Body = z.object({
  name: z.string().min(1).max(60).optional(),
  slug: z.string().min(1).max(80).optional(),
  regenerateSlug: z.boolean().optional(),
  description: z.string().nullable().optional(),
  storefrontVisible: z.boolean().optional(),
  badgeEnabled: z.boolean().optional(),
  badgeLabel: z.string().nullable().optional(),
  badgeBg: z.string().nullable().optional(),
  badgeBgDark: z.string().nullable().optional(),
  badgeText: z.string().nullable().optional(),
  badgeTextDark: z.string().nullable().optional(),
  position: z.number().int().optional(),
  metaTitle: z.string().nullable().optional(),
  metaDescription: z.string().nullable().optional(),
})

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireShopUser('shop.products')
  if (gate.error) return gate.error
  const { id } = await params
  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid tag' }, { status: 400 })
  const { regenerateSlug, ...fields } = parsed.data
  if (fields.name !== undefined) fields.name = fields.name.trim()
  // An explicit slug still goes through slugify and the uniqueness check, so a
  // typed "Summer Sale!" cannot land as a url nobody can reach, and two tags
  // cannot end up fighting over one address.
  const slugSource = regenerateSlug && fields.name ? fields.name : fields.slug
  const slug = slugSource !== undefined ? await ensureUniqueTagSlug(slugify(slugSource), id) : undefined
  await updateTag(id, { ...fields, ...(slug ? { slug } : {}) })
  return NextResponse.json({ success: true, ...(slug ? { slug } : {}) })
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireShopUser('shop.products')
  if (gate.error) return gate.error
  const { id } = await params
  await deleteTag(id)
  return NextResponse.json({ success: true })
}
