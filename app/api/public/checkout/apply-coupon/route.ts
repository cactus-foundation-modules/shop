import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { resolveCartLines, resolveDiscounts } from '@/modules/shop/lib/checkout'
import { checkInMemoryRateLimit } from '@/modules/shop/lib/rate-limit'
import { getClientIp } from '@/lib/auth/rate-limit'
import { checkoutClosedResponse } from '@/modules/shop/lib/access'
import { resolveShopCommerceMode } from '@/modules/shop/lib/commerce-mode'
import { CheckoutLinesSchema, checkoutLinesRefusal } from '@/modules/shop/lib/checkout-lines'

const Body = z.object({
  lines: CheckoutLinesSchema,
  couponCode: z.string().min(1),
  customerEmail: z.string().email().nullable().optional(),
})

export async function POST(request: NextRequest) {
  const ip = await getClientIp()
  if (!checkInMemoryRateLimit(`apply-coupon:${ip}`, 20, 15 * 60 * 1000)) {
    return NextResponse.json({ error: 'Too many attempts, please try again later.' }, { status: 429 })
  }

  // A coupon is only worth checking on a shop that will take the order it is
  // for. Without this, a closed or browse-only shop still answered "valid" or
  // "invalid" to anybody trying codes - the same gate as the checkout session
  // route, staff preview included.
  const closed = await checkoutClosedResponse()
  if (closed) return closed
  const commerce = await resolveShopCommerceMode()
  if (commerce.mode === 'quote') return NextResponse.json({ error: commerce.blockedMessage }, { status: 503 })

  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: checkoutLinesRefusal(parsed.error) ?? 'Invalid request' }, { status: 400 })

  const resolvedLines = await resolveCartLines(parsed.data.lines)
  const subtotal = resolvedLines.reduce((sum, l) => sum + l.lineSubtotal, 0)
  const result = await resolveDiscounts(subtotal, parsed.data.couponCode, parsed.data.customerEmail ?? null)

  if (result.error) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json({ discountAmount: result.discountAmount, freeShipping: result.freeShipping, couponCode: result.couponCode })
}
