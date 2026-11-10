-- ---------------------------------------------------------------------------
-- 079 - The delivery day a courier's own tracking booked.
--
-- Multidrop's page names the day a delivery is booked for ("Date Scheduled -
-- 11 November 2026") a day or more before it gives any times. Order DW000250
-- showed no day at all while the courier's page had one, and the customer was
-- not told it.
--
--   shp_shipments.courier_day
--       'YYYY-MM-DD', the day the courier's tracking last booked. The tracking
--       check writes it onto delivery_date as well, and goes on following the
--       courier only while delivery_date still equals it: a day staff type in
--       differs from it, and so stands (lib/db/shipments.ts claimCourierDay).
--       NULL until a courier has named one.
--
-- Idempotent, and the same column sits in 001_initial.sql for a fresh install.
-- ---------------------------------------------------------------------------

ALTER TABLE "shp_shipments" ADD COLUMN IF NOT EXISTS "courier_day" TEXT;
