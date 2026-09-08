import { NextResponse } from 'next/server'
import { errorResponse } from '@/lib/utils'
import { getCollectionBySlug, listProducts } from '@/modules/shop/lib/db'
import { shopClosedResponse } from '@/modules/shop/lib/access'

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const closed = await shopClosedResponse()
  if (closed) return closed

  const { slug } = await params
  const collection = await getCollectionBySlug(slug)
  if (!collection) return errorResponse('Collection not found', 404)
  const { products } = await listProducts({ status: 'ACTIVE', collectionSlug: slug, perPage: 100, excludeHidden: true, storefront: true })
  return NextResponse.json({ collection, products })
}

// A collection and its products, as anybody browsing would see them.
//
// Shared-cache window for this route's answers, applied by the module dispatcher
// (lib/cache/module-api-cache.ts) when the owner has ready-made copies switched
// on and the request carries no session or member cookie.
export const publicCacheTtl = 300
