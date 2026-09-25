import { NextRequest, NextResponse } from 'next/server'
import { errorResponse } from '@/lib/utils'
import { getChargeById } from '@/modules/shop/lib/db/order-charges'
import { requireOrderAccess } from '@/modules/shop/lib/order-route-access'
import { cancelOrderKeepingCharge } from '@/modules/shop/lib/order-charges'
import { checkInMemoryRateLimit } from '@/modules/shop/lib/rate-limit'
import { getClientIp } from '@/lib/auth/rate-limit'

// PROTECTED - the customer's other way out of an extra charge: cancel the order
// and be refunded what they paid, less the charge. Money moves on this, so it
// is open only to whoever may see the order, throttled, and refused unless the
// charge is still waiting. The figure refunded is worked out on the server from
// the order itself; nothing the page sends has any say in it.
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string; chargeId: string }> }) {
  if (!checkInMemoryRateLimit(`shop_charge_cancel:${(await getClientIp())}`, 5, 15 * 60 * 1000)) {
    return errorResponse('Too many attempts, please try again in a little while.', 429)
  }

  const { id, chargeId } = await params
  const access = await requireOrderAccess(id)
  if (!access.ok) return access.error

  const charge = await getChargeById(chargeId)
  if (!charge || charge.orderId !== access.order.id) return errorResponse('That charge was not found on this order.', 404)

  const outcome = await cancelOrderKeepingCharge(charge.id, { kind: 'customer' })
  if (!outcome.ok) return errorResponse(outcome.error, outcome.status)
  return NextResponse.json({ refunded: outcome.refunded })
}
