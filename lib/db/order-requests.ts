import { prisma } from '@/lib/db/prisma'
import { Prisma } from '@prisma/client'
import { ORDER_LOCK_NAMESPACE } from '@/modules/shop/lib/db/shipments'
import { MAX_DAMAGE_PHOTOS, isValidReason } from '@/modules/shop/lib/order-requests'
import type {
  ShpOrderRequest,
  ShpOrderRequestItem,
  ShpOrderRequestPhoto,
  ShpOrderRequestStatus,
  ShpOrderRequestType,
  ShpOrderRequestWithItems,
} from '@/modules/shop/lib/types'

// Storage for customer cancel and return requests. This layer records what was
// asked and what was decided, and NOTHING ELSE - no status change, no refund,
// no stock. Approving a request is a separate step in lib/order-request-actions.ts
// which calls the machinery that already owns those things.
//
// Keeping the two apart is what makes a failed refund survivable: the request
// stays APPROVED with a refund that can be retried, rather than the whole
// decision being lost because a payment provider had a bad minute.

const ORDER_BUSY_ERROR = 'Something else is updating this order right now. Give it a moment and try again.'

function mapRequest(r: Record<string, unknown>): ShpOrderRequest {
  return {
    id: r.id as string,
    orderId: r.order_id as string,
    memberId: (r.member_id as string | null) ?? null,
    type: r.type as ShpOrderRequestType,
    status: r.status as ShpOrderRequestStatus,
    reason: r.reason as string,
    customerNote: (r.customer_note as string | null) ?? null,
    adminNote: (r.admin_note as string | null) ?? null,
    // Stringified rather than coerced, as every other money column in this
    // module is. Absent on an install that has not taken migration 045 yet,
    // which reads the same as "no charge was recorded" - the right answer for
    // every request decided before the field existed.
    returnCharge: r.return_charge != null ? (r.return_charge as { toString(): string }).toString() : null,
    decidedAt: (r.decided_at as Date | null) ?? null,
    decidedBy: (r.decided_by as string | null) ?? null,
    createdAt: r.created_at as Date,
    updatedAt: r.updated_at as Date,
  }
}

function mapRequestItem(r: Record<string, unknown>): ShpOrderRequestItem {
  return {
    id: r.id as string,
    requestId: r.request_id as string,
    orderItemId: r.order_item_id as string,
    quantity: r.quantity as number,
  }
}

function mapRequestPhoto(r: Record<string, unknown>): ShpOrderRequestPhoto {
  return {
    id: r.id as string,
    requestId: r.request_id as string,
    mediaId: (r.media_id as string | null) ?? null,
    url: r.url as string,
    createdAt: r.created_at as Date,
  }
}

// Lines and photographs for a batch of requests in two queries rather than two
// per request: the account page and the admin queue both hand whole lists
// through here.
async function attachItems(requests: ShpOrderRequest[]): Promise<ShpOrderRequestWithItems[]> {
  if (requests.length === 0) return []
  const ids = Prisma.join(requests.map((r) => r.id))
  const [rows, photoRows] = await Promise.all([
    prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT * FROM "shp_order_request_items" WHERE "request_id" IN (${ids})
    `,
    prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT * FROM "shp_order_request_photos" WHERE "request_id" IN (${ids})
      ORDER BY "created_at" ASC
    `,
  ])
  const byRequest = new Map<string, ShpOrderRequestItem[]>()
  for (const row of rows) {
    const item = mapRequestItem(row)
    const list = byRequest.get(item.requestId)
    if (list) list.push(item)
    else byRequest.set(item.requestId, [item])
  }
  const photosByRequest = new Map<string, ShpOrderRequestPhoto[]>()
  for (const row of photoRows) {
    const photo = mapRequestPhoto(row)
    const list = photosByRequest.get(photo.requestId)
    if (list) list.push(photo)
    else photosByRequest.set(photo.requestId, [photo])
  }
  return requests.map((request) => ({
    ...request,
    items: byRequest.get(request.id) ?? [],
    photos: photosByRequest.get(request.id) ?? [],
  }))
}

export async function listRequestsForOrder(orderId: string): Promise<ShpOrderRequestWithItems[]> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT * FROM "shp_order_requests" WHERE "order_id" = ${orderId} ORDER BY "created_at" DESC
  `
  return attachItems(rows.map(mapRequest))
}

/** The open cancel or return, if there is one. A damage report is not one of
 *  those and is asked for separately - see canReportDamage. */
export async function getOpenRequestForOrder(orderId: string): Promise<ShpOrderRequestWithItems | null> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT * FROM "shp_order_requests"
    WHERE "order_id" = ${orderId} AND "status" = 'PENDING' AND "type" <> 'DAMAGE'
    LIMIT 1
  `
  if (!rows[0]) return null
  return (await attachItems([mapRequest(rows[0])]))[0] ?? null
}

