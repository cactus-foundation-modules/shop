import { prisma, type PrismaTransactionClient } from '@/lib/db/prisma'
import type { ShpRefund, ShpRefundItem } from '@/modules/shop/lib/types'
import { paymentTaken } from '@/modules/shop/lib/payment-taken'
import { restockRefundedUnits } from '@/modules/shop/lib/db/order-stock'
import { refundableDelivery } from '@/modules/shop/lib/refund-delivery'

function mapRefund(r: Record<string, unknown>): ShpRefund {
  return {
    id: r.id as string,
    orderId: r.order_id as string,
    amount: (r.amount as { toString(): string }).toString(),
    reason: (r.reason as string | null) ?? null,
    providerRefundId: (r.provider_refund_id as string | null) ?? null,
    status: r.status as ShpRefund['status'],
    // Absent on an install that has not taken migration 037 yet, which reads the
    // same as "no invoice has taken this off its face" and is the right answer
    // for every refund written before the column existed.
    nettedOffInvoiceId: (r.netted_off_invoice_id as string | null) ?? null,
    // Absent before migration 060, when no refund could carry delivery.
    shippingAmount: r.shipping_amount != null ? (r.shipping_amount as { toString(): string }).toString() : '0.00',
    createdBy: r.created_by as string,
    createdAt: r.created_at as Date,
  }
}

function mapRefundItem(r: Record<string, unknown>): ShpRefundItem {
  return {
    id: r.id as string,
    refundId: r.refund_id as string,
    orderItemId: r.order_item_id as string,
    quantity: r.quantity as number,
    amount: (r.amount as { toString(): string }).toString(),
  }
}

export async function listRefundsForOrder(orderId: string): Promise<ShpRefund[]> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`SELECT * FROM "shp_refunds" WHERE "order_id" = ${orderId} ORDER BY "created_at" ASC`
  return rows.map(mapRefund)
}

// Every refund line on an order in one query, for the admin's refund history.
// Per-refund lookups would be one query per refund on a screen that already
// makes several calls, and refunds arrive in ones and twos.
export async function listRefundItemsForOrder(orderId: string): Promise<ShpRefundItem[]> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT ri.* FROM "shp_refund_items" ri
    JOIN "shp_refunds" r ON r."id" = ri."refund_id"
    WHERE r."order_id" = ${orderId}
  `
  return rows.map(mapRefundItem)
}

export async function getRefundById(id: string): Promise<ShpRefund | null> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`SELECT * FROM "shp_refunds" WHERE "id" = ${id} LIMIT 1`
  return rows[0] ? mapRefund(rows[0]) : null
}

/** One line of a settled refund that has no credit note behind it, with the day
 *  the refund happened so a caller can tell it apart from one that settled later. */
export type UncreditedRefundLine = {
  refundId: string
  createdAt: Date
  orderItemId: string
  quantity: number
  amount: string
}

/**
 * Every settled refund line on an order that nothing has dealt with yet.
 *
 * The list an invoice is raised net of. A refund is either credited by a credit
 * note or taken off an invoice before it goes out, never both, so a refund with
 * either mark against it is already accounted for and must not be taken off
 * again - crediting the same money twice is a wrong return in the direction
 * that gets noticed by HMRC rather than by the owner.
 *
 * `alsoNettedOffInvoiceId` lets one invoice's own marks back in, which is what
 * the reissue path needs: a replacement must come out at the figures the
 * document it replaces came out at, and those are exactly the refunds that
 * invoice was netted of.
 */
export async function listUncreditedRefundLines(
  orderId: string,
  alsoNettedOffInvoiceId?: string | null,
): Promise<UncreditedRefundLine[]> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT r."id" AS refund_id, r."created_at", ri."order_item_id", ri."quantity", ri."amount"::text AS amount
    FROM "shp_refunds" r
    JOIN "shp_refund_items" ri ON ri."refund_id" = r."id"
    LEFT JOIN "shp_credit_notes" cn ON cn."refund_id" = r."id"
    WHERE r."order_id" = ${orderId} AND r."status" = 'COMPLETED' AND cn."id" IS NULL
      AND (r."netted_off_invoice_id" IS NULL OR r."netted_off_invoice_id" = ${alsoNettedOffInvoiceId ?? null})
    ORDER BY r."created_at" ASC
  `
  return rows.map((r) => ({
    refundId: r.refund_id as string,
    createdAt: r.created_at as Date,
    orderItemId: r.order_item_id as string,
    quantity: r.quantity as number,
    amount: String(r.amount ?? '0'),
  }))
}

