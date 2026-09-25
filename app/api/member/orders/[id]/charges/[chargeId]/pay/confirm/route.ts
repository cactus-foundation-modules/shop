import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { errorResponse } from '@/lib/utils'
import { getChargeById } from '@/modules/shop/lib/db/order-charges'
import { requireOrderAccess } from '@/modules/shop/lib/order-route-access'
import { getPaymentProvider } from '@/modules/shop/lib/payments/registry'
import { assertChargePayable, settleOrderChargePayment } from '@/modules/shop/lib/order-charges'
import { checkInMemoryRateLimit } from '@/modules/shop/lib/rate-limit'
import { getClientIp } from '@/lib/auth/rate-limit'

const Body = z.object({ method: z.string().min(1), payload: z.unknown() })

// PROTECTED - finishes a charge payment started by the route above, for a
// method whose fields are filled in on this page. The provider decides whether
// money moved; the payload is a one-time card token and is never read here as
// an outcome. A payment still settling is left to the provider's webhook, which
// settles charges too (see `settlesOrderCharges`).
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string; chargeId: string }> }) {
  if (!checkInMemoryRateLimit(`shop_charge_pay_confirm:${(await getClientIp())}`, 20, 15 * 60 * 1000)) {
    return errorResponse('Too many attempts, please try again in a little while.', 429)
  }

  const { id, chargeId } = await params
  const parsed = Body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return errorResponse('Invalid request')

  const access = await requireOrderAccess(id)
  if (!access.ok) return access.error
  const { order } = access

  const existing = await getChargeById(chargeId)
  if (existing?.orderId === order.id && existing.status === 'PAID') return NextResponse.json({ status: 'PAID' })

  const payable = await assertChargePayable(order, existing, parsed.data.method)
  if (!payable.ok) return errorResponse(payable.error, payable.status)
  const { charge } = payable

  const provider = getPaymentProvider(parsed.data.method)
  if (!provider) return errorResponse('That way of paying is not available for this charge.')

  const result = await provider.confirmPayment(
    {
      orderId: charge.id,
      orderNumber: order.orderNumber,
      amount: Number(charge.total),
      currency: charge.currency,
      customerEmail: order.customerEmail,
      customerName: order.customerName,
    },
    parsed.data.payload,
  )
  if (!result.success) return errorResponse(result.error ?? 'Payment could not be confirmed', 402)
  if (result.pending) return NextResponse.json({ status: 'AWAITING_CONFIRMATION' })

  await settleOrderChargePayment(charge.id, { method: parsed.data.method, providerReference: result.providerReference ?? null })
  return NextResponse.json({ status: 'PAID' })
}
