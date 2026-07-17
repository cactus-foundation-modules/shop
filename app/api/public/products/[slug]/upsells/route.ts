import { NextResponse } from 'next/server'
import { errorResponse } from '@/lib/utils'
import { getProductBySlug } from '@/modules/shop/lib/db'
import { resolveUpsellProducts } from '@/modules/shop/lib/db/recommendations'
import { shopClosedResponse } from '@/modules/shop/lib/access'

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const closed = await shopClosedResponse()
  if (closed) return closed

  const { slug } = await params
  const product = await getProductBySlug(slug)
  if (!product || product.status !== 'ACTIVE') return errorResponse('Product not found', 404)
  const upsells = await resolveUpsellProducts(product)
  return NextResponse.json({ products: upsells })
}