/**
 * The delivery money on those same refunds - settled, not credited, not netted
 * off another invoice - which an invoice leaves off its delivery charge the way
 * it leaves refunded lines off its goods. Its own query because a refund of
 * delivery alone has no lines, and the one above only sees refunds that do.
 */
export async function listUncreditedRefundDelivery(
  orderId: string,
  alsoNettedOffInvoiceId?: string | null,
): Promise<Array<{ refundId: string; shippingAmount: string }>> {
  const rows = await prisma.$queryRaw<{ refund_id: string; shipping_amount: string }[]>`
    SELECT r."id" AS refund_id, r."shipping_amount"::text AS shipping_amount
    FROM "shp_refunds" r
    LEFT JOIN "shp_credit_notes" cn ON cn."refund_id" = r."id"
    WHERE r."order_id" = ${orderId} AND r."status" = 'COMPLETED' AND cn."id" IS NULL
      AND r."shipping_amount" > 0
      AND (r."netted_off_invoice_id" IS NULL OR r."netted_off_invoice_id" = ${alsoNettedOffInvoiceId ?? null})
    ORDER BY r."created_at" ASC
  `
  return rows.map((r) => ({ refundId: r.refund_id, shippingAmount: String(r.shipping_amount ?? '0') }))
}

/** Records that an invoice was raised with these refunds already taken off it,
 *  so nothing credits them a second time. Written after the invoice row exists,
 *  because that is what it points at - and on the same transaction as that row
 *  where the caller has one, so the two cannot come apart (see
 *  issueInvoiceForOrder). */
export async function markRefundsNettedOff(
  refundIds: string[],
  invoiceId: string,
  tx?: PrismaTransactionClient,
): Promise<void> {
  if (refundIds.length === 0) return
  await (tx ?? prisma).$executeRaw`
    UPDATE "shp_refunds" SET "netted_off_invoice_id" = ${invoiceId}
    WHERE "id" = ANY(${refundIds}::text[])
  `
}

/** Undoes those marks when the invoice that carried them is voided. The document
 *  that absorbed the refunds is gone, so they are undealt-with again and the
 *  next invoice takes them off as this one did. Takes the void's transaction
 *  for the same reason the mark takes the insert's. */
export async function clearRefundsNettedOff(invoiceId: string, tx?: PrismaTransactionClient): Promise<void> {
  await (tx ?? prisma).$executeRaw`
    UPDATE "shp_refunds" SET "netted_off_invoice_id" = NULL WHERE "netted_off_invoice_id" = ${invoiceId}
  `
}

export async function getRefundItems(refundId: string): Promise<ShpRefundItem[]> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`SELECT * FROM "shp_refund_items" WHERE "refund_id" = ${refundId}`
  return rows.map(mapRefundItem)
}

export type CreateRefundInput = {
  orderId: string
  amount: number
  reason: string | null
  providerRefundId: string | null
  status: ShpRefund['status']
  createdBy: string
  items: Array<{ orderItemId: string; quantity: number; amount: number }>
}

export async function createRefund(data: CreateRefundInput): Promise<{ id: string }> {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<[{ id: string }]>`
      INSERT INTO "shp_refunds" ("order_id", "amount", "reason", "provider_refund_id", "status", "created_by")
      VALUES (${data.orderId}, ${data.amount}, ${data.reason}, ${data.providerRefundId}, ${data.status}, ${data.createdBy})
      RETURNING "id"
    `
    const refundId = rows[0].id
    for (const item of data.items) {
      await tx.$executeRaw`
        INSERT INTO "shp_refund_items" ("refund_id", "order_item_id", "quantity", "amount")
        VALUES (${refundId}, ${item.orderItemId}, ${item.quantity}, ${item.amount})
      `
      await tx.$executeRaw`UPDATE "shp_order_items" SET "refunded_qty" = "refunded_qty" + ${item.quantity} WHERE "id" = ${item.orderItemId}`
    }
    return { id: refundId }
  })
}

