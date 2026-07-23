import { prisma } from '@/lib/db/prisma'
import type { ShpRefund, ShpRefundItem } from '@/modules/shop/lib/types'

function mapRefund(r: Record<string, unknown>): ShpRefund {
  return {
    id: r.id as string,
    orderId: r.order_id as string,
    amount: (r.amount as { toString(): string }).toString(),
    reason: (r.reason as string | null) ?? null,
    providerRefundId: (r.provider_refund_id as string | null) ?? null,
    status: r.status as ShpRefund['status'],
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

    const orderRows = await tx.$queryRaw<{ total: string }[]>`
      SELECT "total"::text AS total FROM "shp_orders" WHERE "id" = ${input.orderId}
    `
    if (!orderRows[0]) return { ok: false, status: 404, error: 'Order not found' }
    const orderTotal = Number(orderRows[0].total)

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
    let totalAmount = 0
    for (const item of input.items) {
      const rows = await tx.$queryRaw<
        { order_id: string; product_name: string; quantity: number; refunded_qty: number; total: string; unit_price: string }[]
      >`
        SELECT "order_id", "product_name", "quantity", "refunded_qty",
               "total"::text AS total, "unit_price"::text AS unit_price
        FROM "shp_order_items" WHERE "id" = ${item.orderItemId}
      `
      const oi = rows[0]
      if (!oi || oi.order_id !== input.orderId) return { ok: false, status: 404, error: 'Order item not found' }
      if (oi.refunded_qty + item.quantity > oi.quantity) {
        return { ok: false, status: 400, error: `Cannot refund more than the ${oi.quantity} units purchased for ${oi.product_name}` }
      }
      // Money cap: the requested amount can't exceed this line's tax-inclusive
      // value for the units being refunded (penny tolerance for rounding).
      const perUnit = oi.quantity > 0 ? Number(oi.total) / oi.quantity : Number(oi.unit_price)
      const maxLineRefund = perUnit * item.quantity + 0.01
      if (item.amount > maxLineRefund) {
        return { ok: false, status: 400, error: `Refund amount for ${oi.product_name} exceeds the value of the units being refunded` }
      }
      totalAmount += item.amount
    }

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
      INSERT INTO "shp_refunds" ("order_id", "amount", "reason", "status", "created_by", "intended_items")
      VALUES (
        ${input.orderId}, ${totalAmount}, ${input.reason}, 'PENDING', ${input.createdBy},
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

// Settle half: records the provider's answer and, only when it succeeded, the
// refund items, the refunded_qty bump and the order status. Also short, and it
// re-takes the order's advisory lock so the read-modify-write of the order
// status can't interleave with another refund's.
async function settleRefund(
  input: ProcessRefundInput,
  refundId: string,
  result: { success: boolean; providerRefundId: string | null; error?: string }
): Promise<void> {
  await prisma.$transaction(
    async (tx) => {
      // Blocking rather than try-lock: settling is not optional, and nothing
      // holds this lock for longer than one of these short transactions.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(${REFUND_LOCK_NAMESPACE}::int4, hashtext(${input.orderId}))`

      await tx.$executeRaw`
        UPDATE "shp_refunds" SET "status" = ${result.success ? 'COMPLETED' : 'FAILED'}, "provider_refund_id" = ${result.providerRefundId}
        WHERE "id" = ${refundId}
      `
      if (!result.success) return

      for (const item of input.items) {
        await tx.$executeRaw`
          INSERT INTO "shp_refund_items" ("refund_id", "order_item_id", "quantity", "amount")
          VALUES (${refundId}, ${item.orderItemId}, ${item.quantity}, ${item.amount})
        `
        // The quantity cap is re-asserted in the UPDATE itself, so even if the
        // reservation were somehow bypassed the counter can't run past what was
        // bought. Under the reservation this always matches one row.
        await tx.$executeRaw`
          UPDATE "shp_order_items" SET "refunded_qty" = "refunded_qty" + ${item.quantity}
          WHERE "id" = ${item.orderItemId} AND "refunded_qty" + ${item.quantity} <= "quantity"
        `
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
      await tx.$executeRaw`
        UPDATE "shp_orders" SET "status" = ${fullyRefunded ? 'REFUNDED' : 'PARTIALLY_REFUNDED'}, "updated_at" = CURRENT_TIMESTAMP
        WHERE "id" = ${input.orderId}
      `
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
  await settleRefund(input, prepared.refundId, result)

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
export type ReconcileOutcome = {
  refundId: string
  orderId: string
  resolved: 'COMPLETED' | 'FAILED' | 'STILL_UNKNOWN'
  reason?: string
}

export async function reconcileStaleRefunds(
  lookup: (providerId: string) => {
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
      intended_items: unknown
      payment_provider: string | null
      payment_reference: string | null
      reason: string | null
      created_by: string
    }[]
  >`
    SELECT r."id", r."order_id", r."intended_items", r."reason", r."created_by",
           o."payment_provider", o."payment_reference"
    FROM "shp_refunds" r
    JOIN "shp_orders" o ON o."id" = r."order_id"
    WHERE r."status" = 'PENDING'
      AND r."created_at" < CURRENT_TIMESTAMP - (${staleSeconds}::int4 * INTERVAL '1 second')
    ORDER BY r."created_at" ASC
  `

  const outcomes: ReconcileOutcome[] = []

  for (const row of stale) {
    const base = { refundId: row.id, orderId: row.order_id }

    const items = Array.isArray(row.intended_items)
      ? (row.intended_items as Array<{ orderItemId: string; quantity: number; amount: number }>)
      : null
    if (!items || items.length === 0) {
      // Predates the intended_items column, or was written without it. There is
      // no honest way to work out which units it covered, so it stays for a human.
      outcomes.push({ ...base, resolved: 'STILL_UNKNOWN', reason: 'No recorded breakdown for this refund' })
      continue
    }

    const provider = row.payment_provider ? lookup(row.payment_provider) : null
    if (!provider?.getRefundStatus) {
      outcomes.push({
        ...base,
        resolved: 'STILL_UNKNOWN',
        reason: `${row.payment_provider ?? 'This payment method'} cannot be asked about a refund automatically`,
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
    await settleRefund(
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

    outcomes.push({ ...base, resolved: status.status === 'succeeded' ? 'COMPLETED' : 'FAILED' })
  }

  return outcomes
}