export async function getRequestById(id: string): Promise<ShpOrderRequestWithItems | null> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT * FROM "shp_order_requests" WHERE "id" = ${id} LIMIT 1
  `
  if (!rows[0]) return null
  return (await attachItems([mapRequest(rows[0])]))[0] ?? null
}

/** Open requests belonging to a member, for the account nav's count pill. */
export async function countOpenRequestsForMember(memberId: string): Promise<number> {
  const rows = await prisma.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(*)::bigint AS count FROM "shp_order_requests"
    WHERE "member_id" = ${memberId} AND "status" = 'PENDING'
  `
  return Number(rows[0]?.count ?? 0)
}

// Per-line position, read inside the transaction. The dispatched and refunded
// totals are aggregated in subqueries BEFORE the join, for the same reason
// lib/db/shipments.ts spells out: joining the line tables straight onto
// shp_order_items fans each line out once per shipment or refund, and the
// arithmetic afterwards then counts the same units several times.
const linePositionQuery = (orderId: string) => Prisma.sql`
  SELECT
    oi."id"            AS order_item_id,
    oi."product_name"  AS product_name,
    oi."quantity"      AS quantity,
    oi."refunded_qty"  AS refunded_qty,
    oi."returnable"    AS returnable,
    COALESCE(d."dispatched", 0)::int AS dispatched_qty,
    COALESCE(r."requested", 0)::int  AS requested_qty
  FROM "shp_order_items" oi
  LEFT JOIN (
    SELECT si."order_item_id", SUM(si."quantity") AS dispatched
    FROM "shp_shipment_items" si
    GROUP BY si."order_item_id"
  ) d ON d."order_item_id" = oi."id"
  LEFT JOIN (
    SELECT ri."order_item_id", SUM(ri."quantity") AS requested
    FROM "shp_order_request_items" ri
    JOIN "shp_order_requests" req ON req."id" = ri."request_id"
    -- Damage reports excluded on purpose: reporting a broken leg does not spend
    -- the unit, and counting it here would refuse the return of the very item
    -- the customer has just told us about.
    WHERE req."status" IN ('PENDING', 'APPROVED') AND req."type" <> 'DAMAGE'
    GROUP BY ri."order_item_id"
  ) r ON r."order_item_id" = oi."id"
  WHERE oi."order_id" = ${orderId}
`

type LinePosition = {
  order_item_id: string
  product_name: string
  quantity: number
  refunded_qty: number
  /** Snapshotted when the order was placed - see migrations/043_returnable.sql. */
  returnable: boolean
  dispatched_qty: number
  requested_qty: number
}

export type CreateOrderRequestInput = {
  orderId: string
  memberId: string | null
  type: ShpOrderRequestType
  reason: string
  customerNote?: string | null
  /** Ignored for CANCEL, which covers the whole order. */
  items?: Array<{ orderItemId: string; quantity: number }>
  /**
   * Photographs, on a damage report. Already uploaded and already saved to the
   * media library by the time they get here - this layer records what they are
   * and what they belong to, nothing more.
   */
  photos?: Array<{ mediaId: string | null; url: string }>
}

export type CreateOrderRequestResult =
  | { ok: false; status: number; error: string }
  | { ok: true; request: ShpOrderRequestWithItems }

/** Records a request under the order's advisory lock, after checking the lines
 * it covers are actually still there to be covered. Rejections come back as
 * { ok:false, status, error } with a message fit to show a customer, matching
 * createShipment and processRefund. */
