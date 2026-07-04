import { NextResponse } from 'next/server'
import { errorResponse } from '@/lib/utils'
import { getProductBySlug } from '@/modules/shop/lib/db'
import { resolveRelatedProducts } from '@/modules/shop/lib/db/recommendations'

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const product = await getProductBySlug(slug)
  if (!product || product.status !== 'ACTIVE') return errorResponse('Product not found', 404)
  const related = await resolveRelatedProducts(product)
  return NextResponse.json({ products: related })
}
