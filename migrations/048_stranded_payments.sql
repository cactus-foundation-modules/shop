-- ---------------------------------------------------------------------------
-- 048 - Payments that were taken and produced no order.
--
-- The methods that hand a shopper over to a bank or a hosted card page draft
-- their order and create it at settlement, in materialiseDraftOrder (025). That
-- is the right shape: it stops the orders list filling with orders nobody paid
-- for. But it puts the order's creation on the far side of the money, so if the
-- create fails the shop has been paid for something it has no record of, and
-- absolutely nothing says so. The draft looks like every other abandoned
-- checkout, and the shopper sees a crash.
--
-- That is not a hypothetical failure mode. On 2026-09-09 a live shop took £193.20
-- through Square against an order that could not be written, because the checkout
-- INSERTed a column the database did not have (see shop 047). The only detector
-- in the entire system was the customer telephoning to ask where their order was.
--
-- So: when materialiseDraftOrder throws, it writes down what it was trying to do
-- before re-throwing, and the orders screen shows it. One row per draft, updated
-- rather than duplicated when the same settlement is retried - a provider webhook
-- will keep retrying, and twenty identical rows would bury the signal it exists
-- to raise. The row is deleted the moment that draft does become an order, so a
-- transient failure that the next webhook fixes clears itself and nobody is
-- dragged out of bed for it.
--
-- Deliberately not a foreign key to shp_checkout_drafts: a draft swept by the
-- 30-day sweeper must not take the evidence of a stranded payment with it. This
-- row is the record that something went wrong, and it outlives its cause.
--
-- The money detail is snapshotted rather than joined for the same reason.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "shp_stranded_payments" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    -- The draft (and therefore the order-to-be) this was trying to create. One
    -- row per draft: a retry updates, never appends.
    "draft_id" TEXT NOT NULL,
    "order_number" TEXT NOT NULL,
    "payment_method" TEXT NOT NULL,
    "customer_email" TEXT,
    "customer_name" TEXT,
    "total" NUMERIC(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'GBP',
    -- The failure itself, in whatever words the database or the code used. Kept
    -- verbatim: a paraphrase of the one error that explains the incident is a
    -- poor trade for a tidier column.
    "error" TEXT NOT NULL,
    -- How many settlement attempts have hit this. A provider retrying its webhook
    -- for an hour is a different picture from one lonely failure, and the owner
    -- deserves to be able to tell them apart.
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shp_stranded_payments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "shp_stranded_payments_draft_id_key"
    ON "shp_stranded_payments" ("draft_id");

CREATE INDEX IF NOT EXISTS "shp_stranded_payments_last_seen_at_idx"
    ON "shp_stranded_payments" ("last_seen_at");
