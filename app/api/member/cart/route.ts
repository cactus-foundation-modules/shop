import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { errorResponse } from '@/lib/utils'
import { getMemberFromCookie } from '@/lib/members/session'
import { checkInMemoryRateLimit } from '@/modules/shop/lib/rate-limit'
import { getMemberCart, saveMemberCart, MEMBER_CART_MAX_LINES } from '@/modules/shop/lib/db/member-cart'

// The signed-in shopper's basket, so one started on a phone is waiting on the
// laptop. The browser still keeps its localStorage copy - that is what renders
// instantly and what a guest uses - and this is the shared truth it merges with
// on sign-in and pushes to on every change afterwards.
//
// 401 here is not an error the shopper ever sees: it is simply how the browser
// learns nobody is signed in, and it goes back to keeping the basket to itself.

// A per-line `meta` bag belongs to whichever module wrote it (engraving text, a
// chosen delivery tier), so it is stored verbatim and never read. Bounded all
// the same: it rides in a row we have to load on every basket read.
const MAX_META_BYTES = 4000

const LineSchema = z.object({
  productId: z.string().min(1).max(64),
  quantity: z.number().int().min(1).max(9999),
  lineId: z.string().min(1).max(64).optional(),
  meta: z.record(z.unknown())
    .refine((m) => JSON.stringify(m).length <= MAX_META_BYTES, 'Line options too large')
    .optional(),
})

const Body = z.object({ lines: z.array(LineSchema).max(MEMBER_CART_MAX_LINES) })

export async function GET() {
  const member = await getMemberFromCookie()
  if (!member) return errorResponse('Not authenticated', 401)

  const cart = await getMemberCart(member.id)
  return NextResponse.json({
    memberId: member.id,
    lines: cart?.lines ?? [],
    // null means "this member has never had a saved basket", which is what
    // tells the browser to hand its own local one over rather than treat an
    // empty server basket as a deliberate emptying.
    updatedAt: cart ? cart.updatedAt.toISOString() : null,
  })
}

export async function PUT(request: NextRequest) {
  const member = await getMemberFromCookie()
  if (!member) return errorResponse('Not authenticated', 401)

  // The guest basket's ceiling, per member rather than per address: a session
  // is the thing that could be scripted here, and one lifted from a browser
  // travels to whatever address the script runs on. Generous, because the
  // browser saves on every basket change - it stops a loop writing this row
  // hundreds of times a minute, not a shopper. The browser leaves the basket
  // alone on a 429 and saves it again on the next change.
  if (!checkInMemoryRateLimit(`shop_member_cart_store:${member.id}`, 120, 60_000)) {
    return NextResponse.json({ error: 'Too many requests - please wait a moment and try again.' }, { status: 429 })
  }

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return errorResponse('Invalid body')
  }

  const parsed = Body.safeParse(raw)
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Invalid cart')

  const cart = await saveMemberCart(member.id, parsed.data.lines)
  return NextResponse.json({ updatedAt: cart.updatedAt.toISOString() })
}
