import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { requireShopUser } from '@/modules/shop/lib/access'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import { deliveryInstructionsLabel } from '@/modules/shop/lib/delivery-instructions'
import { getCustomerSummary, getOrderById, getOrderItems, listOrderNotes, listOrderEmails, listReplacementOrdersForParent, setOrderAskForReview, setOrderCustomerReference } from '@/modules/shop/lib/db/orders'
import { listRefundsForOrder, listRefundItemsForOrder } from '@/modules/shop/lib/db/refunds'
import { listDownloadsForOrder } from '@/modules/shop/lib/db/digital'
import { listRequestsForOrder } from '@/modules/shop/lib/db/order-requests'
import { refundRouteForOrder } from '@/modules/shop/lib/payments/order-refund-route'
import { refundableDelivery as deliveryLeftToRefund } from '@/modules/shop/lib/refund-delivery'
import type { ShpRefundNoticeSource } from '@/modules/shop/lib/payments/refund-notice'
import { CUSTOMER_REFUND_CREATED_BY } from '@/modules/shop/lib/order-charges'
import { resolveProductStorefrontHrefs } from '@/modules/shop/lib/product-storefront-link'

// Everything the order screen shows in one call, apart from dispatch progress -
// that rides on its own route so the dispatch block can refresh itself after a
// parcel without re-reading the whole order.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireShopUser('shop.orders', { allowAccess: true })
  if (gate.error) return gate.error

  const { id } = await params
  const order = await getOrderById(id)
  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })

  const [items, notes, emails, refunds, refundItems, downloads, customer, config, replacements, requests] = await Promise.all([
    getOrderItems(id),
    listOrderNotes(id),
    listOrderEmails(id),
    listRefundsForOrder(id),
    listRefundItemsForOrder(id),
    listDownloadsForOrder(id),
    getCustomerSummary(order.customerEmail),
    getShopConfigCached(),
    // The parts sent out to put this one right. Cheap on every order and empty
    // on almost all of them - it is one indexed read on a partial index.
    listReplacementOrdersForParent(id),
    // What the customer has reported or asked for on this order - a damage
    // report with its photographs, a return, a cancellation - newest first.
    // Decided on the requests screen; shown here so nobody has to go looking
    // for it while they are looking at the order it is about.
    listRequestsForOrder(id),
  ])

  // The parts themselves, so the items table can say which LINE each went out
  // for - which is the whole reason shp_order_items.replaces_order_item_id
  // exists. Skipped entirely on the ordinary order that has no replacements,
  // so it costs nothing on all but a handful.
  const replacementLines = replacements.length === 0 ? [] : (
    await Promise.all(replacements.map(async (replacement) => {
      const lines = await getOrderItems(replacement.id)
      return lines.map((line) => ({
        orderId: replacement.id,
        orderNumber: replacement.orderNumber,
        status: replacement.status,
        productName: line.productName,
        quantity: line.quantity,
        replacesOrderItemId: line.replacesOrderItemId,
      }))
    }))
  ).flat()

  // And, on a replacement, the order it is putting right. Only the two facts
  // the screen needs to offer a way back: a whole second order payload here
  // would be a second order screen nobody asked for.
  const parent = order.parentOrderId ? await getOrderById(order.parentOrderId) : null
  const parentOrder = parent ? { id: parent.id, orderNumber: parent.orderNumber } : null

  // Who wrote a note and who took a refund, resolved to names. A note signed
  // with a cuid tells the owner nothing about which of their staff wrote it,
  // and a deleted user simply drops out of the map rather than breaking the
  // screen (the timeline falls back to "a member of staff").
  const authorIds = [...new Set([
    ...notes.map((n) => n.createdBy),
    ...refunds.map((r) => r.createdBy),
  ].filter((v): v is string => Boolean(v)))]
  const authorRows = authorIds.length
    ? await prisma.user.findMany({ where: { id: { in: authorIds } }, select: { id: true, displayName: true, username: true } })
    : []
  const authors: Record<string, string> = Object.fromEntries(authorRows.map((u) => [u.id, u.displayName || u.username]))
  // A refund the customer started themselves - cancelling instead of paying an
  // extra charge (lib/order-charges.ts) - is signed with this rather than a
  // user id, and "a member of staff" would be the wrong answer.
  if (refunds.some((r) => r.createdBy === CUSTOMER_REFUND_CREATED_BY)) authors[CUSTOMER_REFUND_CREATED_BY] = 'The customer'

  // What this shop calls the customer's own reference. Sent with the order so
  // the screen labels the box the way the checkout does, rather than the admin
  // and the storefront each having a name of their own for the same field.
  const customerReferenceLabel = config.customerReferenceLabel.trim() || 'Purchase order number'

  // And what it calls the delivery instructions, for the same reason.
  const deliveryInstructionsLabelText = deliveryInstructionsLabel(config)

  // What the refund modal is allowed to promise about the money. Taken from the
  // provider that took the payment rather than from a list of method names kept
  // in the modal: that list had two entries in it and told the owner of every
  // other method that their refund was going back through PayPal. `refundMode`
  // defaults to 'provider', exactly as the contract says. Null where no provider
  // is registered for the method at all - the contributing module has been
  // removed, say - and the modal then promises nothing in either direction.
  const provider = refundRouteForOrder(order)
  const refundNotice: ShpRefundNoticeSource = provider
    ? { mode: provider.refundMode ?? 'provider', label: provider.label }
    : null

  // How much of the delivery charge the refund box may still offer, tax and all.
  const refundableDelivery = deliveryLeftToRefund(order, items, refunds)

  // Where each line's product lives on the storefront, so its name opens the
  // page the customer bought from rather than the product editor - which, for a
  // variation, is only a note saying to edit it somewhere else. A link is a
  // nicety: a read that will not answer leaves the names as plain text.
  const storefrontHrefs = Object.fromEntries(
    await resolveProductStorefrontHrefs(items.map((i) => i.productId).filter((v): v is string => Boolean(v)))
      .catch((error) => {
        console.error('[shop] could not resolve storefront links for an order', error)
        return new Map<string, string>()
      }),
  )

  return NextResponse.json({ order, items, storefrontHrefs, notes, emails, refunds, refundItems, downloads, customer, authors, customerReferenceLabel, deliveryInstructionsLabel: deliveryInstructionsLabelText, refundNotice, refundableDelivery, replacements, replacementLines, parentOrder, requests })
}

