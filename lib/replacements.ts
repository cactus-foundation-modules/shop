import { prisma } from '@/lib/db/prisma'
import { round2 } from '@/modules/shop/lib/checkout'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import { getProductById } from '@/modules/shop/lib/db/products'
import type { CreateOrderInput } from '@/modules/shop/lib/db/orders'
import {
  addOrderNote,
  getOrderById,
  getOrderItems,
  insertOrderRows,
  nextReplacementNumber,
} from '@/modules/shop/lib/db/orders'
import { setRequestReplacementOrder } from '@/modules/shop/lib/db/order-requests'
import { sendReplacementRaisedEmail } from '@/modules/shop/lib/replacement-emails'
import { findShippingZoneForPostcode, getTaxRateForZoneAndClass } from '@/modules/shop/lib/db/tax-shipping'
import type { ShpOrder, ShpOrderItem, ShpProduct } from '@/modules/shop/lib/types'

// Sending a replacement part out, and giving the customer something to watch.
//
// A customer reports a broken gas lift; the shop puts one in a box. Everything
// that then has to happen to it - picked, parcelled, handed to a courier,
// scanned, delivered, signed for - is machinery this module already owns, and
// every bit of it hangs off an ORDER. So the part goes out as an order of its
// own, numbered off the one it is putting right (DW000182-R1), worth nothing
// unless the shop decides to charge for it, and linked at both ends.
//
// What it is deliberately NOT: a second copy of the original order. A
// replacement is hardly ever the thing that was bought. Nobody sends a second
// chair - they send the gas lift out of it - which is why every line names the
// line it is for rather than inheriting it.

/** The method code a no-charge replacement carries. Not a payment provider and
 *  never registered as one: it exists so the order can say, on every screen
 *  that asks, that there was never any money to collect. */
export const NO_CHARGE_METHOD = 'NONE'

export type ReplacementLineInput = {
  /** A catalogued part. Null for a one-off typed in by hand. */
  productId: string | null
  /** What to call it. Required on a free-text line; overrides the product's own
   *  name where one is given, since "Gas lift (black)" beats the catalogue's
   *  wording on a picking note. */
  name?: string | null
  quantity: number
  /** Per unit. Omitted is free, which is what a warranty part is. */
  unitPrice?: number | null
  /** The line of the original order this part is for. */
  replacesOrderItemId?: string | null
}

export type CreateReplacementInput = {
  parentOrderId: string
  lines: ReplacementLineInput[]
  /** The damage report this is answering, where it came from one. */
  requestId?: string | null
  /** Goes on BOTH orders as an internal note - the original is where anybody
   *  looking into this later starts, and they will not think to look at an
   *  order they do not know exists. Never shown to the customer. */
  note?: string | null
  /** Core User id of whoever raised it, for the note's signature. */
  userId?: string | null
}

export type CreateReplacementResult =
  | { ok: false; status: number; error: string }
  | { ok: true; order: ShpOrder; orderNumber: string }

type PreparedLine = {
  input: ReplacementLineInput
  product: ShpProduct | null
  name: string
  sku: string | null
  type: ShpOrderItem['productType']
  unitPrice: number
  taxClassId: string | null
  returnable: boolean
  nonReturnableNote: string | null
}

/** The stock sentence on a free part. A shop that sends somebody a gas lift for
 *  nothing does not want a returns form for it, and saying so on the line is
 *  how the order page, the account and the returns rules all agree. */
const FREE_PART_NOTE = 'This was sent out to put an earlier order right, so there is nothing to send back.'

/**
 * Resolves what each line actually is, without touching the database twice for
 * the same product.
 *
 * A line may name a catalogued part, in which case its price, SKU, tax class
 * and type come off the product row; or it may be free text, which is what a
 * one-off nobody will ever send again should be. Both are legitimate, and the
 * difference is only ever `productId`.
 */
