import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { errorResponse } from '@/lib/utils'
import { getMemberFromCookie } from '@/lib/members/session'
import { deleteGuestCart, getGuestCart, saveGuestCart, GUEST_CART_MAX_LINES } from '@/modules/shop/lib/db/guest-cart'
import {
  clearGuestCartCookie,
  mintGuestCartId,
  readGuestCartId,
  setGuestCartCookie,
} from '@/modules/shop/lib/guest-cart-cookie'

// The basket of a shopper who is not signed in, kept on the server.
//
// The signed-in version of this lives at /api/m/shop/member/cart and is
// untouched: that one answers to a member session, this one to the shop's own
// basket cookie. The browser talks to whichever applies, and cart-sync.ts is the
// only thing that decides which.
//
// Lines only, in and out. Nothing typed into the checkout is accepted here even
// if it is posted, because the schema below has nowhere to put it - the basket
// cookie is strictly necessary for running a basket and nothing more, and a
// route that quietly widened what "basket" meant would be spending an exemption
// it had not earned.
//
// A signed-in shopper gets nothing back rather than a row: their basket belongs
// to their account, and writing it here as well would give the shop two answers
// to the same question and a stale one to hand back on sign-out.
//
// The read says so with 204 and the write with 409, and the difference matters.
// Every signed-in shopper's FIRST sync reads this endpoint - that is how the
// browser finds out which of the two baskets it owns - so answering an ordinary
// question with an error status put a red line in the console of every page a
// member ever loaded. A write landing here is a genuine conflict (they signed in
// between the decision and the request), is rare, and keeps its 409.

const MAX_META_BYTES = 4000

const LineSchema = z.object({
  productId: z.string().min(1).max(64),
  quantity: z.number().int().min(1).max(9999),
  lineId: z.string().min(1).max(64).optional(),
  meta: z.record(z.unknown())
    .refine((m) => JSON.stringify(m).length <= MAX_META_BYTES, 'Line options too large')
    .optional(),
})

const Body = z.object({ lines: z.array(LineSchema).max(GUEST_CART_MAX_LINES) })

export const dynamic = 'force-dynamic'

/** Signed in? Then this is not the endpoint they want. Kept as one helper so
 *  every verb asks the same question, even though they answer it differently. */
async function signedIn(): Promise<boolean> {
  return Boolean(await getMemberFromCookie().catch(() => null))
}

export async function GET(request: NextRequest) {
  // Nothing to say, said quietly. An older browser holding a cached bundle reads
  // this as ok, fails to parse the empty body and gives up before it decides
  // anything - which is the whole reason it is 204 and not a 200 carrying
  // "owner: member": that shape would have looked to the old code like somebody
  // else's empty basket and emptied the one on screen.
  if (await signedIn()) return new NextResponse(null, { status: 204 })

  const cartId = readGuestCartId(request)
  // No cookie yet means no basket yet, and no reason to mint an id for a
  // shopper who has not put anything in one. The id arrives on the first PUT.
  if (!cartId) {
    return NextResponse.json(
      { owner: 'guest', lines: [], updatedAt: null },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  }

  const cart = await getGuestCart(cartId).catch(() => null)
  return NextResponse.json(
    {
      // Never the id itself. The browser only needs to know whose basket it is
      // holding so it can spot the handover at sign-in, and 'guest' answers that
      // without putting a working key to somebody's basket into reach of a
      // script on the page.
      owner: 'guest',
      lines: cart?.lines ?? [],
      // null means "this browser has never had a saved basket", which is what
      // tells it to hand its own local one over rather than read an empty server
      // basket as a deliberate emptying.
      updatedAt: cart ? cart.updatedAt.toISOString() : null,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

export async function PUT(request: NextRequest) {
  if (await signedIn()) return errorResponse('Signed in', 409)

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return errorResponse('Invalid body')
  }

  const parsed = Body.safeParse(raw)
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Invalid cart')

  const cartId = readGuestCartId(request) ?? mintGuestCartId()
  const cart = await saveGuestCart(cartId, parsed.data.lines)

  const response = NextResponse.json(
    { updatedAt: cart.updatedAt.toISOString() },
    { headers: { 'Cache-Control': 'no-store' } },
  )
  // Re-set on every write as well as on the first, so a basket somebody keeps
  // coming back to does not expire under them on the thirtieth day.
  setGuestCartCookie(response, cartId)
  return response
}

/** The basket has been handed to an account on sign-in. This drops the guest
 *  copy and the cookie with it, so signing out on a shared machine leaves the
 *  next person nothing. Deliberately allowed while signed in - it is the moment
 *  straight after a sign-in that needs it. */
export async function DELETE(request: NextRequest) {
  const response = new NextResponse(null, { status: 204 })
  const cartId = readGuestCartId(request)
  if (!cartId) return response
  await deleteGuestCart(cartId).catch(() => undefined)
  clearGuestCartCookie(response)
  return response
}
