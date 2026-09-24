-- The shopper's answer to shop's well-known marketing-consent checkout key
-- (checkout-state.ts), snapshotted at order time. Null means nothing asked this
-- checkout - no checkout extra installed, or shown but never touched - not the
-- same as an explicit no.
ALTER TABLE "shp_orders" ADD COLUMN IF NOT EXISTS "marketing_consent" BOOLEAN;
