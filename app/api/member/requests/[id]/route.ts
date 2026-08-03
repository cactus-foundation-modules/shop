import { NextResponse } from 'next/server'
import { errorResponse } from '@/lib/utils'
import { getMemberFromCookie } from '@/lib/members/session'
import { withdrawRequest } from '@/modules/shop/lib/db/order-requests'

// PROTECTED - a member taking back a request they have not had an answer on yet.
//
// withdrawRequest is scoped to both the member and the PENDING status in its
// WHERE clause, so neither someone else's request nor an already-decided one
// can be withdrawn. A no-op update is reported as 404 rather than "already
// decided", since the two are indistinguishable from outside and one of them
// would leak that another member's request id is real.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const member = await getMemberFromCookie()
  if (!member) return errorResponse('Not authenticated', 401)

  const { id } = await params
  const withdrawn = await withdrawRequest(id, member.id)
  if (!withdrawn) return errorResponse('That request is no longer open.', 404)

  return NextResponse.json({ ok: true })
}
