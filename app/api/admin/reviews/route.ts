import { NextRequest, NextResponse } from 'next/server'
import { requireShopUser } from '@/modules/shop/lib/access'
import { listReviews } from '@/modules/shop/lib/db'

export async function GET(request: NextRequest) {
  const gate = await requireShopUser('shop.products', { allowAccess: true })
  if (gate.error) return gate.error

  const params = request.nextUrl.searchParams
  const { reviews, total } = await listReviews({
    status: (params.get('status') as never) ?? undefined,
    productId: params.get('productId') ?? undefined,
    page: params.get('page') ? Number(params.get('page')) : undefined,
  })
  return NextResponse.json({ reviews, total })
}
