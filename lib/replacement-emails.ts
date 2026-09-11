import { getShopConfigCached } from '@/modules/shop/lib/config'
import { getOrderById, getOrderItems } from '@/modules/shop/lib/db/orders'
import { getShipmentsForOrder } from '@/modules/shop/lib/db/shipments'
import { formatDeliveredDay } from '@/modules/shop/lib/order-display'
import { getSiteTimezone } from '@/lib/config/timezone.server'
import { notifyOrderCustomer } from '@/modules/shop/lib/order-notify'
import { renderOrderItemsEmailTable } from '@/modules/shop/lib/order-items-email'
import type { ShpOrder } from '@/modules/shop/lib/types'

// What a customer hears about a replacement part.
//
// Its own two messages rather than the order wording, for the same reason a
// damage report has its own four: every sentence in the order emails starts
// from the premise that the customer bought something. "Thanks for your order"
// and "Total: £0.00" read as a second mistake on top of the one they reported.
//
// Both lead with the ORIGINAL order's number. The replacement's own is a number
// the customer has never seen, and opening with it - especially in 160
// characters of text message - is an email about somebody else's order.

/**
 * The original order's number, for the templates that quote it.
 *
 * Empty strings rather than a missing key on an ordinary order: a merge tag
 * nothing fills collapses to nothing, so the same vars can be handed to every
 * trigger without the caller having to know which of them cares.
 */
export async function parentOrderVars(order: ShpOrder): Promise<Record<string, string>> {
  if (!order.parentOrderId) return { parentOrderNumber: '', hasParentOrder: 'false' }
  const parent = await getOrderById(order.parentOrderId)
  return {
    parentOrderNumber: parent?.orderNumber ?? '',
    hasParentOrder: parent ? 'true' : 'false',
  }
}

/**
 * "We are sending you a replacement", at the moment it is raised.
 *
 * Without it the customer hears nothing at all until the parcel is dispatched -
 * which on a part waiting on a supplier can be a fortnight of silence after
 * they were told it would be put right.
 *
 * Silent on failure, like every other order email in this module: a message
 * that would not send is not a reason to fail a replacement already written to
 * the database and already showing on the customer's own order page.
 */
export async function sendReplacementRaisedEmail(order: ShpOrder): Promise<void> {
  try {
    const [config, items, parent] = await Promise.all([
      getShopConfigCached(),
      getOrderItems(order.id),
      parentOrderVars(order),
    ])
    await notifyOrderCustomer('REPLACEMENT_SENT', order, {
      orderNumber: order.orderNumber,
      customerName: order.customerName,
      customerEmail: order.customerEmail,
      orderItems: await renderOrderItemsEmailTable(items, config),
      shopName: config.shopTitle || 'Shop',
      ...parent,
    })
  } catch (error) {
    console.error('[shop] replacement email failed to send', error)
  }
}

/**
 * When the part arrived and who took it in, for the email that closes a
 * replacement off.
 *
 * Read off the parcels rather than off the order, because "delivered" is
 * something a courier said about a box and the order's COMPLETED is only this
 * module's conclusion from it. The LATEST delivery of the several a replacement
 * could theoretically have, since that is the one that finished it.
 *
 * Every value can be absent - a parcel marked delivered by hand carries no
 * signature, and one whose courier never gave a date carries no date - and each
 * takes its own sentence with it rather than printing an empty one.
 */
export async function replacementDeliveryVars(order: ShpOrder): Promise<Record<string, string>> {
  const shipments = await getShipmentsForOrder(order.id).catch(() => [])
  const delivered = shipments
    .filter((shipment) => shipment.deliveredAt)
    .sort((a, b) => (b.deliveredAt!.getTime()) - (a.deliveredAt!.getTime()))[0]

  if (!delivered?.deliveredAt) return { deliveredOn: '', hasDeliveredOn: 'false', signedBy: '', hasSignedBy: 'false' }

  const timezone = await getSiteTimezone()
  const deliveredOn = formatDeliveredDay(delivered.deliveredAt, timezone)
  const signedBy = delivered.signedBy?.trim() ?? ''
  return {
    deliveredOn,
    hasDeliveredOn: deliveredOn ? 'true' : 'false',
    signedBy,
    hasSignedBy: signedBy ? 'true' : 'false',
  }
}
