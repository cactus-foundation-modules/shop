import { errorResponse } from '@/lib/utils'
import { getOrderById } from '@/modules/shop/lib/db/orders'
import { resolveOrderViewer, type OrderViewer } from '@/modules/shop/lib/order-viewer'
import type { ShpOrder } from '@/modules/shop/lib/types'

// The gate on the front of every route behind a button on a customer's own
// order page: pay online, correct the invoice, put a purchase order number on
// it, ask to cancel or return, take the ask back.
//
// One helper because there is one rule (lib/order-viewer.ts) and six routes,
// and six hand-written copies of a rule is five chances to get it wrong. The
// wrong version is not a crash either - it is a button that quietly does
// nothing for a guest, or, far worse, one that works for somebody who should
// never have reached it.
//
// Everything that is not allowed comes back as the same 404 with the same
// wording, deliberately. A 403 would confirm the order id is real, and the
// difference between "no such order" and "not yours" is exactly the difference
// a stranger is trying to measure.

export type OrderRouteAccess =
  | { ok: true; order: ShpOrder; viewer: OrderViewer; error?: undefined }
  | { ok: false; order?: undefined; viewer?: undefined; error: Response }

/**
 * The order, and who is looking at it, or a ready-to-return refusal.
 *
 *   const access = await requireOrderAccess(id)
 *   if (!access.ok) return access.error
 */
export async function requireOrderAccess(orderId: string): Promise<OrderRouteAccess> {
  const order = await getOrderById(orderId)
  if (!order) return { ok: false, error: errorResponse('Order not found', 404) }

  const viewer = await resolveOrderViewer(order)
  if (!viewer) return { ok: false, error: errorResponse('Order not found', 404) }

  return { ok: true, order, viewer }
}