export type ProcessRefundInput = {
  orderId: string
  reason: string | null
  createdBy: string
  items: Array<{ orderItemId: string; quantity: number; amount: number }>
  // The delivery charge handed back with the lines, tax and all. Optional and
  // zero by default - a refund of goods alone, which is what every refund was
  // before delivery could be refunded at all. May be the whole refund, with no
  // lines, where only the delivery is going back.
  shippingAmount?: number
  // Performs the actual provider-side refund, given the freshly-created refund
  // row id to use as the provider idempotency key. Invoked with NO database
  // transaction open - see processRefund for how concurrent refunds on one
  // order are still serialised.
  performRefund: (idempotencyKey: string) => Promise<{ success: boolean; providerRefundId: string | null; error?: string }>
}

export type ProcessRefundResult =
  | { ok: false; status: number; error: string }
  | { ok: true; refundId: string; success: boolean; error?: string }

// Advisory-lock namespace for shop refunds - 'SHRP' as an int4, so our locks
// can't collide with anything else in the database using pg_advisory_*.
const REFUND_LOCK_NAMESPACE = 0x53485250

// A PENDING refund row is a live reservation on its order: it exists from the
// moment the validation transaction commits until the settle transaction
// resolves it, which spans the provider call. Anything older than this window
// can only have been left behind by a request that died mid-flight (module API
// routes are capped at 60 seconds), so it stops blocking new refunds - but its
// amount still counts against the caps, because a stranded PENDING may well
// have been refunded by the provider before the process went away.
const PENDING_REFUND_STALE_SECONDS = 5 * 60

const REFUND_IN_PROGRESS_ERROR = 'A refund is already in progress for this order. Wait for it to finish, then try again.'

type PreparedRefund = { ok: true; refundId: string }
type RefundFailure = { ok: false; status: number; error: string }

