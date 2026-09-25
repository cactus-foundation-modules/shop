import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { errorResponse } from '@/lib/utils'
import { getChargeById } from '@/modules/shop/lib/db/order-charges'
import { requireOrderAccess } from '@/modules/shop/lib/order-route-access'
import { getPaymentProvider } from '@/modules/shop/lib/payments/registry'
import { assertChargePayable } from '@/modules/shop/lib/order-charges'
import { checkInMemoryRateLimit } from '@/modules/shop/lib/rate-limit'
import { getClientIp } from '@/lib/auth/rate-limit'

const Body = z.object({ method: z.string().min(1) })

// PROTECTED - starts a payment for an EXTRA CHARGE on an order (a redelivery
// fee, say), from the customer's own order page. Open to whoever may see the
// order (lib/order-route-access.ts), exactly as settling the order itself is.
//
// The provider is handed the CHARGE's id and the charge's total, never the
// order's: the order was paid for long ago, and its payment method and
// reference are what any refund of it will one day be sent against. Nothing on
// the order row is touched here - unlike the order's own pay route, which has
// to adopt the new method. See `settlesOrderCharges` in lib/payments/provider.ts.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string; chargeId: string }> }) {
  if (!checkInMemoryRateLimit(`shop_charge_pay:${(await getClientIp())}`, 10, 15 * 60 * 1000)) {
    return errorResponse('Too many attempts, please try again in a little while.', 429)
  }

  const { id, chargeId } = await params
  const parsed = Body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return errorResponse('Invalid request')

  const access = await requireOrderAccess(id)
  if (!access.ok) return access.error
  const { order } = access

  const payable = await assertChargePayable(order, await getChargeById(chargeId), parsed.data.method)
  if (!payable.ok) return errorResponse(payable.error, payable.status)
  const { charge } = payable

  const provider = getPaymentProvider(parsed.data.method)
  if (!provider) return errorResponse('That way of paying is not available for this charge.')

  const intent = await provider.createIntent({
    orderId: charge.id,
    orderNumber: order.orderNumber,
    amount: Number(charge.total),
    currency: charge.currency,
    customerEmail: order.customerEmail,
    customerName: order.customerName,
    returnPath: `/shop/account/orders/${order.id}`,
  })

  return NextResponse.json({
    approvalUrl: intent.approvalUrl,
    clientFields: intent.clientFields,
    providerOrderId: intent.providerOrderId,
  })
}
