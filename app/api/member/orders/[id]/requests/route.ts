import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { errorResponse } from '@/lib/utils'
import { MAX_DAMAGE_PHOTOS } from '@/modules/shop/lib/order-requests'
import { resolveIssuePhotos } from '@/modules/shop/lib/issue-photos'
import { ORDER_LINE_BATCH_MAX } from '@/modules/shop/lib/order-line-limits'
import { loadOrderDetail } from '@/modules/shop/lib/member-orders'
import { requireOrderAccess } from '@/modules/shop/lib/order-route-access'
import { submitOrderRequest } from '@/modules/shop/lib/order-request-actions'
import { checkInMemoryRateLimit } from '@/modules/shop/lib/rate-limit'
import { getClientIp } from '@/lib/auth/rate-limit'

const Body = z.object({
  type: z.enum(['CANCEL', 'RETURN', 'DAMAGE']),
  reason: z.string().min(1),
  customerNote: z.string().max(2000).nullable().optional(),
  // Capped at what one order can hold. The form sends one row per line; a list
  // longer than any order is a hand-rolled request, and every row of it would
  // otherwise be folded and checked before the refusal it was always going to get.
  items: z
    .array(z.object({
      orderItemId: z.string(),
      quantity: z.number().int().min(1),
      // Only read on a "something is missing" report, where it is required -
      // lib/db/order-requests.ts decides that, beside the reason it depends on.
      missing: z.enum(['WHOLE', 'PARTS']).nullable().optional(),
    }))
    .max(ORDER_LINE_BATCH_MAX, 'That is more items than one order holds.')
    .optional(),
  // Ids of media rows already uploaded through the photos endpoint beside this
  // one. Ids only - the URL is looked up here rather than taken on trust, so a
  // hand-rolled POST cannot hang an arbitrary address off somebody's order and
  // have the owner's queue load it.
  photoMediaIds: z.array(z.string()).max(MAX_DAMAGE_PHOTOS).optional(),
})

// PROTECTED - a customer asking for one of their own orders to be called off or
// sent back. A signed-in member, or a guest who has proved the delivery postcode
// (lib/order-route-access.ts).
//
// Eligibility is re-checked here against lib/order-requests.ts rather than
// trusted from the page that offered the button: the rules are the same
// functions the page used, so the two cannot drift, but a hand-rolled POST gets
// exactly the same answer a real click would have.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // Secondary guard only - the access check below is the real one.
  if (!checkInMemoryRateLimit(`shop_request:${(await getClientIp())}`, 10, 60_000)) {
    return errorResponse('That is a lot of requests at once. Give it a minute.', 429)
  }

  const { id } = await params
  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Invalid request')

  const access = await requireOrderAccess(id)
  if (!access.ok) return access.error

  const detail = await loadOrderDetail(id)
  if (!detail) return errorResponse('Order not found', 404)

  const eligibility =
    parsed.data.type === 'CANCEL' ? detail.cancel
    : parsed.data.type === 'DAMAGE' ? detail.damage
    : detail.return
  if (!eligibility.allowed) return errorResponse(eligibility.reason, 409)

  // Resolved from the library, and only for an issue report - see
  // lib/issue-photos.ts for why only this order's issues folder counts.
  const photos = parsed.data.type === 'DAMAGE'
    ? await resolveIssuePhotos(access.order.orderNumber, parsed.data.photoMediaIds ?? [])
    : []

  const outcome = await submitOrderRequest({
    orderId: id,
    // The account the ORDER belongs to, not whoever is standing at the keyboard.
    // A guest has no account, so their request records none; and a guest order
    // that has since been claimed by an account belongs to that account whether
    // this particular visit was signed in or not.
    memberId: access.order.memberId,
    type: parsed.data.type,
    reason: parsed.data.reason,
    customerNote: parsed.data.customerNote ?? null,
    // Passed straight through on all three kinds now. A cancellation that names
    // lines is a part-cancellation; one that names none is still the whole
    // order, which is what every cancellation taken before this meant. The
    // quantities are re-checked against the order in lib/db/order-requests.ts,
    // so a hand-rolled POST cannot call off more than is sitting here.
    items: parsed.data.items ?? [],
    photos,
  })

  if (!outcome.ok) return errorResponse(outcome.error, outcome.status)
  return NextResponse.json({ request: outcome.request }, { status: 201 })
}