async function prepareLines(lines: ReplacementLineInput[]): Promise<PreparedLine[] | { error: string }> {
  const prepared: PreparedLine[] = []
  const seen = new Map<string, ShpProduct | null>()

  for (const input of lines) {
    if (!Number.isInteger(input.quantity) || input.quantity < 1) {
      return { error: 'Every line needs a whole number of items, at least one.' }
    }

    let product: ShpProduct | null = null
    if (input.productId) {
      if (!seen.has(input.productId)) seen.set(input.productId, await getProductById(input.productId))
      product = seen.get(input.productId) ?? null
      if (!product) return { error: 'One of those parts is no longer in the catalogue.' }
    }

    const name = (input.name ?? '').trim() || product?.name || ''
    if (!name) return { error: 'Every line needs a name - what is actually going in the box.' }

    // Free unless somebody typed a figure. Not taken from the product's price:
    // a part sent out to put an order right is a cost the shop is swallowing,
    // and defaulting to the shelf price would invoice a customer for the shop's
    // own mistake the first time anybody forgot to zero it.
    const unitPrice = round2(Math.max(input.unitPrice ?? 0, 0))

    prepared.push({
      input,
      product,
      name,
      sku: product?.sku ?? null,
      type: product?.type ?? 'PHYSICAL',
      unitPrice,
      taxClassId: product?.taxClassId ?? null,
      // A free part has nothing to refund, so a return on it is a form that
      // leads nowhere. One the customer paid for is an ordinary sale of a
      // spare, and keeps whatever the product itself says about returns.
      returnable: unitPrice > 0 ? (product?.returnable ?? true) : false,
      nonReturnableNote: unitPrice > 0 ? (product?.nonReturnableNote ?? null) : FREE_PART_NOTE,
    })
  }

  return prepared
}

/**
 * Raises the replacement.
 *
 * Born PROCESSING and PAID rather than PENDING: a part that owes nothing is a
 * picking job from the moment it is raised, and an order sitting in "awaiting
 * payment" would tell the customer on their own order page that they owe money
 * for the shop's mistake, and the owner's dashboard that there is a payment to
 * chase. A part the shop IS charging for is still created settled - the shop
 * decided to send it, and how that gets billed is between them and the customer
 * rather than something to hold the parcel up.
 *
 * No delivery charge is calculated, and the shipping zone is looked up only for
 * the tax rate. A gas lift goes in a jiffy bag; charging the two-man furniture
 * rate for it because the postcode says so would be absurd.
 */
