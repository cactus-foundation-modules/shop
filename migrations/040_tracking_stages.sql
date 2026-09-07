-- Where a courier's own tracking says the parcel has got to.
--
-- The shop reads the courier's tracking page on a schedule and keeps the answer
-- here, rather than fetching it while a customer waits: their page then costs
-- nothing extra to render, keeps working when the courier's site is down, and
-- never sends the customer - or their IP address - anywhere near a page that
-- carries the shop's trade account details.
--
--   tracking_stage       the stage's own words, exactly as the courier wrote
--                        them ("Assigned to Crew"). Stored raw, and NOT
--                        translated on the way in: what a stage means is a
--                        setting the owner can correct in a minute, and a value
--                        rewritten at write time can never be re-read when they
--                        change their mind.
--   tracking_stage_at    when the stage last CHANGED, so "nothing has moved for
--                        two days" is answerable.
--   tracking_checked_at  when it was last looked at, changed or not. Drives the
--                        polling order and shows whether the feed has gone
--                        quiet.
--   delivered_at         when the courier said it arrived. Separate from the
--                        order's own status on purpose: one parcel arriving
--                        does not finish an order that has another still out.
--
-- Idempotent, and mirrored in 001_initial.sql for fresh installs.

ALTER TABLE "shp_shipments" ADD COLUMN IF NOT EXISTS "tracking_stage" TEXT;
ALTER TABLE "shp_shipments" ADD COLUMN IF NOT EXISTS "tracking_stage_at" TIMESTAMP(3);
ALTER TABLE "shp_shipments" ADD COLUMN IF NOT EXISTS "tracking_checked_at" TIMESTAMP(3);
ALTER TABLE "shp_shipments" ADD COLUMN IF NOT EXISTS "delivered_at" TIMESTAMP(3);

-- The cron's own query: parcels with a tracking link that have not been
-- delivered yet, oldest check first. Partial, because the rows it will never
-- look at are most of the table on any shop that has been running a while.
CREATE INDEX IF NOT EXISTS "shp_shipments_tracking_poll_idx"
    ON "shp_shipments" ("tracking_checked_at")
    WHERE "tracking_url" IS NOT NULL AND "delivered_at" IS NULL;
