import { NextRequest, NextResponse } from 'next/server'
import { listProducts } from '@/modules/shop/lib/db'

export async function GET(request: NextRequest) {
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
  })
  return NextResponse.json({ products, total })
}
