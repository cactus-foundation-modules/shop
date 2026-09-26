-- ---------------------------------------------------------------------------
-- 066 - Order charges become redelivery charges: a cancellation charge on
-- top, and a fee that can be changed after it was raised.
--
-- 064 raised a general "extra charge". In practice it is only ever the one
-- thing - the courier could not deliver, and bills the shop for trying again -
-- so it now is that one thing, and grows what that case needs:
--
--   cancellation_net / cancellation_tax / cancellation_total
--       A further charge for calling the order off, kept back ON TOP of the
--       redelivery fee if the customer cancels rather than pays. The redelivery
--       fee is owed either way - the failed attempt has already happened - and
--       this is what cancelling costs besides. Taxed at the charge's own
--       `tax_rate`. Zero where the shop does not charge one, which is every row
--       written before this file.
--
--   cancellation_note
--       Why there is a cancellation charge, in the shop's own words, shown to
--       the customer beside it ("this is what our supplier charges us to deal
--       with a cancelled order; we pass it on at cost"). The reason is the
--       shop's, so the words are too. Null for none.
--
--   status REPLACED
--       The fee was changed after it was raised. Changing the amount writes a
--       NEW pending row and retires the old one as REPLACED, rather than
--       editing the figure in place: a card payment started against the old
--       amount carries the old row's id, and on landing it now finds that row
--       no longer pending and says so on the order's timeline, instead of being
--       quietly weighed against a figure it was never for.
--
-- Idempotent, and the same shape sits in 001_initial.sql, so a fresh install
-- and an existing one land in the same place. Rows already on an existing
-- install are left exactly as they were: no cancellation charge, same fee,
-- nobody emailed.
-- ---------------------------------------------------------------------------

ALTER TABLE "shp_order_charges" ADD COLUMN IF NOT EXISTS "cancellation_net" NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "shp_order_charges" ADD COLUMN IF NOT EXISTS "cancellation_tax" NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "shp_order_charges" ADD COLUMN IF NOT EXISTS "cancellation_total" NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "shp_order_charges" ADD COLUMN IF NOT EXISTS "cancellation_note" TEXT;

ALTER TABLE "shp_order_charges" DROP CONSTRAINT IF EXISTS "shp_order_charges_status_check";
ALTER TABLE "shp_order_charges" ADD CONSTRAINT "shp_order_charges_status_check"
    CHECK ("status" IN ('PENDING', 'PAID', 'KEPT', 'WAIVED', 'REPLACED'));

ALTER TABLE "shp_order_charges" DROP CONSTRAINT IF EXISTS "shp_order_charges_cancellation_check";
ALTER TABLE "shp_order_charges" ADD CONSTRAINT "shp_order_charges_cancellation_check"
    CHECK ("cancellation_net" >= 0 AND "cancellation_tax" >= 0 AND "cancellation_total" >= 0);