// Validation half of processRefund: takes the order's advisory lock, re-reads
// every cap under it, and commits a PENDING refund row that reserves the order
// for the provider call that follows. Deliberately short - it opens and closes
// well inside the interactive-transaction default, so no pooled connection is
// held while anything slow happens.
async function prepareRefund(input: ProcessRefundInput): Promise<PreparedRefund | RefundFailure> {
  return prisma.$transaction(async (tx): Promise<PreparedRefund | RefundFailure> => {
    // Transaction-scoped advisory lock keyed on the order. Postgres releases it
    // on commit or rollback, so it cannot be leaked by a crashed request the way
    // a session-level lock can. Only one refund at a time gets to validate.
    const locked = await tx.$queryRaw<[{ locked: boolean }]>`
      SELECT pg_try_advisory_xact_lock(${REFUND_LOCK_NAMESPACE}::int4, hashtext(${input.orderId})) AS locked
    `
    if (!locked[0]?.locked) return { ok: false, status: 409, error: REFUND_IN_PROGRESS_ERROR }

    const orderRows = await tx.$queryRaw<{ total: string; tax_mode: string; payment_status: string; shipping_amount: string; tax_amount: string }[]>`
      SELECT "total"::text AS total, "tax_mode", "payment_status",
             "shipping_amount"::text AS shipping_amount, "tax_amount"::text AS tax_amount
      FROM "shp_orders" WHERE "id" = ${input.orderId}
    `
    if (!orderRows[0]) return { ok: false, status: 404, error: 'Order not found' }
    // Nothing comes back off an order nothing was paid on. A bank transfer still
    // awaiting its money, or a card payment that failed, would otherwise take a
    // "refund" that moves no money but still counts the units off, sets the
    // order to refunded and raises a credit note for a payment that never came.
    if (!paymentTaken(orderRows[0].payment_status)) {
      return {
        ok: false,
        status: 400,
        error: 'This order has not been marked as paid, so there is nothing to refund yet. If the money did arrive, mark it as paid first.',
      }
    }
    const orderTotal = Number(orderRows[0].total)
    // On an EXCLUSIVE shop a line's `total` is its NET value and the tax sits
    // beside it; on an INCLUSIVE one the tax is already inside. The caps below
    // are about money the customer actually parted with, so they have to know
    // which. Getting this wrong capped every refund at the net figure and
    // quietly kept the VAT.
    const taxOnTop = orderRows[0].tax_mode === 'EXCLUSIVE'

    // Any PENDING refund row on this order is another request's reservation. A
    // live one means a provider call is in flight right now, so refuse rather
    // than validate against quantities that are about to move.
    const pending = await tx.$queryRaw<{ amount: string; is_stale: boolean }[]>`
      SELECT "amount"::text AS amount,
             ("created_at" < CURRENT_TIMESTAMP - (${PENDING_REFUND_STALE_SECONDS}::int4 * INTERVAL '1 second')) AS is_stale
      FROM "shp_refunds"
      WHERE "order_id" = ${input.orderId} AND "status" = 'PENDING'
    `
    if (pending.some((p) => !p.is_stale)) return { ok: false, status: 409, error: REFUND_IN_PROGRESS_ERROR }
    const strandedAmount = pending.reduce((sum, p) => sum + Number(p.amount), 0)

    // Validate each line against its current refunded_qty, read under the lock.
    //
    // Folded per line first, as createShipment folds its lines. Two entries for
    // the same line each checked on their own both pass against the same
    // starting refunded_qty - two lots of "all 2 chairs" on a two-chair line -
    // and the provider was then asked for both lots of money. The settle step's
    // own cap stopped the counter running past what was bought, but by then the
    // money had gone.
    const merged = new Map<string, { quantity: number; amount: number }>()
    for (const item of input.items) {
      const sofar = merged.get(item.orderItemId) ?? { quantity: 0, amount: 0 }
      merged.set(item.orderItemId, { quantity: sofar.quantity + item.quantity, amount: sofar.amount + item.amount })
    }
    let totalAmount = 0
    for (const [orderItemId, item] of merged) {
      const rows = await tx.$queryRaw<
        { order_id: string; product_name: string; quantity: number; refunded_qty: number; total: string; unit_price: string; tax_amount: string }[]
      >`
        SELECT "order_id", "product_name", "quantity", "refunded_qty",
               "total"::text AS total, "unit_price"::text AS unit_price,
               "tax_amount"::text AS tax_amount
        FROM "shp_order_items" WHERE "id" = ${orderItemId}
      `
      const oi = rows[0]
      if (!oi || oi.order_id !== input.orderId) return { ok: false, status: 404, error: 'Order item not found' }
      if (oi.refunded_qty + item.quantity > oi.quantity) {
        return { ok: false, status: 400, error: `Cannot refund more than the ${oi.quantity} units purchased for ${oi.product_name}` }
      }
      // Money cap: the requested amount can't exceed this line's tax-inclusive
      // value for the units being refunded (penny tolerance for rounding).
      //
      // Tax-inclusive means exactly that. An EXCLUSIVE shop's `total` is the net
      // figure, so capping against it refuses to hand back the VAT the customer
      // paid - a fifth of the money, permanently, with the API rejecting the
      // correct amount even when somebody typed it in deliberately.
      const lineGross = Number(oi.total) + (taxOnTop ? Number(oi.tax_amount) : 0)
      const perUnit = oi.quantity > 0 ? lineGross / oi.quantity : Number(oi.unit_price)
      const maxLineRefund = perUnit * item.quantity + 0.01
      if (item.amount > maxLineRefund) {
        return { ok: false, status: 400, error: `Refund amount for ${oi.product_name} exceeds the value of the units being refunded` }
      }
      totalAmount += item.amount
    }

    // Delivery, where some is going back: never more than is left of what the
    // customer paid for it (lib/refund-delivery.ts), with the same penny of
    // tolerance the lines get. Stranded PENDING delivery counts as gone, as its
    // money does below.
    const shippingAmount = Math.round(Math.max(input.shippingAmount ?? 0, 0) * 100) / 100
    if (shippingAmount > 0) {
      const lineTax = await tx.$queryRaw<{ tax_amount: string }[]>`
        SELECT "tax_amount"::text AS tax_amount FROM "shp_order_items" WHERE "order_id" = ${input.orderId}
      `
      const deliveryRefunds = await tx.$queryRaw<{ status: string; shipping_amount: string }[]>`
        SELECT "status", "shipping_amount"::text AS shipping_amount FROM "shp_refunds"
        WHERE "order_id" = ${input.orderId} AND "status" IN ('COMPLETED', 'PENDING')
      `
      const left = refundableDelivery(
        { taxMode: orderRows[0].tax_mode, shippingAmount: orderRows[0].shipping_amount, taxAmount: orderRows[0].tax_amount },
        lineTax.map((row) => ({ taxAmount: row.tax_amount })),
        deliveryRefunds.map((row) => ({ status: row.status, shippingAmount: row.shipping_amount })),
      )
      if (shippingAmount > left + 0.01) {
        return {
          ok: false,
          status: 400,
          error: left > 0
            ? `Only ${left.toFixed(2)} of the delivery charge is left to refund.`
            : 'The delivery charge on this order has already been refunded, or there was none.',
        }
      }
      totalAmount += shippingAmount
    }
    if (!(totalAmount > 0) && merged.size === 0) return { ok: false, status: 400, error: 'There is nothing in this refund.' }

    // Cumulative cap: prior COMPLETED refunds plus this one can't exceed the
    // order total, so a run of partials can't sum past what was charged.
    // Stranded PENDING amounts count too - their provider outcome is unknown, and
    // assuming they went through is the direction that can't over-refund.
    const priorRows = await tx.$queryRaw<{ sum: string }[]>`
      SELECT COALESCE(SUM("amount"), 0)::text AS sum FROM "shp_refunds"
      WHERE "order_id" = ${input.orderId} AND "status" = 'COMPLETED'
    `
    const alreadyRefunded = Number(priorRows[0]?.sum ?? 0) + strandedAmount
    if (alreadyRefunded + totalAmount > orderTotal + 0.01) {
      return { ok: false, status: 400, error: 'This refund would exceed the amount paid for the order.' }
    }

    // The PENDING row is both the provider's idempotency key and this order's
    // reservation - it has to be committed before the provider is called, which
    // is exactly why the call can safely happen outside a transaction.
    const created = await tx.$queryRaw<[{ id: string }]>`
      INSERT INTO "shp_refunds" ("order_id", "amount", "shipping_amount", "reason", "status", "created_by", "intended_items")
      VALUES (
        ${input.orderId}, ${totalAmount}, ${shippingAmount}, ${input.reason}, 'PENDING', ${input.createdBy},
        -- Park what this refund is meant to cover. If the process dies before the
        -- outcome is recorded, this is the only surviving record of which units
        -- were involved, and reconcileStaleRefunds needs it to settle the row.
        ${JSON.stringify(input.items)}::jsonb
      )
      RETURNING "id"
    `
    return { ok: true, refundId: created[0].id }
  })
}

