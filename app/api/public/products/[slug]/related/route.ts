import { NextResponse } from 'next/server'
import { errorResponse } from '@/lib/utils'
import { getProductBySlug } from '@/modules/shop/lib/db'
import { resolveRelatedProducts } from '@/modules/shop/lib/db/recommendations'
import { shopClosedResponse } from '@/modules/shop/lib/access'

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const closed = await shopClosedResponse()
  if (closed) return closed

  const { slug } = await params
  const product = await getProductBySlug(slug)
  if (!product || product.status !== 'ACTIVE') return errorResponse('Product not found', 404)
  const related = await resolveRelatedProducts(product)
  return NextResponse.json({ products: related })
}

// The same answer for everybody: this product's related products, decided by
// the catalogue and the shop's own settings. Fired by every product page view,
// so it is worth handing to a CDN rather than a function.
//
// Shared-cache window for this route's answers, applied by the module dispatcher
// (lib/cache/module-api-cache.ts) when the owner has ready-made copies switched
// on and the request carries no session or member cookie.
export const publicCacheTtl = 300