export async function createReplacementOrder(input: CreateReplacementInput): Promise<CreateReplacementResult> {
  if (input.lines.length === 0) return { ok: false, status: 400, error: 'Nothing to send.' }

  const parent = await getOrderById(input.parentOrderId)
  if (!parent) return { ok: false, status: 404, error: 'That order no longer exists.' }
  // One level only. A part sent to replace a part is still putting the original
  // order right, and a chain of them would leave the customer's order page
  // walking a tree to find out where their gas lift got to.
  if (parent.kind === 'REPLACEMENT') {
    return { ok: false, status: 400, error: 'Raise the replacement against the original order, not against another replacement.' }
  }

  const prepared = await prepareLines(input.lines)
  if ('error' in prepared) return { ok: false, status: 400, error: prepared.error }

  // Every named line has to belong to the order being put right. Without this
  // check a mistyped id would file a part against somebody else's order, and
  // the customer whose order it was would see a part they never asked about.
  const namedItemIds = prepared
    .map((line) => line.input.replacesOrderItemId)
    .filter((id): id is string => Boolean(id))
  if (namedItemIds.length > 0) {
    const parentItems = await getOrderItems(parent.id)
    const known = new Set(parentItems.map((item) => item.id))
    if (namedItemIds.some((id) => !known.has(id))) {
      return { ok: false, status: 400, error: 'One of those lines is not on this order.' }
    }
  }

  const config = await getShopConfigCached()
  // The zone is wanted for its tax rates and nothing else - see the note above
  // about delivery. A postcode in no zone rates everything at zero, which is
  // exactly what a free part is worth anyway.
  const zone = await findShippingZoneForPostcode(parent.shippingAddress.postcode)

  let subtotal = 0
  let taxAmount = 0
  const items: CreateOrderInput['items'] = []
  for (const line of prepared) {
    const lineSubtotal = round2(line.unitPrice * line.input.quantity)
    const taxRate = zone ? await getTaxRateForZoneAndClass(zone.id, line.taxClassId) : 0
    const lineTax = config.taxMode === 'INCLUSIVE'
      ? lineSubtotal - lineSubtotal / (1 + taxRate)
      : lineSubtotal * taxRate
    subtotal += lineSubtotal
    taxAmount += lineTax
    items.push({
      productId: line.product?.id ?? null,
      productName: line.name,
      productSku: line.sku,
      productType: line.type,
      quantity: line.input.quantity,
      unitPrice: line.unitPrice,
      taxRate,
      taxAmount: round2(lineTax),
      total: lineSubtotal,
      isPreOrder: false,
      preOrderDispatchDate: null,
      returnable: line.returnable,
      nonReturnableNote: line.nonReturnableNote,
      replacesOrderItemId: line.input.replacesOrderItemId ?? null,
    })
  }

  const total = config.taxMode === 'INCLUSIVE' ? subtotal : subtotal + taxAmount

  // Numbered and inserted inside one transaction, with a retry, because
  // nextReplacementNumber reads what exists and two people pressing the button
  // together both read the same thing. The UNIQUE index on order_number is what
  // actually decides it; this loop is what turns that collision into a second
  // attempt instead of an error the owner has to make sense of.
  let created: { id: string; orderNumber: string } | null = null
  let lastError: unknown = null
  for (let attempt = 0; attempt < 3 && !created; attempt++) {
    const orderNumber = await nextReplacementNumber(parent.orderNumber)
    try {
      created = await prisma.$transaction((tx) =>
        insertOrderRows(tx, {
          orderNumber,
          kind: 'REPLACEMENT',
          parentOrderId: parent.id,
          status: 'PROCESSING',
          paymentStatus: 'PAID',
          paidAt: new Date(),
          memberId: parent.memberId,
          customerEmail: parent.customerEmail,
          customerName: parent.customerName,
          customerOrganisation: parent.customerOrganisation,
          // The shop's own reference for the original, so a part turning up on
          // its own can still be matched to the job it belongs to.
          customerReference: parent.customerReference,
          customerPhone: parent.customerPhone,
          // Carried, not defaulted. A MEMBER's choice is read off their account
          // either way (lib/order-notify.ts), but a guest's lives on the order
          // row alone - so without this, a guest who ticked "text me" about the
          // chair would hear nothing by text about the part replacing it.
          notifyEmail: parent.notifyEmail,
          notifySms: parent.notifySms,
          notifyPhone: parent.notifyPhone,
          shippingAddress: parent.shippingAddress,
          deliveryInstructions: parent.deliveryInstructions,
          billingAddress: parent.billingAddress,
          subtotal: round2(subtotal),
          discountAmount: 0,
          shippingAmount: 0,
          taxAmount: round2(taxAmount),
          total: round2(total),
          taxMode: config.taxMode,
          currency: parent.currency,
          paymentMethod: total > 0 ? parent.paymentMethod : NO_CHARGE_METHOD,
          items,
        }),
      )
    } catch (error) {
      lastError = error
      if (!isDuplicateOrderNumber(error)) throw error
    }
  }

  if (!created) {
    console.error('[shop] replacement order number kept colliding', lastError)
    return { ok: false, status: 409, error: 'Something else raised a replacement for this order at the same moment. Try again.' }
  }

  if (input.requestId) await setRequestReplacementOrder(input.requestId, created.id)

  // On the parent as well as the replacement, and worded from the original
  // order's point of view: somebody chasing "what did we do about that chair"
  // opens DW000182, not a replacement they have never heard of.
  const trail = `Replacement ${created.orderNumber} raised: ${items.map((i) => `${i.quantity} x ${i.productName}`).join(', ')}.`
  const note = input.note?.trim()
  await addOrderNote(parent.id, note ? `${trail} ${note}` : trail, true, input.userId ?? null)
  if (note) await addOrderNote(created.id, note, true, input.userId ?? null)

  const order = await getOrderById(created.id)
  if (!order) return { ok: false, status: 500, error: 'The replacement was created but could not be read back.' }

  // Told at the moment it is raised, not at dispatch. A part waiting on a
  // supplier can be a fortnight of silence after somebody was promised it would
  // be put right, and that fortnight is when they ring up.
  await sendReplacementRaisedEmail(order)

  return { ok: true, order, orderNumber: created.orderNumber }
}

/** Postgres 23505 on the order number, which is the only collision this can
 *  hit - and the only one worth retrying rather than reporting. */
function isDuplicateOrderNumber(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code
  const message = error instanceof Error ? error.message : ''
  return code === 'P2002' || code === '23505' || message.includes('shp_orders_order_number_key')
}
