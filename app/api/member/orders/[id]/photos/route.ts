import { NextRequest, NextResponse } from 'next/server'
import { errorResponse } from '@/lib/utils'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import { receiveIssuePhoto } from '@/modules/shop/lib/issue-photos'
import { requireOrderAccess } from '@/modules/shop/lib/order-route-access'
import { checkInMemoryRateLimit } from '@/modules/shop/lib/rate-limit'
import { getClientIp } from '@/lib/auth/rate-limit'

// PROTECTED - a photograph for an issue report, uploaded one file at a time by
// somebody who can already see the order (a member, or a guest who has proved
// the delivery postcode - lib/order-route-access.ts).
//
// Uploaded BEFORE the report is submitted (or before photographs are added to
// one already in) rather than in one multipart POST with it, because a phone on
// a bad signal sending four photographs and a form together fails as one thing:
// four uploads that each either land or can be retried on their own is the
// shape that survives a lift. The report then names the media rows it wants.
// The checks and the filing live in lib/issue-photos.ts, shared with staff.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // Secondary guard only - the access check below is the real one. Tighter than
  // the request endpoint's because this one writes files.
  if (!checkInMemoryRateLimit(`shop_damage_photo:${(await getClientIp())}`, 20, 60_000)) {
    return errorResponse('That is a lot of photographs at once. Give it a minute.', 429)
  }

  const { id } = await params
  const access = await requireOrderAccess(id)
  if (!access.ok) return access.error

  const config = await getShopConfigCached()
  if (!config.damageReportsEnabled) {
    return errorResponse('Get in touch about anything damaged or faulty and we will put it right.', 403)
  }

  const received = await receiveIssuePhoto(request, access.order.orderNumber)
  if (!received.ok) return errorResponse(received.error, received.status)
  // The id is what the report quotes; the url is only so the customer can see
  // the thumbnail they just added. The report resolves the url server-side from
  // the id, so nothing the browser sends here decides what is stored.
  return NextResponse.json({ mediaId: received.mediaId, url: received.url }, { status: 201 })
}
