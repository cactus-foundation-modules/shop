-- How many times somebody has failed to prove they are the person an order is
-- going to, and until when they may stop trying.
--
-- A guest with no account opens their own order by typing the delivery postcode
-- (see lib/order-lookup.ts). That makes the postcode the entire lock, and the
-- other half of the pair is no secret at all: order numbers are a prefix and a
-- sequence, and the number is printed on every email the shop sends. So the
-- postcode has to be defended, and a UK postcode is not a long enough secret to
-- defend itself against a machine allowed to guess without limit.
--
-- The IP rate limiter already in the module (lib/rate-limit.ts) is not enough on
-- its own here. It is per-instance and resets on a cold start, which makes it a
-- speed bump for a serverless site rather than a wall, and it is keyed on an
-- address the guesser chooses. This is keyed on the ORDER, so a thousand
-- machines guessing one order's postcode share one budget between them.
--
-- Its own table rather than columns on shp_orders, because it is worthless data
-- with a hot write pattern: every row here is about somebody who failed, most
-- orders will never have one, and it must not widen the row every order screen,
-- report and export in the shop already reads.
CREATE TABLE IF NOT EXISTS "shp_order_access_attempts" (
    -- One row per order, so the primary key is the order. ON DELETE CASCADE:
    -- a deleted order has nothing left to guess at.
    "order_id" TEXT NOT NULL,
    "failed_count" INTEGER NOT NULL DEFAULT 0,
    -- Set once the count crosses the limit, and the only thing the check reads.
    -- Nullable: a row with failures but no lock is somebody who mistyped twice.
    "locked_until" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shp_order_access_attempts_pkey" PRIMARY KEY ("order_id"),
    CONSTRAINT "shp_order_access_attempts_order_id_fkey"
        FOREIGN KEY ("order_id") REFERENCES "shp_orders"("id") ON DELETE CASCADE
);

-- Belt and braces, as 015_order_requests.sql does: if a half-made table survives
-- an interrupted run the columns still arrive rather than the next release
-- failing on a table that exists but is the wrong shape.
ALTER TABLE "shp_order_access_attempts" ADD COLUMN IF NOT EXISTS "failed_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "shp_order_access_attempts" ADD COLUMN IF NOT EXISTS "locked_until" TIMESTAMP(3);
ALTER TABLE "shp_order_access_attempts" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- What the tidy-up sweep reads: rows whose lock has expired and which nobody has
-- come back to. Nothing depends on the sweep for correctness - an old row simply
-- says "0 failures, no lock" once its window has passed - but the table should
-- not keep a line for every mistyped postcode since the shop opened.
CREATE INDEX IF NOT EXISTS "shp_order_access_attempts_updated_at_idx"
    ON "shp_order_access_attempts" ("updated_at");
