import type { Member } from '@prisma/client'
import type { NextRequest } from 'next/server'
import { getMemberFromCookie } from '@/lib/members/session'
import { guestOrderAccessIds, guestOrderAccessIdsFromRequest } from '@/modules/shop/lib/guest-order-access'
import { hasReceiptAccess, receiptAccessNumbers } from '@/modules/shop/lib/receipt-access-cookie'
import type { ShpOrder } from '@/modules/shop/lib/types'

// Who is allowed to look at one order, and on what grounds.
//
// There are exactly two grounds and this is the only place that knows them, so
// the page, the receipt and all six of the routes behind the buttons on that
// page cannot drift apart. They drift the moment there are two lists: somebody
// adds a guest to five of them and the sixth quietly stays members-only, and
// the customer finds a button that does nothing.
//
//   member - signed in, and the order is theirs. What it always was.
//   guest  - not signed in as the owner, but this browser has already proved it
//            knows the delivery postcode. See lib/guest-order-access.ts.
//
// A guest gets exactly what a member gets on their own order, deliberately.
// The two have proved the same thing by different means, and an order page that
// showed a guest their parcel but refused to correct the company on the invoice
// would leave them ringing up for the one thing this was built to save.

export type OrderViewer =
  | { kind: 'member'; member: Member }
  | { kind: 'guest'; member: null }

/**
 * The rule itself, with both cookies already read.
 *
 * Pure, and exported, because the order page needs the answer AND needs to know
 * whether there was a signed-in member at all - a signed-out visitor is sent to
 * prove themselves, while a member looking at somebody else's order gets a 404.
 * Asking twice would read the session twice and, worse, would let the page's
 * copy of the rule drift from this one.
 */
export function orderViewerFor(
  order: Pick<ShpOrder, 'id' | 'memberId'>,
  member: Member | null,
  guestOrderIds: string[],
): OrderViewer | null {
  if (member && order.memberId === member.id) return { kind: 'member', member }
  if (guestOrderIds.includes(order.id)) return { kind: 'guest', member: null }
  return null
}

/** From inside a server component. Null means show them nothing. */
export async function resolveOrderViewer(order: Pick<ShpOrder, 'id' | 'memberId'>): Promise<OrderViewer | null> {
  const [member, guestOrderIds] = await Promise.all([getMemberFromCookie(), guestOrderAccessIds()])
  return orderViewerFor(order, member, guestOrderIds)
}

/**
 * From inside a route handler, which reads its cookies off the request it was
 * given rather than through next/headers - the same two-readers split
 * lib/guest-order-access.ts makes, and for the same reason.
 */
export async function resolveOrderViewerFromRequest(
  request: NextRequest,
  order: Pick<ShpOrder, 'id' | 'memberId'>,
): Promise<OrderViewer | null> {
  return orderViewerFor(order, await getMemberFromCookie(), guestOrderAccessIdsFromRequest(request))
}

/**
 * Whether this browser may be shown this order's receipt without being asked
 * anything, given that it already holds a valid confirmation link.
 *
 * A third ground on top of the two above, and only for the receipt: this
 * browser is the one that checked out (lib/receipt-access-cookie.ts). Nobody
 * proved anything to get it - buying the thing IS the proof - which is why it
 * opens the receipt and not the order page, where the same customer is still
 * asked for their postcode exactly as they always was.
 *
 * One function rather than the same three-way test written out in the status
 * route and again in the notifications route beside it. They drift the moment
 * there are two: somebody adds a ground to one and the other quietly keeps
 * refusing a customer it should let in.
 */
export async function mayOpenReceipt(
  request: NextRequest,
  order: Pick<ShpOrder, 'id' | 'memberId' | 'orderNumber'>,
): Promise<boolean> {
  if (hasReceiptAccess(request, order.orderNumber)) return true
  return (await resolveOrderViewerFromRequest(request, order)) !== null
}

/** The same question from inside a server component, which has no request to
 *  read - the shop's document pages ask it this way. */
export async function mayOpenOrderFromCookies(
  order: Pick<ShpOrder, 'id' | 'memberId' | 'orderNumber'>,
): Promise<boolean> {
  const [viewer, receipts] = await Promise.all([resolveOrderViewer(order), receiptAccessNumbers()])
  return viewer !== null || receipts.includes(order.orderNumber)
}
