import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { resolveCartLines } from '@/modules/shop/lib/checkout'
import { shopClosedResponse } from '@/modules/shop/lib/access'
import { previewOrderPaymentNotes } from '@/modules/shop/lib/order-payment-state'

const Body = z.object({
  lines: z.array(z.object({ productId: z.string(), quantity: z.number().int().min(1), lineId: z.string().optional(), meta: z.record(z.unknown()).optional() })),
  paymentMethod: z.string().min(1),
})

// PUBLIC, and creates nothing. Says what the chosen payment method means for
// this cart - a pay-later method's effect on delivery dates, say - at the moment
// the shopper picks it, rather than after they have filled in the whole checkout
// and ticked every box, which is when the order-creating route finally answers
// the same question. See lib/order-payment-state.ts (previewOrderPaymentNotes).
//
// Nothing here writes: no order row, no provider intent, no line restatement. An
// unavailable line is not an error either - the note is about the method, and
// the cart's own validation already tells the shopper about the line.
export async function POST(request: NextRequest) {
  const closed = await shopClosedResponse()
  if (closed) return closed

  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })

  const lines = await resolveCartLines(parsed.data.lines)
  const notes = await previewOrderPaymentNotes(parsed.data.paymentMethod, lines.filter((l) => l.available))

  return NextResponse.json({ notes })
}
