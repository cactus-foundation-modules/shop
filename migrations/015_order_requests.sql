-- Customer-initiated cancel and return requests.
--
-- Until now a shopper who wanted to call an order off had exactly one option:
-- find the shop's email address and hope. The order screens could cancel and
-- refund, but only an owner could start it, and nothing recorded that the
-- customer had ever asked. That gap is what this table closes - the asking is
-- now a record in its own right, with a decision hung off it.
--
-- It is a REQUEST, not the act. Approving one is what reaches for the existing
-- machinery (applyOrderStatusChange for a cancel, processRefund for a return);
-- nothing here moves money or stock by itself. Keeping the two apart means a
-- request that is declined, or approved and then fails at the payment provider,
-- still leaves an honest trail of what was asked and what was decided.
--
-- Shape follows shp_refunds / shp_shipments: a header row per event and a line
-- per order item with the quantity it covers, so a partial return is describable
-- without a second table design. A cancel covers the whole order and therefore
-- writes no item rows at all - "everything" is not a list.
--
-- Everything here is idempotent so it is harmless that 001_initial.sql creates
-- the same tables for fresh installs.

CREATE TABLE IF NOT EXISTS "shp_order_requests" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "order_id" TEXT NOT NULL,
    -- Who asked. Nullable for the same reason shp_orders.member_id is: an order
    -- can be a guest's, and guest orders are claimed by an account later.
    "member_id" TEXT,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    -- A code from a fixed list (see lib/order-requests.ts), not free text: it is
    -- what the owner filters and reports on. The shopper's own words go in
    -- customer_note, where nothing depends on their wording.
    "reason" TEXT NOT NULL,
    "customer_note" TEXT,
    -- Shown to the customer with the decision, so it is written to be read by
    -- them rather than kept as a private note (shp_order_notes is for those).
    "admin_note" TEXT,
    "decided_at" TIMESTAMP(3),
    -- Core User id of whoever decided. Plain TEXT, no FK: module tables do not
    -- reach into core's schema, exactly as shp_refunds.created_by does not.
    "decided_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shp_order_requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "shp_order_requests_type_check" CHECK ("type" IN ('CANCEL', 'RETURN')),
    CONSTRAINT "shp_order_requests_status_check" CHECK ("status" IN ('PENDING', 'APPROVED', 'DECLINED', 'WITHDRAWN')),
    CONSTRAINT "shp_order_requests_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "shp_orders"("id") ON DELETE CASCADE
);

-- Belt and braces, as 008_shipments.sql does: if a half-made table survives an
-- interrupted run the columns still arrive rather than the next release failing.
ALTER TABLE "shp_order_requests" ADD COLUMN IF NOT EXISTS "member_id" TEXT;
ALTER TABLE "shp_order_requests" ADD COLUMN IF NOT EXISTS "customer_note" TEXT;
ALTER TABLE "shp_order_requests" ADD COLUMN IF NOT EXISTS "admin_note" TEXT;
ALTER TABLE "shp_order_requests" ADD COLUMN IF NOT EXISTS "decided_at" TIMESTAMP(3);
ALTER TABLE "shp_order_requests" ADD COLUMN IF NOT EXISTS "decided_by" TEXT;
ALTER TABLE "shp_order_requests" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "shp_order_requests" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS "shp_order_requests_order_id_idx" ON "shp_order_requests" ("order_id");
CREATE INDEX IF NOT EXISTS "shp_order_requests_member_id_idx" ON "shp_order_requests" ("member_id");
-- The admin queue's only query: pending first, oldest first.
CREATE INDEX IF NOT EXISTS "shp_order_requests_status_created_at_idx" ON "shp_order_requests" ("status", "created_at");

-- One open request per order. A second while the first is still pending is a
-- double-tapped button or an impatient shopper, not a second intention, and two
-- of them racing to approval would refund the same lines twice.
CREATE UNIQUE INDEX IF NOT EXISTS "shp_order_requests_one_open_idx"
    ON "shp_order_requests" ("order_id") WHERE "status" = 'PENDING';

CREATE TABLE IF NOT EXISTS "shp_order_request_items" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "request_id" TEXT NOT NULL,
    "order_item_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "shp_order_request_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "shp_order_request_items_quantity_check" CHECK ("quantity" > 0),
    CONSTRAINT "shp_order_request_items_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "shp_order_requests"("id") ON DELETE CASCADE,
    -- RESTRICT, as shp_shipment_items and shp_refund_items do: an order line
    -- somebody has asked to send back is not something to lose quietly.
    CONSTRAINT "shp_order_request_items_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "shp_order_items"("id") ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS "shp_order_request_items_request_id_idx" ON "shp_order_request_items" ("request_id");
-- One row per line per request: quantity says how many, so a second row for the
-- same line is a bug, and summing duplicates would over-refund.
CREATE UNIQUE INDEX IF NOT EXISTS "shp_order_request_items_request_item_idx"
    ON "shp_order_request_items" ("request_id", "order_item_id");
