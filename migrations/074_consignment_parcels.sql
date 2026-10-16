-- ---------------------------------------------------------------------------
-- 074 - One delivery, several boxes.
--
-- A courier can carry one recorded parcel as several boxes, each with its own
-- parcel number, and deliver them on different days. Order DW000231: four
-- boxes under one DPD reference, three delivered together and the fourth held
-- at a hub - while the shop followed one box, saw it delivered, and finished
-- the order off.
--
--   shp_shipments.consignment_number
--       The courier's reference for the whole delivery ('5217099684' on DPD).
--
--   shp_shipments.consignment_parcels
--       Every box in it, in the courier's order, each with its own stage, its
--       own delivered time and proof of delivery, and the follow-my-parcel code
--       that unlocks it where staff have pasted one in. Shape and reading in
--       lib/consignment-parcels.ts. NULL until the courier has been asked; a
--       delivery of one box holds a list of one, so it is not asked again.
--
-- A parcel with more than one box counts as delivered only once every box is.
--
-- Idempotent, and the same columns sit in 001_initial.sql for a fresh install.
-- ---------------------------------------------------------------------------

ALTER TABLE "shp_shipments" ADD COLUMN IF NOT EXISTS "consignment_number" TEXT;
ALTER TABLE "shp_shipments" ADD COLUMN IF NOT EXISTS "consignment_parcels" JSONB;