export async function createOrderRequest(input: CreateOrderRequestInput): Promise<CreateOrderRequestResult> {
  if (!isValidReason(input.type, input.reason)) {
    return { ok: false, status: 400, error: 'Pick a reason from the list.' }
  }

  const note = input.customerNote?.trim() || null
  if (note && note.length > 2000) {
    return { ok: false, status: 400, error: 'That note is too long - keep it under 2000 characters.' }
  }

  // Two lines for the same order item in one request would each validate
  // against the same starting figure and together sail past the cap, so fold
  // them together before anything is checked - as createShipment does.
  const merged = new Map<string, number>()
  for (const item of input.items ?? []) {
    if (item.quantity <= 0) continue
    if (!Number.isInteger(item.quantity)) {
      return { ok: false, status: 400, error: 'Quantities have to be whole numbers.' }
    }
    merged.set(item.orderItemId, (merged.get(item.orderItemId) ?? 0) + item.quantity)
  }

  if (input.type === 'RETURN' && merged.size === 0) {
    return { ok: false, status: 400, error: 'Choose at least one item to send back.' }
  }
  if (input.type === 'DAMAGE' && merged.size === 0) {
    return { ok: false, status: 400, error: 'Tell us which item is damaged.' }
  }

  // Photographs are not required - "parts are missing" is a report of something
  // that is not there to photograph, and a report with no picture still beats an
  // email nobody has attached to the order. The form asks hard for them anyway.
  const photos = (input.photos ?? []).filter((photo) => photo.url.trim().length > 0)
  if (photos.length > MAX_DAMAGE_PHOTOS) {
    return { ok: false, status: 400, error: `That is more than ${MAX_DAMAGE_PHOTOS} photographs - pick the ones that show it best.` }
  }

  try {
    return await prisma.$transaction(async (tx): Promise<CreateOrderRequestResult> => {
      const locked = await tx.$queryRaw<[{ locked: boolean }]>`
        SELECT pg_try_advisory_xact_lock(${ORDER_LOCK_NAMESPACE}::int4, hashtext(${input.orderId})) AS locked
      `
      if (!locked[0]?.locked) return { ok: false, status: 409, error: ORDER_BUSY_ERROR }

      const orderRows = await tx.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "shp_orders" WHERE "id" = ${input.orderId}
      `
      if (!orderRows[0]) return { ok: false, status: 404, error: 'Order not found' }

      // One open request of this KIND per order, checked here rather than left
      // to the partial unique indexes alone. Two reasons, and the second is the
      // one that bites:
      //
      //   - under the advisory lock taken above this check IS authoritative, so
      //     two requests racing on the same order are settled in order rather
      //     than one of them landing on a constraint,
      //   - a raw-query constraint violation reaches us through Prisma as
      //     "Raw query failed. Code: 23505. Message: Key (order_id)=(...)
      //     already exists." - with the INDEX NAME stripped out. The catch below
      //     was matching on that name, so a clash surfaced as a 500 rather than
      //     as the sentence a customer can act on.
      //
      // Damage is counted separately, which is the whole point of the split: a
      // second parcel arriving broken must not wait for a return to be decided.
      const kind = input.type === 'DAMAGE'
        ? Prisma.sql`"type" = 'DAMAGE'`
        : Prisma.sql`"type" <> 'DAMAGE'`
      const openRows = await tx.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "shp_order_requests"
        WHERE "order_id" = ${input.orderId} AND "status" = 'PENDING' AND ${kind}
        LIMIT 1
      `
      if (openRows[0]) {
        return {
          ok: false,
          status: 409,
          error: input.type === 'DAMAGE'
            ? 'You have already reported damage on this order. We will come back to you on it.'
            : 'You already have a request open on this order.',
        }
      }

      if (input.type !== 'CANCEL') {
        const rows = await tx.$queryRaw<LinePosition[]>(linePositionQuery(input.orderId))
        const byId = new Map(rows.map((r) => [r.order_item_id, r]))

        for (const [orderItemId, quantity] of merged) {
          const row = byId.get(orderItemId)
          if (!row) return { ok: false, status: 404, error: 'Order item not found' }

          // Damage is measured against what actually arrived and nothing else.
          // Not against the returns policy - the goods a shop will not take back
          // are exactly the goods whose owner most needs to be able to say one
          // turned up broken - and not against refunds or open returns either,
          // because reporting damage does not spend the unit.
          if (input.type === 'DAMAGE') {
            if (row.dispatched_qty === 0) {
              return {
                ok: false,
                status: 400,
                error: `${row.product_name} has not been dispatched yet, so there is nothing to report.`,
              }
            }
            if (quantity > row.dispatched_qty) {
              return {
                ok: false,
                status: 400,
                error: `Only ${row.dispatched_qty} of ${row.product_name} has arrived so far.`,
              }
            }
            continue
          }

          // Checked before the arithmetic, because "you can send back at most 0
          // of the Bespoke Desk" is a worse answer than the true one. The
          // storefront does not offer these lines at all; a hand-rolled POST
          // gets the reason rather than a sum.
          if (!row.returnable) {
            return {
              ok: false,
              status: 400,
              error: `${row.product_name} is not something we can take back.`,
            }
          }

          // Only what actually arrived can go back, less anything already
          // refunded and anything a live request has already spoken for.
          const returnable = Math.max(row.dispatched_qty - row.refunded_qty - row.requested_qty, 0)
          if (quantity > returnable) {
            if (returnable === 0) {
              return {
                ok: false,
                status: 400,
                error: row.dispatched_qty === 0
                  ? `${row.product_name} has not been dispatched yet, so there is nothing to send back.`
                  : `There is nothing left to return for ${row.product_name}.`,
              }
            }
            return {
              ok: false,
              status: 400,
              error: `You can send back at most ${returnable} of ${row.product_name}.`,
            }
          }
        }
      }

      const created = await tx.$queryRaw<[Record<string, unknown>]>`
        INSERT INTO "shp_order_requests" ("order_id", "member_id", "type", "reason", "customer_note")
        VALUES (${input.orderId}, ${input.memberId}, ${input.type}, ${input.reason}, ${note})
        RETURNING *
      `
      const request = mapRequest(created[0])

      const items: ShpOrderRequestItem[] = []
      // A CANCEL writes none: it covers the whole order by definition.
      if (input.type !== 'CANCEL') {
        for (const [orderItemId, quantity] of merged) {
          const itemRows = await tx.$queryRaw<[Record<string, unknown>]>`
            INSERT INTO "shp_order_request_items" ("request_id", "order_item_id", "quantity")
            VALUES (${request.id}, ${orderItemId}, ${quantity})
            RETURNING *
          `
          items.push(mapRequestItem(itemRows[0]))
        }
      }

      const savedPhotos: ShpOrderRequestPhoto[] = []
      if (input.type === 'DAMAGE') {
        for (const photo of photos) {
          const photoRows = await tx.$queryRaw<[Record<string, unknown>]>`
            INSERT INTO "shp_order_request_photos" ("request_id", "media_id", "url")
            VALUES (${request.id}, ${photo.mediaId ?? null}, ${photo.url})
            RETURNING *
          `
          savedPhotos.push(mapRequestPhoto(photoRows[0]))
        }
      }

      return { ok: true, request: { ...request, items, photos: savedPhotos } }
    })
  } catch (error) {
    // Backstop for the check above, which the advisory lock should already have
    // made unreachable. Matched on the Postgres error CODE and the column, not
    // on the index name: Prisma hands a raw-query violation over as
    // "Raw query failed. Code: 23505. Message: Key (order_id)=(...) already
    // exists." and the constraint's name is nowhere in it, so the name match
    // that was here before never fired and a clash came out as a 500.
    const message = error instanceof Error ? error.message : String(error)
    const clash = message.includes('shp_order_requests_one_open')
      || (message.includes('23505') && message.includes('(order_id)'))
    if (clash) {
      return {
        ok: false,
        status: 409,
        error: input.type === 'DAMAGE'
          ? 'You have already reported damage on this order. We will come back to you on it.'
          : 'You already have a request open on this order.',
      }
    }
    throw error
  }
}

