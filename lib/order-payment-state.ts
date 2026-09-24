// `shop.order-payment-state` - a module gets to restate what an order's lines
// say when the order's payment state changes, and to add a sentence to the
// checkout about what that method means.
//
// The reason this seam exists: a line snapshot is written once, at the moment the
// order is placed, and then read forever after - on the confirmation page, in the
// confirmation email, in the account's order history, in the admin. That is
// exactly right for a personalisation ("Engraving: For Dad"). It is wrong for
// anything whose truth depends on the money having arrived. A shop that takes
// bank transfer hands the shopper an order they have not paid for yet, so a line
// promising a delivery DATE is promising it from a starting gun that has not
// fired.
//
// Shop stays generic throughout: it knows nothing about delivery, dates or bank
// transfers. It only calls every registered provider at the two moments an
// order's payment state moves - when the order is created, and when it is paid -
// hands over the order and its items, and persists whatever fields come back.
//
// A provider returns fields by LABEL, and shop merges them into the stored
// line_meta by label: same label replaces, everything else is left exactly as it
// was. That way a module can restate its own "Delivery" line without touching a
// variation's "Colour" line sitting next to it.
//
// It may also hand back its own machine-readable state (`data`), merged into the
// line's `line_meta.data` by top-level key on the same principle. Shop never
// reads a key of it; it exists so that a module which re-dates a line can keep
// the new date where it can find it again, rather than only in a sentence.
import { prisma } from '@/lib/db/prisma'
import { gatherCartExtensionPoint } from '@/modules/shop/lib/line-meta'
import { getOrderById, getOrderItems } from '@/modules/shop/lib/db/orders'
import type { ResolvedCartLine } from '@/modules/shop/lib/checkout'
import type { LineMeta, LineMetaField, ShpAddress, ShpOrder, ShpOrderItem } from '@/modules/shop/lib/types'

export type OrderPaymentStateInput = {
  order: ShpOrder
  items: ShpOrderItem[]
  // True when this is a look-ahead for an order that does not exist yet: the
  // shopper has picked a payment method at the checkout and wants to know what
  // it means before filling in the rest. `order` and `items` are then a
  // prospective shape rather than rows - the payment method and the lines are
  // real, every other figure is a placeholder and the ids point at nothing.
  //
  // A provider that only reads what it is handed needs to do nothing about
  // this. One that goes back to the database for its own order row, or that
  // writes anything of its own, must return null when it is set: line
  // restatements are discarded in preview, since there is no line to restate.
  preview?: boolean
}

export type OrderPaymentStateResult = {
  // Replacement fields for named order items, merged into each item's stored
  // line_meta by label. An item not mentioned is left alone; a field whose label
  // the item has never carried is appended.
  items?: Array<{
    itemId: string
    fields: LineMetaField[]
    // Keys of this line's `line_meta.data` to replace, each under the module's
    // own namespaced key. A key not mentioned is left alone.
    data?: Record<string, unknown>
  }>
  // One sentence for the checkout's payment step, shown once the shopper has
  // picked this order's payment method. Plain text - shop only ever prints it.
  note?: string | null
}

export type OrderPaymentStateProvider = (
  input: OrderPaymentStateInput,
) => Promise<OrderPaymentStateResult | null> | OrderPaymentStateResult | null

const POINT = 'shop.order-payment-state'

// Merge one provider's restatement into a line's stored meta. Label is the
// identity for a field and the top-level key is the identity for data: a module
// restates its own and nothing else moves.
function mergeRestatement(existing: LineMeta | null, replacements: LineMetaField[], data: Record<string, unknown> | undefined): LineMeta {
  const fields = [...(existing?.fields ?? [])]
  for (const field of replacements) {
    const at = fields.findIndex((f) => f.label === field.label)
    if (at >= 0) fields[at] = field
    else fields.push(field)
  }
  const merged: LineMeta = { ...(existing ?? {}), fields }
  if (data && Object.keys(data).length > 0) merged.data = { ...(existing?.data ?? {}), ...data }
  return merged
}

function sameFields(a: LineMetaField[], b: LineMetaField[]): boolean {
  return a.length === b.length && a.every((f, i) => f.label === b[i]!.label && f.value === b[i]!.value && f.href === b[i]!.href)
}

// Compared as JSON: the values are whatever a provider serialised, so a JSON
// round trip is exactly what they will be once stored anyway.
function sameData(a: Record<string, unknown> | undefined, b: Record<string, unknown> | undefined): boolean {
  return JSON.stringify(a ?? {}) === JSON.stringify(b ?? {})
}

/**
 * Run every registered provider against an order and persist the line-meta
 * restatements they ask for. Returns the notes they offered, in provider order,
 * for a caller that has somewhere to show them (the checkout does; fulfilment
 * does not).
 *
 * Safe to call on any order, at any point: with no providers installed it is a
 * single cached read and no writes at all, and a provider that has nothing to say
 * about this order returns null.
 */
