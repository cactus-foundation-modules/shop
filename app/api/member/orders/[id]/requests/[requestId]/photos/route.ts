import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { errorResponse } from '@/lib/utils'
import { MAX_DAMAGE_PHOTOS } from '@/modules/shop/lib/order-requests'
import { addCustomerIssuePhotos } from '@/modules/shop/lib/issue-photo-actions'
import { requireOrderAccess } from '@/modules/shop/lib/order-route-access'
import { checkInMemoryRateLimit } from '@/modules/shop/lib/rate-limit'
import { getClientIp } from '@/lib/auth/rate-limit'

// Ids of media rows already uploaded through ../../../photos, the same upload
// the report form uses. Ids only: the URL is looked up rather than taken on
// trust - see lib/issue-photos.ts.
const Body = z.object({
  photoMediaIds: z.array(z.string()).min(1, 'Add a photograph first.').max(MAX_DAMAGE_PHOTOS),
})

// PROTECTED - the customer adding photographs to an issue report already in,
// usually because the shop asked for them. A signed-in member, or a guest who
// has proved the delivery postcode (lib/order-route-access.ts).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; requestId: string }> },
) {
  // Secondary guard only - the access check below is the real one.
  if (!checkInMemoryRateLimit(`shop_request_photos:${(await getClientIp())}`, 10, 60_000)) {
    return errorResponse('That is a lot of photographs at once. Give it a minute.', 429)
  }

  const { id, requestId } = await params
  const parsed = Body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Invalid request')

  const access = await requireOrderAccess(id)
  if (!access.ok) return access.error

  const outcome = await addCustomerIssuePhotos({
    orderId: id,
    orderNumber: access.order.orderNumber,
    requestId,
    mediaIds: parsed.data.photoMediaIds,
  })
  if (!outcome.ok) return errorResponse(outcome.error, outcome.status)
  return NextResponse.json({ added: outcome.added }, { status: 201 })
}
