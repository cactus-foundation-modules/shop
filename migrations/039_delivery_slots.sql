-- The delivery day, and the time window on it.
--
-- A courier who books a delivery in tells the shop two things at two different
-- moments: the DAY, usually when the parcel is picked up, and the four-hour
-- WINDOW on that day, usually the evening before. The customer wants both, and
-- wants the first one long before the second exists - so they are separate
-- columns, both nullable, and neither waits for the other.
--
-- Stored as TEXT, deliberately, not DATE and TIME:
--
--   A delivery day is a day in the customer's world, not an instant. Read back
--   through Prisma a DATE column arrives as a JS Date at UTC midnight, and
--   formatting that in a site timezone west of UTC prints the day before -
--   which is the one mistake this feature cannot afford, since the whole point
--   of the line is to name the right day. A 'YYYY-MM-DD' string has no
--   timezone to get wrong, and the same goes for 'HH:MM'.
--
--   The CHECK constraints are what a text column costs. Without them this is a
--   free-text field that renders as whatever somebody typed.
--
-- courier_id points at a courier configured in the shop's settings (see
-- deliveryCouriers in lib/config.ts) and is null for a carrier typed in by
-- hand. The existing `carrier` column stays the display name in both cases, so
-- every reader that already prints it carries on unchanged.
--
-- slot_notified_at is what stops the "your delivery slot is confirmed" email
-- going out twice when an owner edits the same parcel again to correct a typo.
--
-- Idempotent, and mirrored in 001_initial.sql for fresh installs.

ALTER TABLE "shp_shipments" ADD COLUMN IF NOT EXISTS "courier_id" TEXT;
ALTER TABLE "shp_shipments" ADD COLUMN IF NOT EXISTS "delivery_date" TEXT;
ALTER TABLE "shp_shipments" ADD COLUMN IF NOT EXISTS "delivery_slot_start" TEXT;
ALTER TABLE "shp_shipments" ADD COLUMN IF NOT EXISTS "delivery_slot_end" TEXT;
ALTER TABLE "shp_shipments" ADD COLUMN IF NOT EXISTS "slot_notified_at" TIMESTAMP(3);

-- Added separately from the columns so a re-run finds them already there and
-- does nothing, rather than failing on a duplicate constraint name.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'shp_shipments_delivery_date_check'
  ) THEN
    ALTER TABLE "shp_shipments" ADD CONSTRAINT "shp_shipments_delivery_date_check"
      CHECK ("delivery_date" IS NULL OR "delivery_date" ~ '^\d{4}-\d{2}-\d{2}$');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'shp_shipments_delivery_slot_check'
  ) THEN
    ALTER TABLE "shp_shipments" ADD CONSTRAINT "shp_shipments_delivery_slot_check"
      CHECK (
        ("delivery_slot_start" IS NULL OR "delivery_slot_start" ~ '^([01]\d|2[0-3]):[0-5]\d$')
        AND ("delivery_slot_end" IS NULL OR "delivery_slot_end" ~ '^([01]\d|2[0-3]):[0-5]\d$')
      );
  END IF;
END $$;