// What settling did: whether THIS call was the one to resolve the row (false
// when somebody else already had), and which lines' refunded_qty it actually
// moved on a success - the units the stock restock may consider, and no others.
type SettleOutcome = { claimed: boolean; bumped: Array<{ orderItemId: string; quantity: number }> }

// Settle half: records the provider's answer and, only when it succeeded, the
// refund items, the refunded_qty bump and the order status. Also short, and it
// re-takes the order's advisory lock so the read-modify-write of the order
// status can't interleave with another refund's.
async function settleRefund(
  input: ProcessRefundInput,
  refundId: string,
  result: { success: boolean; providerRefundId: string | null; error?: string }
): Promise<SettleOutcome> {
  return prisma.$transaction(
    async (tx): Promise<SettleOutcome> => {
      // Blocking rather than try-lock: settling is not optional, and nothing
      // holds this lock for longer than one of these short transactions.
      //
      // $executeRaw, NOT $queryRaw, and this is not a style choice.
      // pg_advisory_xact_lock returns `void`, and Prisma has no mapping for
      // that type - $queryRaw tries to deserialise the column and throws
      // "Failed to deserialize column of type 'void'" every single time. It
      // threw here on the FIRST refund this shop ever took, after the PENDING
      // reservation had already been committed: the row stranded, the order
      // never moved, and the browser got a 500 it could not read. The try-lock
      // in prepareRefund above is fine because its variant returns boolean.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${REFUND_LOCK_NAMESPACE}::int4, hashtext(${input.orderId}))`

      // Only a row still PENDING is this call's to settle. The reconcile job and
      // a second run of it can both pick up the same stale row; without this
      // guard both went on to insert its refund items and bump refunded_qty
      // again, and with stock now following refunds, would have put the same
      // units back on the shelf twice. The loser finds nothing to claim and
      // stops here, under the same lock the winner held.
      const claimed = await tx.$executeRaw`
        UPDATE "shp_refunds" SET "status" = ${result.success ? 'COMPLETED' : 'FAILED'}, "provider_refund_id" = ${result.providerRefundId}
        WHERE "id" = ${refundId} AND "status" = 'PENDING'
      `
      if (claimed === 0) return { claimed: false, bumped: [] }
      if (!result.success) return { claimed: true, bumped: [] }

      const bumped: SettleOutcome['bumped'] = []
      for (const item of input.items) {
        await tx.$executeRaw`
          INSERT INTO "shp_refund_items" ("refund_id", "order_item_id", "quantity", "amount")
          VALUES (${refundId}, ${item.orderItemId}, ${item.quantity}, ${item.amount})
        `
        // The quantity cap is re-asserted in the UPDATE itself, so even if the
        // reservation were somehow bypassed the counter can't run past what was
        // bought. Under the reservation this always matches one row.
        const moved = await tx.$executeRaw`
          UPDATE "shp_order_items" SET "refunded_qty" = "refunded_qty" + ${item.quantity}
          WHERE "id" = ${item.orderItemId} AND "refunded_qty" + ${item.quantity} <= "quantity"
        `
        // Units the cap turned away were not refunded, so they hand back no
        // allocation slot and no stock either.
        if (moved === 0) continue
        bumped.push({ orderItemId: item.orderItemId, quantity: item.quantity })
        // Refunding a pre-order unit hands its allocation slot back, otherwise a
        // refunded pre-order eats the cap forever. Mirrors decrementPreOrderCount
        // in products.ts, inlined so it runs on the transaction client. The cancel
        // path releases only quantity - refunded_qty, so the two can't double-release.
        const preOrderLine = await tx.$queryRaw<{ product_id: string | null }[]>`
          SELECT "product_id" FROM "shp_order_items"
          WHERE "id" = ${item.orderItemId} AND "is_pre_order" = true AND "product_id" IS NOT NULL
        `
        const preOrderProductId = preOrderLine[0]?.product_id
        if (preOrderProductId) {
          await tx.$executeRaw`
            UPDATE "shp_products" SET
              "pre_order_count" = GREATEST("pre_order_count" - ${item.quantity}, 0),
              "is_pre_order" = CASE
                WHEN "is_pre_order" = false
                 AND "pre_order_max_quantity" IS NOT NULL
                 AND "pre_order_count" >= "pre_order_max_quantity"
                 AND GREATEST("pre_order_count" - ${item.quantity}, 0) < "pre_order_max_quantity"
                THEN true
                ELSE "is_pre_order"
              END,
              "updated_at" = CURRENT_TIMESTAMP
            WHERE "id" = ${preOrderProductId}
          `
        }
      }
      // Full vs partial from the freshly-updated quantities on the whole order.
      const allItems = await tx.$queryRaw<{ quantity: number; refunded_qty: number }[]>`
        SELECT "quantity", "refunded_qty" FROM "shp_order_items" WHERE "order_id" = ${input.orderId}
      `
      const fullyRefunded = allItems.every((i) => i.refunded_qty >= i.quantity)
      const refundState = fullyRefunded ? 'REFUNDED' : 'PARTIALLY_REFUNDED'
      // The payment follows the refund as well as the lifecycle does. It used to
      // stay PAID, so a fully refunded order still read "Paid" beside
      // "Refunded" and still turned up under the Paid filter (see
      // lib/payment-taken.ts for what reads it). Moved only from a paid state -
      // a chargeback's FAILED is a louder fact than a refund - and never back
      // down from REFUNDED, which a provider's own report may already have set.
      //
      // A part refund on an order already COMPLETED leaves it completed: the
      // payment now says "part refunded", and dropping the lifecycle back to
      // PARTIALLY_REFUNDED was what let the completion sweep complete it again,
      // thank-you email and all, after every refund.
      await tx.$executeRaw`
        UPDATE "shp_orders" SET
          "status" = CASE
            WHEN ${refundState} = 'PARTIALLY_REFUNDED' AND "status" = 'COMPLETED' THEN "status"
            ELSE ${refundState}
          END,
          "payment_status" = CASE
            WHEN "payment_status" IN ('PAID', 'PARTIALLY_REFUNDED') THEN ${refundState}
            ELSE "payment_status"
          END,
          "updated_at" = CURRENT_TIMESTAMP
        WHERE "id" = ${input.orderId}
      `
      return { claimed: true, bumped }
    },
    // Money has already moved by the time we get here, so be generous about
    // waiting for a connection and about finishing once we have one.
    { maxWait: 10000, timeout: 15000 }
  )
}

