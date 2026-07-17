import { NextResponse } from 'next/server'
import { errorResponse } from '@/lib/utils'
import { getProductBySlug, getProductMedia, getProductCategoryIds, getProductTagIds } from '@/modules/shop/lib/db'
import { shopClosedResponse } from '@/modules/shop/lib/access'

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const closed = await shopClosedResponse()
  if (closed) return closed

  const { slug } = await params
  const product = await getProductBySlug(slug)
  if (!product || product.status !== 'ACTIVE' || product.catalogueHidden) return errorResponse('Product not found', 404)

  const [media, categoryIds, tagIds] = await Promise.all([
    getProductMedia(product.id),
    getProductCategoryIds(product.id),
    getProductTagIds(product.id),
  ])

  return NextResponse.json({ product, media, categoryIds, tagIds })
}
