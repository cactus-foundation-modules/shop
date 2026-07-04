import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireShopUser } from '@/modules/shop/lib/access'
import { getTagsWithCounts, createTag } from '@/modules/shop/lib/db'
import { slugify, ensureUniqueTagSlug } from '@/modules/shop/lib/slug'

export async function GET() {
  const gate = await requireShopUser('shop.products', { allowAccess: true })
  if (gate.error) return gate.error
  const tags = await getTagsWithCounts()
  return NextResponse.json({ tags })
}

const Body = z.object({ name: z.string().min(1).max(60) })

export async function POST(request: NextRequest) {
  const gate = await requireShopUser('shop.products')
  if (gate.error) return gate.error
  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid tag' }, { status: 400 })
  const name = parsed.data.name.trim()
  const slug = await ensureUniqueTagSlug(slugify(name))
  const { id } = await createTag(name, slug)
  return NextResponse.json({ id, slug }, { status: 201 })
}