// Runs a refund as three steps rather than one long transaction: validate and
// reserve, call the provider with no transaction open, then settle. The earlier
// version wrapped the provider's HTTP call in the same transaction as the cap
// checks, which fixed the TOCTOU over-refund (two overlapping POSTs both read
// the old refunded_qty, both passed, both refunded) but pinned a pooled
// connection for the whole round trip to Stripe or PayPal.
//
// Serialisation now comes from two things working together: a transaction-scoped
// advisory lock keyed on the order id, which makes validation mutually
// exclusive, and the committed PENDING refund row, which keeps the order
// reserved for the duration of the provider call. A second refund arriving mid
// flight either loses the try-lock or sees the PENDING row, and is turned away
// with a 409 instead of validating against quantities that are about to change.
export async function processRefund(input: ProcessRefundInput): Promise<ProcessRefundResult> {
  const prepared = await prepareRefund(input)
  if (!prepared.ok) return prepared

  // No transaction, no held connection - just the reservation row standing in
  // for the lock. The refund row id is the provider idempotency key, so a
  // retried call can never refund twice.
  const result = await input.performRefund(prepared.refundId)

  // A throw from here on leaves the row PENDING on purpose: the provider's
  // outcome is genuinely unknown, and PENDING is the state that both blocks
  // immediate retries and counts against the caps once it goes stale.
  const settled = await settleRefund(input, prepared.refundId, result)

  // Stock follows the money back, for whatever never left the building (see
  // lib/refund-stock.ts). After the settle rather than inside it, so a stock
  // count that cannot be written never costs the refund its record.
  if (settled.claimed && result.success) await restockRefundedUnits(input.orderId, settled.bumped)

  return { ok: true, refundId: prepared.refundId, success: result.success, error: result.error }
}

