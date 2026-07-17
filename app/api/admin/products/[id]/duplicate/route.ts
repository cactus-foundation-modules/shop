import { NextResponse } from 'next/server'
import { requireShopUser } from '@/modules/shop/lib/access'
import { getProductById, duplicateProduct } from '@/modules/shop/lib/db'
import { slugify, ensureUniqueProductSlug } from '@/modules/shop/lib/slug'

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireShopUser('shop.products')
  if (gate.error) return gate.error

  const { id } = await params
  const source = await getProductById(id)
  if (!source) return NextResponse.json({ error: 'Product not found' }, { status: 404 })

  const name = `${source.name} (copy)`
  const slug = await ensureUniqueProductSlug(slugify(name))
  const created = await duplicateProduct(id, { name, slug })
  if (!created) return NextResponse.json({ error: 'Could not duplicate the product' }, { status: 500 })

  return NextResponse.json({ id: created.id, slug }, { status: 201 })
}
