import { NextResponse } from 'next/server'
import { requireShopUser } from '@/modules/shop/lib/access'
import { getCollectionById, duplicateCollection } from '@/modules/shop/lib/db'
import { slugify, ensureUniqueCollectionSlug } from '@/modules/shop/lib/slug'

// Copies a collection, its SEO and its product list into a new one called
// "<name> (copy)". Curating a second collection that is nearly the first one is
// the common case - a seasonal cut of a range, say - and rebuilding a
// forty-product list by hand to get there is a poor use of an afternoon.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireShopUser('shop.products')
  if (gate.error) return gate.error
  const { id } = await params
  const source = await getCollectionById(id)
  if (!source) return NextResponse.json({ error: 'That collection no longer exists.' }, { status: 404 })
  const name = `${source.name} (copy)`
  const slug = await ensureUniqueCollectionSlug(slugify(name))
  const created = await duplicateCollection(id, { name, slug })
  if (!created) return NextResponse.json({ error: 'Could not copy that collection.' }, { status: 500 })
  return NextResponse.json({ id: created.id, slug }, { status: 201 })
}