const PatchBody = z.object({
  // The customer's own reference for the order - their purchase order number.
  // Blank clears it, which is how a number typed into the wrong order is undone.
  customerReference: z.string().max(120).optional(),
  // Whether the completion email may ask for a review. Off for an order that
  // went badly - see migration 065.
  askForReview: z.boolean().optional(),
}).refine((body) => body.customerReference !== undefined || body.askForReview !== undefined, {
  message: 'Nothing to change',
})

// PATCH - the few things about an order somebody rings up to correct.
//
// The customer's own reference, and whether the completion email asks for a
// review. Deliberately narrow: an order's figures, lines and addresses are what
// the shopper agreed to, and a route that would quietly rewrite them is not a
// route this screen needs.
//
// Gated on shop.orders WITHOUT allowAccess, unlike the GET above: read-only shop
// access is enough to look at an order and not enough to change one.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireShopUser('shop.orders')
  if (gate.error) return gate.error

  const { id } = await params
  const parsed = PatchBody.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 })

  const { customerReference, askForReview } = parsed.data
  if (customerReference !== undefined && !(await setOrderCustomerReference(id, customerReference))) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  }
  if (askForReview !== undefined && !(await setOrderAskForReview(id, askForReview))) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  }

  const order = await getOrderById(id)
  return NextResponse.json({ order })
}
