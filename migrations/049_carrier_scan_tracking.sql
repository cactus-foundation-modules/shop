-- What a carrier's own systems know about a parcel, beyond which stage it has
-- reached.
--
-- The Multidrop reader that came first had one thing to report: a stage name off
-- a seven-step timeline. A carrier proper reports rather more, and throwing it
-- away would mean showing a customer less than the courier shows them - which is
-- the opposite of the point.
--
--   tracking_short_code  The code out of a courier's own "follow my parcel"
--                        link, where they issue one. DPD's is the tail of
--                        www.dpd.co.uk/d/<code>, and it is a SESSION KEY: it
--                        unlocks the delivery window, the stop number and the
--                        driver, none of which their anonymous feed carries.
--                        Recorded per parcel because that is what it belongs to,
--                        and nullable because most parcels will never have one.
--                        It is NOT derivable from the parcel number - their
--                        session endpoint refuses everything else - so a parcel
--                        without one is not broken, merely quieter.
--
--   tracking_events      The carrier's scan history, as THEY worded it, oldest
--                        last. jsonb rather than a table of its own: it is read
--                        whole, written whole, never joined and never queried by
--                        one row, and a delivery has a dozen of them at most. An
--                        array of {at, location, text}, where `at` is an ISO
--                        string in the carrier's own reckoning - see the reader
--                        for why their timestamps are parsed by hand.
--
--   delivery_window_*    The window the CARRIER committed to, as instants. The
--                        delivery_date/slot columns above are what the shop was
--                        told at booking, in the customer's local wording; these
--                        are what the van is actually working to today, and the
--                        two disagree often enough that overwriting one with the
--                        other would lose the booking.
--
--   stop_number          Which drop on the round this parcel is, and how far the
--   stops_completed      driver has got. Together they are the honest version of
--   stops_total          "you are next": 34th of 98 with 9 done is a fact, and
--                        the sentence built from it cannot drift from it.
--   minutes_to_stop      The carrier's own estimate, in minutes, kept as they
--                        gave it rather than turned into a clock time here - the
--                        moment it is read is what makes it a clock time.
--
--   driver_name          The driver's first name, as the carrier prints it.
--                        Theirs to spell, and never assembled from anything.
--
-- Idempotent, and mirrored in 001_initial.sql for fresh installs.

ALTER TABLE "shp_shipments" ADD COLUMN IF NOT EXISTS "tracking_short_code" TEXT;
ALTER TABLE "shp_shipments" ADD COLUMN IF NOT EXISTS "tracking_events" JSONB;
ALTER TABLE "shp_shipments" ADD COLUMN IF NOT EXISTS "delivery_window_from" TIMESTAMP(3);
ALTER TABLE "shp_shipments" ADD COLUMN IF NOT EXISTS "delivery_window_to" TIMESTAMP(3);
ALTER TABLE "shp_shipments" ADD COLUMN IF NOT EXISTS "stop_number" INTEGER;
ALTER TABLE "shp_shipments" ADD COLUMN IF NOT EXISTS "stops_completed" INTEGER;
ALTER TABLE "shp_shipments" ADD COLUMN IF NOT EXISTS "stops_total" INTEGER;
ALTER TABLE "shp_shipments" ADD COLUMN IF NOT EXISTS "minutes_to_stop" INTEGER;
ALTER TABLE "shp_shipments" ADD COLUMN IF NOT EXISTS "driver_name" TEXT;

-- The poller's own query gains a reason to look at a parcel that has no
-- tracking_url: a short code is a feed in its own right. Without this, a parcel
-- recorded with only the follow-my-parcel link would never be polled at all.
CREATE INDEX IF NOT EXISTS "shp_shipments_tracking_poll_code_idx"
    ON "shp_shipments" ("tracking_checked_at")
    WHERE "tracking_short_code" IS NOT NULL AND "delivered_at" IS NULL;
