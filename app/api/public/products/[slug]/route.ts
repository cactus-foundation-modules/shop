import { NextResponse } from 'next/server'
import { errorResponse } from '@/lib/utils'
import { getProductBySlug, getProductMedia, getProductCategoryIds, getProductTagIds } from '@/modules/shop/lib/db'

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const product = await getProductBySlug(slug)
  if (!product || product.status !== 'ACTIVE') return errorResponse('Product not found', 404)

  const [media, categoryIds, tagIds] = await Promise.all([
    getProductMedia(product.id),
    getProductCategoryIds(product.id),
    getProductTagIds(product.id),
  ])

  return NextResponse.json({ product, media, categoryIds, tagIds })
}