export type DecideRequestInput = {
  requestId: string
  status: Extract<ShpOrderRequestStatus, 'APPROVED' | 'DECLINED'>
  adminNote?: string | null
  /**
   * What the shop is keeping back for collecting the goods. Recorded on the
   * decision whether or not the money moves in the same breath: a shop that
   * approves today and refunds when the van comes back still has to remember
   * what it said it would keep. Null (or a decline) records nothing.
   */
  returnCharge?: number | null
  /** Core User id of whoever decided. */
  decidedBy: string
}

/** Marks a decision. Only ever moves a PENDING request, so two admins pressing
 * approve at the same moment cannot both run the refund behind it - the second
 * update matches no rows and the caller stops. */
export async function decideRequest(input: DecideRequestInput): Promise<ShpOrderRequestWithItems | null> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    UPDATE "shp_order_requests"
    SET "status" = ${input.status},
        "admin_note" = ${input.adminNote?.trim() || null},
        -- Only a return can carry one: there is nothing to collect on a
        -- cancellation, and a shop does not charge a customer for coming to
        -- look at something it broke. Settled in the statement rather than by
        -- the caller so no route can get it wrong.
        "return_charge" = CASE
          WHEN "type" = 'RETURN'
          THEN ${input.status === 'APPROVED' ? input.returnCharge ?? null : null}::numeric
          ELSE NULL
        END,
        "decided_at" = CURRENT_TIMESTAMP,
        "decided_by" = ${input.decidedBy},
        "updated_at" = CURRENT_TIMESTAMP
    WHERE "id" = ${input.requestId} AND "status" = 'PENDING'
    RETURNING *
  `
  if (!rows[0]) return null
  return (await attachItems([mapRequest(rows[0])]))[0] ?? null
}

/**
 * A customer changing their mind about changing their mind.
 *
 * Scoped to the ORDER rather than to the member, and the caller has already
 * established that this visitor may see that order (lib/order-route-access.ts).
 * Two reasons it is the stronger test, not the weaker one:
 *
 *   - a guest has no member id at all, so scoping on one would leave them able
 *     to raise a request and never able to take it back,
 *   - member_id here is who ASKED, recorded at the time. A guest order claimed
 *     by an account later carries a request row whose member_id is still null,
 *     which left the owner of that order unable to withdraw their own request.
 */
export async function withdrawRequest(requestId: string, orderId: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    UPDATE "shp_order_requests"
    SET "status" = 'WITHDRAWN', "updated_at" = CURRENT_TIMESTAMP
    WHERE "id" = ${requestId} AND "order_id" = ${orderId} AND "status" = 'PENDING'
    RETURNING "id"
  `
  return rows.length > 0
}

