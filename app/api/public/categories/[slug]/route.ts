import { NextResponse } from 'next/server'
import { errorResponse } from '@/lib/utils'
import { getCategoryBySlug, listProducts } from '@/modules/shop/lib/db'
import { shopClosedResponse } from '@/modules/shop/lib/access'

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const closed = await shopClosedResponse()
  if (closed) return closed

  const { slug } = await params
  const category = await getCategoryBySlug(slug)
  if (!category) return errorResponse('Category not found', 404)
  const { products } = await listProducts({ status: 'ACTIVE', categorySlug: slug, perPage: 100, excludeHidden: true, storefront: true })
  return NextResponse.json({ category, products })
}

// A category and its products, as anybody browsing would see them.
//
// Shared-cache window for this route's answers, applied by the module dispatcher
// (lib/cache/module-api-cache.ts) when the owner has ready-made copies switched
// on and the request carries no session or member cookie.
export const publicCacheTtl = 300
