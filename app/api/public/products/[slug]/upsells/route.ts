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

// Shopper-agnostic, and fired by every product page view - same reasoning as the
// related-products route next door.
//
// Shared-cache window for this route's answers, applied by the module dispatcher
// (lib/cache/module-api-cache.ts) when the owner has ready-made copies switched
// on and the request carries no session or member cookie.
export const publicCacheTtl = 300
