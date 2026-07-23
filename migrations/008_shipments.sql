-- Shipments (partial dispatch).
--
-- An order used to be either shipped or not: the SHIPPED status was the whole
-- record of dispatch, which cannot describe "three of the five went out on
-- Tuesday". These two tables record dispatch the same way shp_refunds /
-- shp_refund_items record money - a header row per event, and a line per order
-- item with the quantity that moved.
--
-- Dispatched quantity is DERIVED by summing shp_shipment_items. There is
-- deliberately no denormalised dispatched_qty counter on shp_order_items: one
-- writer, one truth, and no counter to drift when a shipment is deleted.
--
-- The order status list is unchanged. "Fully dispatched" is a display state
-- computed from these rows (see lib/db/shipments.ts), not a new status value.
--
-- Everything here is idempotent so it is harmless that 001_initial.sql now
-- creates the same tables for fresh installs.

CREATE TABLE IF NOT EXISTS "shp_shipments" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "order_id" TEXT NOT NULL,
    -- When the parcel actually left, which is not always when it was recorded.
    "shipped_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tracking_number" TEXT,
    "carrier" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shp_shipments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "shp_shipments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "shp_orders"("id") ON DELETE CASCADE
);

-- Belt and braces: if a half-made table survives from an interrupted run, the
-- columns still arrive rather than the next release failing on a missing one.
ALTER TABLE "shp_shipments" ADD COLUMN IF NOT EXISTS "shipped_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "shp_shipments" ADD COLUMN IF NOT EXISTS "tracking_number" TEXT;
ALTER TABLE "shp_shipments" ADD COLUMN IF NOT EXISTS "carrier" TEXT;
ALTER TABLE "shp_shipments" ADD COLUMN IF NOT EXISTS "notes" TEXT;
ALTER TABLE "shp_shipments" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "shp_shipments" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS "shp_shipments_order_id_idx" ON "shp_shipments" ("order_id");

CREATE TABLE IF NOT EXISTS "shp_shipment_items" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "shipment_id" TEXT NOT NULL,
    "order_item_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "shp_shipment_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "shp_shipment_items_quantity_check" CHECK ("quantity" > 0),
    CONSTRAINT "shp_shipment_items_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "shp_shipments"("id") ON DELETE CASCADE,
    -- RESTRICT, exactly as shp_refund_items does: an order line that has been
    -- dispatched is not something to lose quietly.
    CONSTRAINT "shp_shipment_items_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "shp_order_items"("id") ON DELETE RESTRICT
);

-- The DEFAULT only exists so the NOT NULL can be added to a table that somehow
-- already has rows; it is dropped again so the column matches the definition in
-- 001_initial.sql exactly and every insert has to state a quantity.
ALTER TABLE "shp_shipment_items" ADD COLUMN IF NOT EXISTS "quantity" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "shp_shipment_items" ALTER COLUMN "quantity" DROP DEFAULT;

CREATE INDEX IF NOT EXISTS "shp_shipment_items_shipment_id_idx" ON "shp_shipment_items" ("shipment_id");
-- The dispatched-per-line total is the hot read on this table, and it groups by
-- order_item_id, so it wants an index of its own.
CREATE INDEX IF NOT EXISTS "shp_shipment_items_order_item_id_idx" ON "shp_shipment_items" ("order_item_id");

-- The email that goes with a part-dispatch.
--
-- STATUS_SHIPPED says the whole order is on its way and only knows
-- orderNumber / customerName / shopName, so sending it for three of five items
-- would be a straight untruth to the customer. This template lists what went
-- and what is still owed instead.
--
-- Seeded here as well as in 001_initial.sql because that seed only ever reaches
-- FRESH installs: existing shops get the row from this file on their next
-- deploy. ON CONFLICT DO NOTHING on both sides, so whichever runs first wins and
-- an owner's edits are never overwritten by the other.
--
-- The {{#if flag}} blocks are lib/email.ts's one conditional: the flag renders
-- only when the variable is the literal string 'true'. hasOutstanding and
-- isFinalPart are exact opposites, which is how the same template also covers
-- the shipment that finishes an order off.
INSERT INTO "shp_email_templates" ("trigger", "subject", "body_html") VALUES
    ('PARTIAL_SHIPPED', '{{#if hasOutstanding}}Part of your order {{orderNumber}} is on its way{{/if}}{{#if isFinalPart}}The last part of your order {{orderNumber}} is on its way{{/if}}', '<p>Hi {{customerName}},</p>{{#if hasOutstanding}}<p>Good news - part of your order <strong>{{orderNumber}}</strong> is on its way. The rest of it is still with us, and we will email you again as soon as it is dispatched.</p>{{/if}}{{#if isFinalPart}}<p>Good news - the last part of your order <strong>{{orderNumber}}</strong> is on its way. That is everything from this order now dispatched.</p>{{/if}}<p><strong>In this parcel:</strong></p><p>{{dispatchedItems}}</p>{{#if hasOutstanding}}<p><strong>Still to come:</strong></p><p>{{outstandingItems}}</p>{{/if}}{{#if hasCarrier}}<p>Sent with {{carrier}}.</p>{{/if}}{{#if hasTracking}}<p>Tracking number: {{trackingNumber}}</p>{{/if}}<p>Parcels sent separately can arrive a day or two apart, so please do not worry if they turn up at different times.</p><p>Thanks for shopping with {{shopName}}.</p>')
ON CONFLICT ("trigger") DO NOTHING;
