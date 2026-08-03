import { NextRequest, NextResponse } from 'next/server'
import { requireShopUser } from '@/modules/shop/lib/access'
import { listRequestsForAdmin } from '@/modules/shop/lib/db/order-requests'
import type { ShpOrderRequestStatus, ShpOrderRequestType } from '@/modules/shop/lib/types'

const STATUSES = ['PENDING', 'APPROVED', 'DECLINED', 'WITHDRAWN'] as const
const TYPES = ['CANCEL', 'RETURN'] as const

// PROTECTED - the cancel/return queue.
export async function GET(request: NextRequest) {
  const gate = await requireShopUser('shop.orders')
  if (gate.error) return gate.error

  const params = request.nextUrl.searchParams
  const status = params.get('status')
  const type = params.get('type')

  const result = await listRequestsForAdmin({
    status: (STATUSES as readonly string[]).includes(status ?? '') ? (status as ShpOrderRequestStatus) : 'ALL',
    type: (TYPES as readonly string[]).includes(type ?? '') ? (type as ShpOrderRequestType) : 'ALL',
    limit: params.get('limit') ? Number(params.get('limit')) : undefined,
    offset: params.get('offset') ? Number(params.get('offset')) : undefined,
  })

  return NextResponse.json(result)
}
