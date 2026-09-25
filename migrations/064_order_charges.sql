-- ---------------------------------------------------------------------------
-- 064 - An extra charge raised on an order after it was placed.
--
-- The worked example is a failed delivery: the customer was out, and the
-- courier bills the shop for a second attempt. The shop raises that fee on the
-- order, the order goes on hold, and the customer is emailed. From their own
-- order page they either pay it (and the order moves again), or cancel instead
-- and have what they paid refunded less the fee - which is what the attempt
-- that already happened cost the shop.
--
-- Nothing here is specific to deliveries. `reason` is whatever the owner calls
-- it, and the same shape covers any one-off extra the customer has agreed to.
--
--   status
--       PENDING - owed. At most one per order (the partial unique index below),
--                 so "the charge on this order" always means one thing.
--       PAID    - settled, online from the order page or recorded by staff as
--                 paid some other way.
--       KEPT    - the customer cancelled instead; the fee was held back out of
--                 their refund. `refund_id` is that refund.
--       WAIVED  - staff let it go.
--
--   hold_order / held_from_status
--       Whether raising it put the order ON_HOLD, and what the order was before
--       it did. Settling the charge puts the order back where it was, but only
--       if it is still on hold - an owner who has moved it on by hand since has
--       made a decision the charge must not overrule.
--
--   net_amount / tax_rate / tax_amount / total
--       The fee as the owner typed it, the tax rate applied (a percentage), and
--       the result. `total` is what the customer pays and what comes off a
--       refund. Stored rather than recalculated, so a later rate change cannot
--       alter what somebody was asked for.
--
-- Idempotent, and the same table sits in 001_initial.sql, so a fresh install
-- and an existing one land in the same place.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "shp_order_charges" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "order_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "note" TEXT,
    "net_amount" NUMERIC(10,2) NOT NULL,
    "tax_rate" NUMERIC(6,3) NOT NULL DEFAULT 0,
    "tax_amount" NUMERIC(10,2) NOT NULL DEFAULT 0,
    "total" NUMERIC(10,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "hold_order" BOOLEAN NOT NULL DEFAULT true,
    "held_from_status" TEXT,
    "payment_method" TEXT,
    "payment_reference" TEXT,
    "paid_at" TIMESTAMP(3),
    "refund_id" TEXT,
    "resolved_at" TIMESTAMP(3),
    "resolved_by" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shp_order_charges_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "shp_order_charges_order_id_fkey"
        FOREIGN KEY ("order_id") REFERENCES "shp_orders"("id") ON DELETE CASCADE,
    CONSTRAINT "shp_order_charges_status_check" CHECK ("status" IN ('PENDING', 'PAID', 'KEPT', 'WAIVED')),
    CONSTRAINT "shp_order_charges_total_check" CHECK ("total" > 0 AND "net_amount" > 0 AND "tax_amount" >= 0)
);

CREATE INDEX IF NOT EXISTS "shp_order_charges_order_id_idx" ON "shp_order_charges" ("order_id");
CREATE UNIQUE INDEX IF NOT EXISTS "shp_order_charges_one_pending_key"
    ON "shp_order_charges" ("order_id") WHERE "status" = 'PENDING';
