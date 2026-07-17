import { NextRequest, NextResponse } from 'next/server'
import { listProducts } from '@/modules/shop/lib/db'
import { shopClosedResponse } from '@/modules/shop/lib/access'

export async function GET(request: NextRequest) {
  const closed = await shopClosedResponse()
  if (closed) return closed

  const params = request.nextUrl.searchParams
  const { products, total } = await listProducts({
    status: 'ACTIVE',
    type: (params.get('type') as 'PHYSICAL' | 'DIGITAL' | 'SERVICE' | null) ?? undefined,
    categorySlug: params.get('category') ?? undefined,
    tagSlug: params.get('tag') ?? undefined,
    collectionSlug: params.get('collection') ?? undefined,
    search: params.get('search') ?? undefined,
    page: params.get('page') ? Number(params.get('page')) : undefined,
    perPage: params.get('perPage') ? Number(params.get('perPage')) : undefined,
    excludeHidden: true,
  })
  return NextResponse.json({ products, total })
}
