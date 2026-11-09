-- ---------------------------------------------------------------------------
-- 078 - Follow-my-parcel links DPD would not check at the time.
--
-- Each box of a DPD delivery has its own follow-my-parcel link, and only DPD
-- can say which box a link opens - by way of a session check they ration
-- (five an hour per address, answered with a 429 after that). Order DW000278
-- could not be dispatched at all while DPD were saying no: the save refused
-- every link it could not place.
--
--   shp_shipments.pending_parcel_links
--       The codes of links saved but not yet put on a box, in the order they
--       were pasted. The tracking check asks DPD about each on its rounds and
--       moves it onto its box (lib/tracking/dpd-consignment.ts). NULL or empty
--       when there is nothing waiting.
--
-- Idempotent, and the same column sits in 001_initial.sql for a fresh install.
-- ---------------------------------------------------------------------------

ALTER TABLE "shp_shipments" ADD COLUMN IF NOT EXISTS "pending_parcel_links" TEXT[];
