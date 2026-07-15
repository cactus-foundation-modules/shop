import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { resolveCartLines, resolveDiscounts } from '@/modules/shop/lib/checkout'
import { checkInMemoryRateLimit, getClientIpFromRequest } from '@/modules/shop/lib/rate-limit'

const Body = z.object({
  lines: z.array(z.object({ productId: z.string(), quantity: z.number().int().min(1), lineId: z.string().optional(), meta: z.record(z.unknown()).optional() })),
  couponCode: z.string().min(1),
  customerEmail: z.string().email().nullable().optional(),
})

export async function POST(request: NextRequest) {
  const ip = getClientIpFromRequest(request)
  if (!checkInMemoryRateLimit(`apply-coupon:${ip}`, 20, 15 * 60 * 1000)) {
    return NextResponse.json({ error: 'Too many attempts, please try again later.' }, { status: 429 })
  }

  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })

  const resolvedLines = await resolveCartLines(parsed.data.lines)
  const subtotal = resolvedLines.reduce((sum, l) => sum + l.lineSubtotal, 0)
  const result = await resolveDiscounts(subtotal, parsed.data.couponCode, parsed.data.customerEmail ?? null)

  if (result.error) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json({ discountAmount: result.discountAmount, freeShipping: result.freeShipping, couponCode: result.couponCode })
}
