-- Where the van is, and who signed for it.
--
-- Two halves of the same delivery, kept on the parcel because that is what a
-- courier tracks. Neither is worth a table of its own: there is exactly one van
-- and one signature per parcel, and a join to find out where a chair is would be
-- a join on every order page.
--
-- THE VAN
--
--   tracking_client_id   ids the courier's own page carries, needed to ask their
--   tracking_route_id    map endpoint where the crew has got to. The route id is
--                        the day's ROUND, not the parcel, so it changes daily and
--                        is re-read rather than remembered.
--   crew_line            the sentence their page prints above the map ("The crew
--                        have 1 more drop to make before reaching you"), stored
--                        in their words. Their sentence and their drop numbers
--                        disagreed on the first delivery this was built against,
--                        so the sentence is what is shown and the numbers are not.
--   drops_away           how many drops are left before ours, read out of that
--                        sentence. Null when it cannot be read, which is never
--                        treated as "next".
--   vehicle_lat/lng      last known position of the van, as TEXT and in the
--                        courier's own digits. Text because these are copied,
--                        compared and handed to a map, never summed - and a float
--                        column would round somebody's front door for no gain.
--   vehicle_heading      degrees, for pointing the van icon.
--   vehicle_fixed_at     when the VAN reported that position.
--   destination_lat/lng  where the courier believes we are, off the same page.
--                        Their pin, not our address: it is what their van is
--                        driving to, so a map drawn from anything else would
--                        quietly disagree with the crew.
--   vehicle_polled_at    when WE last successfully read one. The two are not the
--                        same clock and the difference is the whole point: a fix
--                        five minutes old with a poll ten seconds old is a van
--                        sitting still, and the customer is told the first.
--
-- THE SIGNATURE
--
--   signed_by            the name the courier printed, theirs to spell.
--   signed_at            when they said it was signed, which is not when we
--                        noticed - delivered_at is when we noticed.
--   signature_url/key    OUR copy, taken once and kept. The courier's own image
--                        sits on a third party's public bucket under a filename
--                        of their choosing, and a proof of delivery that
--                        evaporates when they tidy up is not proof of anything.
--
-- Idempotent, and mirrored in 001_initial.sql for fresh installs.

ALTER TABLE "shp_shipments" ADD COLUMN IF NOT EXISTS "tracking_client_id" TEXT;
ALTER TABLE "shp_shipments" ADD COLUMN IF NOT EXISTS "tracking_route_id" TEXT;
ALTER TABLE "shp_shipments" ADD COLUMN IF NOT EXISTS "crew_line" TEXT;
ALTER TABLE "shp_shipments" ADD COLUMN IF NOT EXISTS "drops_away" INTEGER;
ALTER TABLE "shp_shipments" ADD COLUMN IF NOT EXISTS "vehicle_lat" TEXT;
ALTER TABLE "shp_shipments" ADD COLUMN IF NOT EXISTS "vehicle_lng" TEXT;
ALTER TABLE "shp_shipments" ADD COLUMN IF NOT EXISTS "vehicle_heading" INTEGER;
ALTER TABLE "shp_shipments" ADD COLUMN IF NOT EXISTS "vehicle_fixed_at" TIMESTAMP(3);
ALTER TABLE "shp_shipments" ADD COLUMN IF NOT EXISTS "vehicle_polled_at" TIMESTAMP(3);
ALTER TABLE "shp_shipments" ADD COLUMN IF NOT EXISTS "destination_lat" TEXT;
ALTER TABLE "shp_shipments" ADD COLUMN IF NOT EXISTS "destination_lng" TEXT;
ALTER TABLE "shp_shipments" ADD COLUMN IF NOT EXISTS "signed_by" TEXT;
ALTER TABLE "shp_shipments" ADD COLUMN IF NOT EXISTS "signed_at" TIMESTAMP(3);
ALTER TABLE "shp_shipments" ADD COLUMN IF NOT EXISTS "signature_url" TEXT;
ALTER TABLE "shp_shipments" ADD COLUMN IF NOT EXISTS "signature_key" TEXT;