export type AdminRequestRow = ShpOrderRequestWithItems & {
  orderNumber: string
  customerName: string
  customerEmail: string
  orderTotal: string
  /**
   * Whether anything this request covers was sold on the understanding that
   * taking it back would be a favour rather than a right. The whole reason the
   * queue exists is that somebody has to decide, and this is the flag that says
   * the decision is genuinely open - without it an owner has to open the order
   * and check the lines to find out whether they are allowed to say no.
   */
  discretionary: boolean
}

export type ListRequestsFilter = {
  status?: ShpOrderRequestStatus | 'ALL'
  type?: ShpOrderRequestType | 'ALL'
  limit?: number
  offset?: number
}

/** The admin queue. Pending first and oldest first within that, because the
 * one waiting longest is the one somebody is most cross about. */
export async function listRequestsForAdmin(
  filter: ListRequestsFilter = {},
): Promise<{ requests: AdminRequestRow[]; total: number; pendingCount: number }> {
  const limit = Math.min(Math.max(filter.limit ?? 50, 1), 200)
  const offset = Math.max(filter.offset ?? 0, 0)

  const conditions: Prisma.Sql[] = []
  if (filter.status && filter.status !== 'ALL') conditions.push(Prisma.sql`req."status" = ${filter.status}`)
  if (filter.type && filter.type !== 'ALL') conditions.push(Prisma.sql`req."type" = ${filter.type}`)
  const where = conditions.length > 0
    ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`
    : Prisma.empty

  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT req.*, o."order_number", o."customer_name", o."customer_email", o."total",
      -- The lines this request covers: the ones it names, or - on a cancel,
      -- which names none because it covers the lot - every line on the order.
      EXISTS (
        SELECT 1 FROM "shp_order_items" oi
        WHERE oi."order_id" = req."order_id"
          AND oi."returns_discretionary" = true
          AND (
            req."type" = 'CANCEL'
            OR EXISTS (
              SELECT 1 FROM "shp_order_request_items" ri
              WHERE ri."request_id" = req."id" AND ri."order_item_id" = oi."id"
            )
          )
      ) AS discretionary
    FROM "shp_order_requests" req
    JOIN "shp_orders" o ON o."id" = req."order_id"
    ${where}
    ORDER BY (req."status" = 'PENDING') DESC, req."created_at" ASC
    LIMIT ${limit} OFFSET ${offset}
  `

  const [totals] = await prisma.$queryRaw<[{ total: bigint; pending: bigint }]>`
    SELECT
      COUNT(*)::bigint AS total,
      COUNT(*) FILTER (WHERE "status" = 'PENDING')::bigint AS pending
    FROM "shp_order_requests"
  `

  const base = await attachItems(rows.map(mapRequest))
  const requests: AdminRequestRow[] = base.map((request, i) => ({
    ...request,
    orderNumber: rows[i]!.order_number as string,
    customerName: rows[i]!.customer_name as string,
    customerEmail: rows[i]!.customer_email as string,
    orderTotal: String(rows[i]!.total),
    discretionary: rows[i]!.discretionary === true,
  }))

  return { requests, total: Number(totals?.total ?? 0), pendingCount: Number(totals?.pending ?? 0) }
}
