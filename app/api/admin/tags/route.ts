import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireShopUser } from '@/modules/shop/lib/access'
import { getTagsWithCounts, createTag, updateTag } from '@/modules/shop/lib/db'
import { slugify, ensureUniqueTagSlug } from '@/modules/shop/lib/slug'

export async function GET() {
  const gate = await requireShopUser('shop.products', { allowAccess: true })
  if (gate.error) return gate.error
  const tags = await getTagsWithCounts()
  return NextResponse.json({ tags })
}

// Name is the only thing the "New tag" prompt asks for; the rest are here so a
// script (or the CSV importer) can create a fully dressed tag in one call.
const Body = z.object({
  name: z.string().min(1).max(60),
  description: z.string().nullable().optional(),
  storefrontVisible: z.boolean().optional(),
  badgeEnabled: z.boolean().optional(),
  badgeLabel: z.string().nullable().optional(),
  badgeBg: z.string().nullable().optional(),
  badgeBgDark: z.string().nullable().optional(),
  badgeText: z.string().nullable().optional(),
  badgeTextDark: z.string().nullable().optional(),
  metaTitle: z.string().nullable().optional(),
  metaDescription: z.string().nullable().optional(),
})

export async function POST(request: NextRequest) {
  const gate = await requireShopUser('shop.products')
  if (gate.error) return gate.error
  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid tag' }, { status: 400 })
  const { name: rawName, ...rest } = parsed.data
  const name = rawName.trim()
  const slug = await ensureUniqueTagSlug(slugify(name))
  const { id } = await createTag(name, slug)
  // createTag takes name and slug only (it also works out the new tag's place in
  // the order); anything else supplied is written straight after.
  if (Object.keys(rest).length > 0) await updateTag(id, rest)
  return NextResponse.json({ id, slug }, { status: 201 })
}
