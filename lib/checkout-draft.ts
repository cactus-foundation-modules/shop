// A checkout that has been started but not paid for.
//
// Most payment methods take the money with the shopper still on this site, so
// the order is written first and the payment happens against it. A method that
// hands the shopper over to a bank or to a hosted card page cannot work that
// way honestly: the shop loses sight of them at the moment they leave, and most
// of the people who leave never come back. Writing the order up front meant the
// orders list filled with orders nobody had paid for, indistinguishable at a
// glance from the ones somebody had.
//
// So those methods draft the order here instead, and the order itself is
// created at the first moment the money is genuinely committed - see
// materialiseDraftOrder, which every settlement path goes through.
//
// The draft holds the id the order will be given and the order number it will
// carry, both minted before the payment provider is told about either, so
// nothing has to be re-pointed later: the module's payment row, the provider's
// return URL and the eventual order all name the same id from the start.
import { prisma } from '@/lib/db/prisma'
import { randomUUID } from 'crypto'
import { getOrderById, insertOrderRows, type CreateOrderInput } from '@/modules/shop/lib/db/orders'
import { applyOrderPaymentState } from '@/modules/shop/lib/order-payment-state'

// How long a draft is kept before it is swept. Deliberately generous: a bank
// payment can take days to confirm, and a draft thrown away while its money is
// still in flight would leave a settled payment with no order to settle against
// - which is worse than the phantom orders this whole mechanism exists to stop.
const DRAFT_TTL_MS = 30 * 24 * 60 * 60 * 1000

// What a settlement path needs to know about a draft without unpacking the
// whole order-to-be: who it belongs to, what it costs, and how it is being paid
// for. `total` is a string for the same reason ShpOrder.total is - it comes out
// of NUMERIC(10,2), and the two are compared by the same code.
export type ShpCheckoutDraft = {
  id: string
  orderNumber: string
  paymentMethod: string
  customerEmail: string
  customerName: string
  total: string
  currency: string
  createdAt: Date
}

function mapDraft(r: Record<string, unknown>): ShpCheckoutDraft {
  return {
    id: r.id as string,
    orderNumber: r.order_number as string,
    paymentMethod: r.payment_method as string,
    customerEmail: r.customer_email as string,
    customerName: r.customer_name as string,
    total: (r.total as { toString(): string }).toString(),
    currency: r.currency as string,
    createdAt: r.created_at as Date,
  }
}

// Dates do not survive a round trip through JSONB - they go in as ISO strings
// and come back as ISO strings - so the one date on a line is put back into
// shape here. Everything else on the payload is already the type it went in as.
function reviveOrderInput(payload: unknown): CreateOrderInput {
  const input = payload as CreateOrderInput
  return {
    ...input,
    items: input.items.map((item) => ({
      ...item,
      preOrderDispatchDate: item.preOrderDispatchDate ? new Date(item.preOrderDispatchDate) : null,
    })),
  }
}

/**
 * Draft an order rather than creating one, and hand back the id and number the
 * order will be given once it is paid for.
 *
 * `input.orderNumber` must already be reserved by the caller (the same
 * generateOrderNumber every other order goes through), because the number is
 * quoted to the payment provider before anything is written.
 */
export async function createCheckoutDraft(input: CreateOrderInput): Promise<ShpCheckoutDraft> {
  const id = input.id ?? randomUUID()
  const expiresAt = new Date(Date.now() + DRAFT_TTL_MS)
  const payload: CreateOrderInput = { ...input, id }

  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    INSERT INTO "shp_checkout_drafts" (
      "id", "order_number", "payment_method", "customer_email", "customer_name",
      "total", "currency", "payload", "expires_at"
    ) VALUES (
      ${id}, ${input.orderNumber}, ${input.paymentMethod}, ${input.customerEmail}, ${input.customerName},
      ${input.total}, ${input.currency}, ${JSON.stringify(payload)}::jsonb, ${expiresAt}
    )
    RETURNING *
  `

  // Housekeeping on the way past, rather than a cron job for one DELETE. Drafts
  // that were never paid for are invisible to everybody, so the only thing at
  // stake is the table not growing for ever.
  await prisma.$executeRaw`DELETE FROM "shp_checkout_drafts" WHERE "expires_at" < CURRENT_TIMESTAMP`

  return mapDraft(rows[0]!)
}

export async function getCheckoutDraft(id: string): Promise<ShpCheckoutDraft | null> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT * FROM "shp_checkout_drafts" WHERE "id" = ${id} LIMIT 1
  `
  return rows[0] ? mapDraft(rows[0]) : null
}

/**
 * Turn a draft into the real order. Idempotent, and safe to call from two places
 * at once - which it will be, because a redirect back from the provider and that
 * provider's webhook routinely arrive within a second of each other.
 *
 * Returns the order either way: the one it just created, or the one that was
 * already there. Null means neither a draft nor an order exists under that id,
 * which is a payment for something this shop has no record of.
 *
 * Call it only once the money is genuinely committed. Nothing in here checks
 * that - the payment provider is the only thing that can know it, so the check
 * belongs on the settlement path that has the payment in its hand.
 */
export async function materialiseDraftOrder(id: string): Promise<{ id: string; orderNumber: string } | null> {
  const existing = await getOrderById(id)
  if (existing) return { id: existing.id, orderNumber: existing.orderNumber }

  const created = await prisma.$transaction(async (tx) => {
    // FOR UPDATE is what makes the double call safe. The second caller blocks
    // here until the first commits, and then finds no draft - because deleting
    // it and inserting the order are the same transaction, so the two can never
    // both be true.
    const rows = await tx.$queryRaw<Record<string, unknown>[]>`
      SELECT "payload" FROM "shp_checkout_drafts" WHERE "id" = ${id} FOR UPDATE
    `
    if (!rows[0]) return null

    const input = reviveOrderInput(rows[0].payload)
    const order = await insertOrderRows(tx, { ...input, id })
    await tx.$executeRaw`DELETE FROM "shp_checkout_drafts" WHERE "id" = ${id}`
    return order
  })

  // No draft: either it was swept, or the caller that held the lock has just
  // turned it into the order. Look again before giving up.
  if (!created) {
    const settled = await getOrderById(id)
    return settled ? { id: settled.id, orderNumber: settled.orderNumber } : null
  }

  // The same call the immediate path makes the moment an order is created, and
  // for the same reason: this is the first point at which a module can say what
  // this payment method means for these lines. Deliberately outside the
  // transaction - a module having a bad day must not undo a paid order.
  await applyOrderPaymentState(created.id)

  return created
}