// Resolve refunds left PENDING by a process that died between issuing the
// provider call and recording its outcome.
//
// The rule here is that we never guess about money. The provider is asked what
// actually happened; anything less than a confident answer leaves the row alone
// for the next run, and is reported rather than assumed. A provider that cannot
// answer at all (no getRefundStatus) has its rows reported too, never settled.
//
// Safe to run repeatedly and concurrently: settleRefund takes the order's
// advisory lock, and a row that has already left PENDING is skipped.
//
// The one exception to "ask the provider" is a method that moves no money of its
// own (refundMode 'manual' - bank transfer, cash). Its refund call does nothing
// but return success, so a row it left PENDING cannot have moved any money
// through the shop: the request died before the refund was written down, and
// that is certain, not a guess. Such a row is set aside as FAILED - nothing
// recorded, nothing claimed - and the owner is told to record it again if they
// did send the money. Left PENDING it could never be resolved by anything, and
// its amount counted against the order for ever, so the very refund the owner
// was trying to record could not be recorded again.
export type ReconcileOutcome = {
  refundId: string
  orderId: string
  /** The number the owner knows the order by, for anything they are told. */
  orderNumber: string
  resolved: 'COMPLETED' | 'FAILED' | 'STILL_UNKNOWN'
  /** A manual method's refund that never finished saving - see above. */
  setAside?: boolean
  reason?: string
}

