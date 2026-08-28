import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { errorResponse } from '@/lib/utils'
import { getMemberFromCookie } from '@/lib/members/session'
import { adoptOrderPaymentMethod, getOrderById } from '@/modules/shop/lib/db/orders'
import { getPaymentProvider } from '@/modules/shop/lib/payments/registry'
import { assertPayableOnline } from '@/modules/shop/lib/order-pay-online'
import { checkInMemoryRateLimit, getClientIpFromRequest } from '@/modules/shop/lib/rate-limit'

const Body = z.object({ method: z.string().min(1) })

// PROTECTED - starts a payment against an order that ALREADY EXISTS: an unpaid
// bank transfer the customer would rather settle by card, from their own order
// page. See lib/order-pay-online.ts for what makes an order eligible.
//
// Two things happen here and their order matters. The provider's intent is
// created FIRST, so a provider having a bad day leaves the order exactly as it
// was; only once there is something to pay into does the order adopt the method.
// It has to adopt it, and this is the moment: every settlement path there is -
// the provider's own return route, its webhook, the confirm route below, and
// every refund afterwards - resolves its provider from the order's
// payment_method, and a card payment refunded down the bank-transfer path is a
// refund nobody actually sends. The method the order was PLACED with is kept
// (see adoptOrderPaymentMethod), so a customer who thinks better of it still has
// their bank details on the page when they come back.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const member = await getMemberFromCookie()
  if (!member) return errorResponse('Not authenticated', 401)

  // This calls out to a payment provider and creates a live payment object on
  // it, so it is throttled like the checkout's own intent route. Secondary to
  // the ownership check below, which is the real guard.
  if (!checkInMemoryRateLimit(`shop_order_pay:${getClientIpFromRequest(request)}`, 10, 15 * 60 * 1000)) {
    return errorResponse('Too many attempts, please try again in a little while.', 429)
  }

  const { id } = await params
  const parsed = Body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return errorResponse('Invalid request')

  const order = await getOrderById(id)
  // Not this member's order is a 404, matching the page it was offered on: a 403
  // would confirm the order id exists.
  if (!order || order.memberId !== member.id) return errorResponse('Order not found', 404)

  // Re-asked here rather than trusted from the page that drew the button - which
  // may have been sitting open since before the owner switched the method off,
  // or before somebody else marked the transfer as arrived.
  const payable = await assertPayableOnline(order, parsed.data.method)
  if (!payable.ok) return errorResponse(payable.error, payable.status)

  const provider = getPaymentProvider(parsed.data.method)
  if (!provider) return errorResponse('That way of paying is not available for this order.')

  const intent = await provider.createIntent({
    orderId: order.id,
    orderNumber: order.orderNumber,
    amount: Number(order.total),
    currency: order.currency,
    customerEmail: order.customerEmail,
    customerName: order.customerName,
    // Where a method that hands the shopper over should put them down again.
    // Not the checkout's thank-you page: this person placed the order a
    // fortnight ago and is standing on their own order page.
    returnPath: `/shop/account/orders/${order.id}`,
  })

  await adoptOrderPaymentMethod(order.id, parsed.data.method)

  return NextResponse.json({
    approvalUrl: intent.approvalUrl,
    clientFields: intent.clientFields,
    providerOrderId: intent.providerOrderId,
  })
}
