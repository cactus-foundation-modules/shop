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
import { prisma } from '@/lib/db/prisma'
import { gatherCartExtensionPoint } from '@/modules/shop/lib/line-meta'
import { getOrderById, getOrderItems } from '@/modules/shop/lib/db/orders'
import type { LineMeta, LineMetaField, ShpOrder, ShpOrderItem } from '@/modules/shop/lib/types'

export type OrderPaymentStateInput = {
  order: ShpOrder
  items: ShpOrderItem[]
}

export type OrderPaymentStateResult = {
  // Replacement fields for named order items, merged into each item's stored
  // line_meta by label. An item not mentioned is left alone; a field whose label
  // the item has never carried is appended.
  items?: Array<{ itemId: string; fields: LineMetaField[] }>
  // One sentence for the checkout's payment step, shown once the shopper has
  // picked this order's payment method. Plain text - shop only ever prints it.
  note?: string | null
}

export type OrderPaymentStateProvider = (
  input: OrderPaymentStateInput,
) => Promise<OrderPaymentStateResult | null> | OrderPaymentStateResult | null

const POINT = 'shop.order-payment-state'

// Merge one provider's replacement fields into a line's stored meta. Label is the
// identity: a module restates its own field and nothing else moves.
function mergeFields(existing: LineMeta | null, replacements: LineMetaField[]): LineMeta {
  const fields = [...(existing?.fields ?? [])]
  for (const field of replacements) {
    const at = fields.findIndex((f) => f.label === field.label)
    if (at >= 0) fields[at] = field
    else fields.push(field)
  }
  return { ...(existing ?? {}), fields }
}

function sameFields(a: LineMetaField[], b: LineMetaField[]): boolean {
  return a.length === b.length && a.every((f, i) => f.label === b[i]!.label && f.value === b[i]!.value && f.href === b[i]!.href)
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
      if (!item || restatement.fields.length === 0) continue
      pending.set(item.id, mergeFields(pending.get(item.id) ?? item.lineMeta, restatement.fields))
    }
  }

  for (const [itemId, lineMeta] of pending) {
    const before = items.find((i) => i.id === itemId)?.lineMeta ?? null
    // Nothing to write when the wording is already what it should be - this runs
    // on every order creation, and most of them change nothing.
    if (before && sameFields(before.fields, lineMeta.fields)) continue
    await prisma.$executeRaw`
      UPDATE "shp_order_items" SET "line_meta" = ${JSON.stringify(lineMeta)}::jsonb WHERE "id" = ${itemId}
    `
  }

  return notes
}