export async function reconcileStaleRefunds(
  lookup: (providerId: string) => {
    refundMode?: 'provider' | 'manual'
    getRefundStatus?: (refundRowId: string, providerReference: string | null) => Promise<
      { status: 'succeeded'; providerRefundId: string | null } | { status: 'failed' } | { status: 'unknown' }
    >
  } | null,
  staleSeconds: number = PENDING_REFUND_STALE_SECONDS
): Promise<ReconcileOutcome[]> {
  const stale = await prisma.$queryRaw<
    {
      id: string
      order_id: string
      order_number: string
      intended_items: unknown
      payment_method: string | null
      payment_reference: string | null
      kind: string
      reason: string | null
      created_by: string
    }[]
  >`
    -- payment_method, not payment_provider: shp_orders has never had a column by
    -- that name, so this whole statement was a 42883-shaped undefined_column and the
    -- hourly reconcile cron 500'd on every single run. The value is the payment
    -- METHOD id (STRIPE, PAYPAL, ...), which is exactly what the registry keys on.
    SELECT r."id", r."order_id", r."intended_items", r."reason", r."created_by",
           o."order_number", o."payment_method", o."payment_reference", o."kind"
    FROM "shp_refunds" r
    JOIN "shp_orders" o ON o."id" = r."order_id"
    WHERE r."status" = 'PENDING'
      AND r."created_at" < CURRENT_TIMESTAMP - (${staleSeconds}::int4 * INTERVAL '1 second')
    ORDER BY r."created_at" ASC
  `

  const outcomes: ReconcileOutcome[] = []

  for (const row of stale) {
    const base = { refundId: row.id, orderId: row.order_id, orderNumber: row.order_number }

    const items = Array.isArray(row.intended_items)
      ? (row.intended_items as Array<{ orderItemId: string; quantity: number; amount: number }>)
      : null
    // A replacement's refund is recorded, never sent (lib/payments/order-refund-route.ts),
    // whatever method its parent was paid with.
    const provider: ReturnType<typeof lookup> = row.kind === 'REPLACEMENT'
      ? { refundMode: 'manual' }
      : row.payment_method ? lookup(row.payment_method) : null

    // A method that records refunds without moving money (see above): nothing
    // went back through the shop, so the row is set aside. Settled as FAILED
    // through the ordinary path, which records nothing else on a failure.
    if (provider?.refundMode === 'manual' && !provider.getRefundStatus) {
      const settled = await settleRefund(
        {
          orderId: row.order_id,
          reason: row.reason,
          createdBy: row.created_by,
          items: items ?? [],
          performRefund: async () => ({ success: false, providerRefundId: null }),
        },
        row.id,
        { success: false, providerRefundId: null, error: 'The refund was never finished recording' },
      )
      if (settled.claimed) {
        outcomes.push({
          ...base,
          resolved: 'FAILED',
          setAside: true,
          reason: 'Recorded by hand, but the request stopped before it was saved - nothing was refunded through the shop',
        })
      }
      continue
    }

    if (!items || items.length === 0) {
      // Predates the intended_items column, or was written without it. There is
      // no honest way to work out which units it covered, so it stays for a human.
      outcomes.push({ ...base, resolved: 'STILL_UNKNOWN', reason: 'No recorded breakdown for this refund' })
      continue
    }

    if (!provider?.getRefundStatus) {
      outcomes.push({
        ...base,
        resolved: 'STILL_UNKNOWN',
        reason: `${row.payment_method ?? 'This payment method'} cannot be asked about a refund automatically`,
      })
      continue
    }

    let status
    try {
      status = await provider.getRefundStatus(row.id, row.payment_reference)
    } catch {
      outcomes.push({ ...base, resolved: 'STILL_UNKNOWN', reason: 'Could not reach the payment provider' })
      continue
    }

    if (status.status === 'unknown') {
      outcomes.push({ ...base, resolved: 'STILL_UNKNOWN', reason: 'The payment provider could not confirm it either way' })
      continue
    }

    // Reuse the ordinary settle path so the refunded_qty bump, the refund-items
    // insert and the order-status recompute all stay in exactly one place.
    const succeeded = status.status === 'succeeded'
    const settled = await settleRefund(
      {
        orderId: row.order_id,
        reason: row.reason,
        createdBy: row.created_by,
        items,
        performRefund: async () => ({ success: false, providerRefundId: null }),
      },
      row.id,
      status.status === 'succeeded'
        ? { success: true, providerRefundId: status.providerRefundId }
        : { success: false, providerRefundId: null, error: 'Provider has no record of this refund' }
    )
    // Another run got there first and has already reported it.
    if (!settled.claimed) continue

    // Stock follows the money back, exactly as it does on the ordinary path.
    if (succeeded) await restockRefundedUnits(row.order_id, settled.bumped)

    outcomes.push({ ...base, resolved: succeeded ? 'COMPLETED' : 'FAILED' })
  }

  return outcomes
}
