import { NextResponse } from 'next/server'
import { errorResponse } from '@/lib/utils'
import { getRequestById, withdrawRequest } from '@/modules/shop/lib/db/order-requests'
import { requireOrderAccess } from '@/modules/shop/lib/order-route-access'

// PROTECTED - a customer taking back a request they have not had an answer on
// yet. A signed-in member, or a guest who has proved the delivery postcode.
//
// Keyed on the request rather than on the order, so the order it belongs to has
// to be found before anything can be checked. Everything that is not allowed -
// no such request, somebody else's, or one already decided - comes back as the
// same 404: the three are indistinguishable from outside, and one of them would
// otherwise leak that another customer's request id is real.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const requested = await getRequestById(id)
  if (!requested) return errorResponse('That request is no longer open.', 404)

  const access = await requireOrderAccess(requested.orderId)
  if (!access.ok) return errorResponse('That request is no longer open.', 404)

  // Still scoped in the WHERE clause as well as checked here, so an already
  // decided request is a no-op update rather than a second read to race against.
  const withdrawn = await withdrawRequest(id, requested.orderId)
  if (!withdrawn) return errorResponse('That request is no longer open.', 404)

  return NextResponse.json({ ok: true })
}
