import { NextRequest, NextResponse } from 'next/server'
import { requireShopUser } from '@/modules/shop/lib/access'
import { listSubscriptions } from '@/modules/shop/lib/db'

export async function GET(request: NextRequest) {
  const gate = await requireShopUser('shop.products', { allowAccess: true })
  if (gate.error) return gate.error

  const params = request.nextUrl.searchParams
  const { subscriptions, total } = await listSubscriptions({
    productId: params.get('productId') ?? undefined,
    page: params.get('page') ? Number(params.get('page')) : undefined,
  })
  return NextResponse.json({ subscriptions, total })
}
