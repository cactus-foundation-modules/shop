-- ---------------------------------------------------------------------------
-- 080 - The courier's photograph of the delivery, beside the signature.
--
-- Multidrop's "Your Delivery is complete" card carries the customer's
-- signature AND a photograph of the goods where they were left. Only the
-- signature was kept (signature_url/_key, migration 041), so on order DW000250
-- the shop had the squiggle and not the picture - and the picture is the one
-- that settles "it was never delivered".
--
--   shp_shipments.delivery_photo_url / delivery_photo_key
--       OUR copy of the courier's photograph, taken once and kept, filed in
--       Orders / <order number> / Proof of delivery exactly as the signature
--       is. NULL until one is taken, and for every courier that takes none.
--
-- Separate from signature_url rather than sharing it: a delivery can have
-- both, and each is written once under its own NULL guard.
--
-- Idempotent, and the same columns sit in 001_initial.sql for a fresh install.
-- ---------------------------------------------------------------------------

ALTER TABLE "shp_shipments" ADD COLUMN IF NOT EXISTS "delivery_photo_url" TEXT;
ALTER TABLE "shp_shipments" ADD COLUMN IF NOT EXISTS "delivery_photo_key" TEXT;