export async function applyOrderPaymentState(orderId: string): Promise<string[]> {
  const providers = await gatherCartExtensionPoint<OrderPaymentStateProvider>(POINT)
  if (providers.length === 0) return []

  const order = await getOrderById(orderId)
  if (!order) return []
  const items = await getOrderItems(orderId)
  if (items.length === 0) return []

  const notes: string[] = []
  // Accumulated per item so two providers restating different labels on the same
  // line both survive - the second merges onto the first's result, not the
  // stored row.
  const pending = new Map<string, LineMeta>()

  for (const provider of providers) {
    let result: OrderPaymentStateResult | null
    try {
      result = await provider({ order, items })
    } catch (err) {
      // A module having a bad day must not cost the shopper their checkout: the
      // order is already written and the payment is the next thing to happen.
      // Whatever this provider wanted to say is simply not said.
      console.error(`[shop.order-payment-state] provider failed for order ${order.orderNumber}`, err)
      continue
    }
    if (!result) continue
    if (result.note) notes.push(result.note)
    for (const restatement of result.items ?? []) {
      const item = items.find((i) => i.id === restatement.itemId)
      const hasData = restatement.data !== undefined && Object.keys(restatement.data).length > 0
      if (!item || (restatement.fields.length === 0 && !hasData)) continue
      pending.set(item.id, mergeRestatement(pending.get(item.id) ?? item.lineMeta, restatement.fields, restatement.data))
    }
  }

  for (const [itemId, lineMeta] of pending) {
    const before = items.find((i) => i.id === itemId)?.lineMeta ?? null
    // Nothing to write when the wording is already what it should be - this runs
    // on every order creation, and most of them change nothing.
    if (before && sameFields(before.fields, lineMeta.fields) && sameData(before.data, lineMeta.data)) continue
    await prisma.$executeRaw`
      UPDATE "shp_order_items" SET "line_meta" = ${JSON.stringify(lineMeta)}::jsonb WHERE "id" = ${itemId}
    `
  }

  return notes
}

// A stand-in for the order the shopper has not placed yet. Everything on it
// except the payment method is a placeholder, deliberately and visibly so: at
// this point in the checkout the address may be half-typed and the totals are
// not settled, and a provider inventing a sentence out of either would be
// quoting figures nobody has agreed to. `preview` on the input says as much.
function prospectiveOrder(paymentMethod: string): ShpOrder {
  const now = new Date()
  const nowhere: ShpAddress = { firstName: '', lastName: '', line1: '', city: '', postcode: '', country: 'GB' }
  return {
    id: '', orderNumber: '', status: 'PENDING', memberId: null,
    // A checkout is always a sale. A replacement never comes through here: it
    // is raised in the admin, already settled, with nothing to preview.
    kind: 'SALE', parentOrderId: null,
    customerEmail: '', customerName: '', customerOrganisation: null, customerReference: null, customerPhone: null,
    shippingAddress: nowhere, deliveryInstructions: null, billingAddress: null,
    subtotal: '0', discountAmount: '0', shippingAmount: '0', taxAmount: '0', total: '0',
    taxMode: 'INCLUSIVE', currency: '', couponId: null, couponCode: null,
    paymentMethod,
    // Nothing has changed it, because nothing has happened to it yet.
    originalPaymentMethod: null,
    // The point of the whole exercise: nothing has been paid, which is what
    // makes a pay-later method worth saying anything about at all.
    paymentStatus: 'PENDING',
    paymentReference: null, paidAt: null, shippingRateId: null, shippingRateName: null,
    agreements: null,
    // Nobody has been asked how they want to hear about an order that does not
    // exist, so this is the default an order is born with.
    notifyEmail: true, notifySms: false, notifyPhone: null,
    createdAt: now, updatedAt: now,
  }
}

// The cart as the order items it is about to become. The line meta is the real
// thing - server-resolved, the same value that will be snapshotted onto the
// order - because that is where a provider's own state lives and the only part
// of a line a note can honestly be derived from before checkout finishes.
function prospectiveItems(lines: ResolvedCartLine[]): ShpOrderItem[] {
  return lines.map((line, index) => ({
    id: `preview-${index}`,
    orderId: '',
    productId: line.product.id,
    productName: line.product.name,
    productSku: line.product.sku,
    saleSku: line.saleSku,
    productType: line.product.type,
    quantity: line.quantity,
    unitPrice: '0', taxRate: '0', taxAmount: '0', total: '0',
    refundedQty: 0,
    isPreOrder: line.isPreOrder,
    preOrderDispatchDate: line.product.preOrderDispatchDate,
    lineMeta: line.lineMeta,
    // Prospective lines carry no money at all (the three figures above are '0'),
    // so there is nothing for a deduction to have come off yet.
    orderSizeDeduction: null,
    // Already settled by the resolve pass, so it is carried rather than assumed -
    // a payment-note provider that wants to say something about a made-to-order
    // basket can see it here.
    returnable: line.returnable,
    nonReturnableNote: line.nonReturnableNote,
    returnsDiscretionary: line.returnsDiscretionary,
    // A basket line is never a replacement part: parts are picked in the admin,
    // against an order that already exists.
    replacesOrderItemId: null,
  }))
}

/**
 * What the registered providers would say about this cart on this payment
 * method, asked before any order exists.
 *
 * The same sentences come back from the order-creating route, but that route
 * cannot be called until the checkout is filled in and every compulsory box is
 * ticked - so a shopper choosing between card and bank transfer would only be
 * told what bank transfer costs them well after the point they were deciding.
 * This asks the same question with nothing at stake: no order row, no provider
 * intent, and any line restatements a provider offers are dropped on the floor
 * because there is no line to restate yet.
 */
export async function previewOrderPaymentNotes(paymentMethod: string, lines: ResolvedCartLine[]): Promise<string[]> {
  const providers = await gatherCartExtensionPoint<OrderPaymentStateProvider>(POINT)
  if (providers.length === 0 || lines.length === 0) return []

  const input: OrderPaymentStateInput = {
    order: prospectiveOrder(paymentMethod),
    items: prospectiveItems(lines),
    preview: true,
  }

  const notes: string[] = []
  for (const provider of providers) {
    try {
      const result = await provider(input)
      if (result?.note) notes.push(result.note)
    } catch (err) {
      // Nothing is riding on this one - the shopper simply is not told a thing
      // they would otherwise have been told, and the order route asks again in
      // earnest later.
      console.error(`[shop.order-payment-state] preview provider failed for ${paymentMethod}`, err)
    }
  }
  return notes
}
