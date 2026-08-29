import { NextResponse } from 'next/server'
import { z } from 'zod'
import { errorResponse } from '@/lib/utils'
import { getMemberFromCookie } from '@/lib/members/session'
import { getOrderById, getOrderItems, setOrderCustomerReference } from '@/modules/shop/lib/db/orders'
import { getInvoiceForOrder } from '@/modules/shop/lib/db/invoices'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import { customerCanSetReference, CUSTOMER_REFERENCE_MAX_LENGTH } from '@/modules/shop/lib/customer-reference'
import { checkInMemoryRateLimit, getClientIpFromRequest } from '@/modules/shop/lib/rate-limit'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const member = await getMemberFromCookie()
  if (!member) return errorResponse('Not authenticated', 401)

  const { id } = await params
  const order = await getOrderById(id)
  if (!order || order.memberId !== member.id) return errorResponse('Order not found', 404)

  const items = await getOrderItems(order.id)
  return NextResponse.json({ order, items })
}

const PatchBody = z.object({
  // Their own reference for the order - the purchase order number their finance
  // team raised after they bought. Blank clears it, which is how a number typed
  // into the wrong order is undone without ringing anybody.
  customerReference: z.string().max(CUSTOMER_REFERENCE_MAX_LENGTH),
})

// PROTECTED - a member putting their own purchase order number on their own
// order, after the event.
//
// Deliberately the only thing this PATCH does. An order's figures, lines and
// addresses are what the shopper agreed to and what the shop shipped against; a
// customer-facing route that could rewrite them is not a route this page needs.
//
// Eligibility is re-checked here against lib/customer-reference.ts rather than
// trusted from the page that drew the box - same functions, so the two cannot
// drift, and a hand-rolled request gets the same answer a real click would.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const member = await getMemberFromCookie()
  if (!member) return errorResponse('Not authenticated', 401)

  // Secondary guard only - the ownership check below is the real one.
  if (!checkInMemoryRateLimit(`shop_order_reference:${getClientIpFromRequest(request)}`, 20, 60_000)) {
    return errorResponse('That is a lot of changes at once. Give it a minute.', 429)
  }

  const { id } = await params
  const parsed = PatchBody.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Invalid request')

  // Somebody else's order is a 404, matching the page: a 403 would confirm the
  // order id exists, which is more than a stranger should be able to learn.
  const order = await getOrderById(id)
  if (!order || order.memberId !== member.id) return errorResponse('Order not found', 404)

  const config = await getShopConfigCached()
  // Only looked up on a shop that invoices at all, so an ordinary shop's save
  // costs one write and nothing else.
  const invoice = config.invoicesEnabled ? await getInvoiceForOrder(order.id) : null
  const eligibility = customerCanSetReference({
    config,
    order,
    invoiceReference: invoice?.customer?.reference ?? null,
  })
  if (!eligibility.allowed) return errorResponse(eligibility.reason, 409)

  const updated = await setOrderCustomerReference(order.id, parsed.data.customerReference)
  if (!updated) return errorResponse('Order not found', 404)

  return NextResponse.json({ customerReference: parsed.data.customerReference.trim() })
}
