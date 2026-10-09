-- ---------------------------------------------------------------------------
-- 070 - A delivery that is running late, said so by the shop.
--
-- The courier's tracking can say a delivery failed. It cannot say "the van is
-- behind and may not make it to you today", or "the warehouse has not got it
-- yet, so Thursday is off" - the shop hears those on the phone, and until now
-- the customer only heard them if somebody wrote an email by hand.
--
--   shp_shipments.delivery_delay
--       What the customer has been told, and what their order page says:
--         'today'      running late, still trying today; if it cannot be
--                      today, the shop will be in touch with a new day.
--         'rebooking'  delayed, and the new day is not known yet.
--       NULL is no open delay - never reported, or a new day has since been
--       given, which closes it.
--
--   shp_shipments.delivery_delayed_at
--       When the delay was last reported. Kept once the delay is closed, so the
--       order screen can still say a parcel was delayed and re-dated.
--
--   shp_shipments.delivery_delayed_from
--       The day that was missed, 'YYYY-MM-DD' like delivery_date (see 039 for
--       why text). Two jobs: a 'today' delay only reads as today on that day -
--       the morning after, its promise is "we will be in touch", and the page
--       says that instead - and a window the courier's tracking still reports
--       for that day or earlier is the booking that fell through, so it is not
--       shown as the delivery.
--
--   shp_shipments.delivery_delay_note
--       An optional sentence of explanation, shown to the customer in the email
--       and on the order page. Typed by staff.
--
-- Idempotent, and the same columns sit in 001_initial.sql for a fresh install.
-- ---------------------------------------------------------------------------

ALTER TABLE "shp_shipments" ADD COLUMN IF NOT EXISTS "delivery_delay" TEXT;
ALTER TABLE "shp_shipments" ADD COLUMN IF NOT EXISTS "delivery_delayed_at" TIMESTAMP(3);
ALTER TABLE "shp_shipments" ADD COLUMN IF NOT EXISTS "delivery_delayed_from" TEXT;
ALTER TABLE "shp_shipments" ADD COLUMN IF NOT EXISTS "delivery_delay_note" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'shp_shipments_delivery_delay_check'
  ) THEN
    ALTER TABLE "shp_shipments" ADD CONSTRAINT "shp_shipments_delivery_delay_check"
      CHECK (
        ("delivery_delay" IS NULL OR "delivery_delay" IN ('today', 'rebooking'))
        AND ("delivery_delayed_from" IS NULL OR "delivery_delayed_from" ~ '^\d{4}-\d{2}-\d{2}$')
      );
  END IF;
END $$;
