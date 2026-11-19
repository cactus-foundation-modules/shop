import { getShopConfigCached } from '@/modules/shop/lib/config'
import { addOrderNote, getOrderById, getOrderItems } from '@/modules/shop/lib/db/orders'
import { addRequestPhotos, getRequestById, recordPhotoRequest } from '@/modules/shop/lib/db/order-requests'
import { sendShopEmail } from '@/modules/shop/lib/email'
import { resolveIssuePhotos } from '@/modules/shop/lib/issue-photos'
import { itemsSummary } from '@/modules/shop/lib/order-request-actions'
import { notifyOrderCustomer } from '@/modules/shop/lib/order-notify'
import { addPhotosUrl, reasonLabel } from '@/modules/shop/lib/order-requests'
import { orderTrackingUrl } from '@/modules/shop/lib/order-tracking'
import type { ShpOrderRequestWithItems } from '@/modules/shop/lib/types'

// Photographs on an issue report AFTER it is in: the shop asking for them, the
// customer sending them, and staff adding the ones that arrived some other way.
//
// Photographs are optional on the report form, so a report can reach the queue
// with nothing to look at. Asking for them is then one button rather than an
// email typed by hand that the reply to lands nowhere near the report.

export type PhotoRequestResult =
  | { ok: false; status: number; error: string }
  | { ok: true; emailError: string | null }

/**
 * Asks the customer for photographs on an open issue report.
 *
 * Recorded first and emailed second. The note on the customer's order page and
 * the line in the order notes are what make the ask real; an email that will
 * not send is reported back to whoever pressed the button rather than undoing
 * any of that, so they can ring the customer instead.
 */
export async function requestIssuePhotos(input: {
  requestId: string
  note: string | null
  userId: string | null
}): Promise<PhotoRequestResult> {
  const request = await getRequestById(input.requestId)
  if (!request) return { ok: false, status: 404, error: 'That report no longer exists.' }
  if (request.type !== 'DAMAGE') return { ok: false, status: 400, error: 'Photographs can only be asked for on an issue report.' }
  if (request.status !== 'PENDING') return { ok: false, status: 409, error: 'This report has already been settled.' }

  const note = input.note?.trim() || null
  if (note && note.length > 1000) return { ok: false, status: 400, error: 'Keep the note under 1000 characters.' }

  const [order, orderItems, config] = await Promise.all([
    getOrderById(request.orderId),
    getOrderItems(request.orderId),
    getShopConfigCached(),
  ])
  if (!order) return { ok: false, status: 404, error: 'That order no longer exists.' }

  if (!(await recordPhotoRequest(request.id, note))) {
    return { ok: false, status: 409, error: 'This report has already been settled.' }
  }
  await addOrderNote(
    order.id,
    note ? `Asked the customer for photographs on their report: ${note}` : 'Asked the customer for photographs on their report.',
    true,
    input.userId,
  )

  // Straight to the form on their order page, across the postcode gate. Empty on
  // a shop with guest tracking off, which takes the link's line with it and
  // leaves the "reply with them attached" route standing on its own.
  const uploadUrl = addPhotosUrl(orderTrackingUrl(order.orderNumber, config))
  try {
    await notifyOrderCustomer('ISSUE_PHOTOS_REQUESTED', order, {
      customerName: order.customerName,
      orderNumber: order.orderNumber,
      requestReason: reasonLabel(request.type, request.reason),
      requestItems: itemsSummary(request, orderItems),
      hasItems: request.items.length > 0 ? 'true' : 'false',
      photoRequestNote: note ?? '',
      hasPhotoRequestNote: note ? 'true' : 'false',
      addPhotosUrl: uploadUrl,
      hasAddPhotosUrl: uploadUrl ? 'true' : 'false',
      // The engine has no "if not"; this is the flag for the line that stands
      // alone when there is no link to offer.
      hasNoAddPhotosUrl: uploadUrl ? 'false' : 'true',
      shopName: config.shopTitle || 'Shop',
    })
    return { ok: true, emailError: null }
  } catch (error) {
    console.error('[shop] photo request email failed to send', error)
    return { ok: true, emailError: 'Saved, and it shows on their order page - but the email did not go. Try again, or get in touch with them another way.' }
  }
}

export type CustomerPhotosResult =
  | { ok: false; status: number; error: string }
  | { ok: true; added: number }

/**
 * The customer adding photographs to a report already in - answering the shop's
 * request, or simply sending one they forgot.
 *
 * Only on their own order's open issue report, and only photographs already
 * uploaded into that order's issues folder (lib/issue-photos.ts). Tells the
 * shop, because a photograph nobody knows has arrived is a report that sits.
 */
export async function addCustomerIssuePhotos(input: {
  orderId: string
  orderNumber: string
  requestId: string
  mediaIds: string[]
}): Promise<CustomerPhotosResult> {
  const request = await getRequestById(input.requestId)
  // Not found and not theirs read the same, so a request id from another order
  // tells a guest nothing about whether it exists.
  if (!request || request.orderId !== input.orderId) return { ok: false, status: 404, error: 'That report could not be found.' }
  if (request.type !== 'DAMAGE') return { ok: false, status: 400, error: 'Photographs only go on an issue report.' }
  if (request.status !== 'PENDING') {
    return { ok: false, status: 409, error: 'We have already settled this report. If something is still not right, report it again.' }
  }

  const photos = await resolveIssuePhotos(input.orderNumber, input.mediaIds)
  if (photos.length === 0) return { ok: false, status: 400, error: 'Those photographs did not come through. Try adding them again.' }

  return attachCustomerPhotos(request, photos, 'website')
}

/**
 * Puts photographs the customer sent on their report, notes it on the order and
 * tells the shop. Shared by the website upload and an emailed reply caught in
 * the unified inbox, so the shop hears about both the same way.
 */
export async function attachCustomerPhotos(
  request: Pick<ShpOrderRequestWithItems, 'id' | 'orderId' | 'type' | 'reason' | 'photos'>,
  photos: Array<{ mediaId: string | null; url: string }>,
  via: 'website' | 'email',
): Promise<CustomerPhotosResult> {
  const added = await addRequestPhotos(request.id, photos, null)
  if (!added.ok) return added

  await addOrderNote(
    request.orderId,
    via === 'email'
      ? `The customer emailed ${added.photos.length} photograph(s) for their report; they have been added to it.`
      : `The customer added ${added.photos.length} photograph(s) to their report.`,
    true,
    null,
  )

  const [order, config] = await Promise.all([getOrderById(request.orderId), getShopConfigCached()])
  const adminAlertEmail = config.adminOrderAlertEmail || config.storeEmail
  if (order && adminAlertEmail) {
    try {
      await sendShopEmail('ADMIN_ISSUE_PHOTOS_ADDED', adminAlertEmail, {
        orderNumber: order.orderNumber,
        customerName: order.customerName,
        customerEmail: order.customerEmail,
        requestReason: reasonLabel(request.type, request.reason),
        photoCount: String(added.photos.length),
        totalPhotoCount: String(request.photos.length + added.photos.length),
        shopName: config.shopTitle || 'Shop',
      })
    } catch (error) {
      console.error('[shop] photos-added alert failed to send', error)
    }
  }

  return { ok: true, added: added.photos.length }
}
