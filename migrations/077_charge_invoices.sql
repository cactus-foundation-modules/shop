-- ---------------------------------------------------------------------------
-- 077 - A paid redelivery fee gets a VAT invoice of its own.
--
-- A fee settled after the order's invoice had gone out was "not on the order's
-- invoice - record it in your books separately", and one settled before was
-- folded into the order's invoice as an extra line. Neither is what a customer
-- paying a fee weeks after their order expects: a separate invoice, for the fee,
-- dated the day they paid it.
--
-- order_charge_id names the charge an invoice is for. NULL on every order
-- invoice, which is every row before this file. Deliberately no foreign key:
-- a charge only ever goes when its order does, and the order's own cascade
-- takes the invoice with it.
--
-- The one-live-invoice-per-order rule now counts order invoices only, and a
-- charge gets the same rule of its own: one live invoice per charge.
--
-- Idempotent.
-- ---------------------------------------------------------------------------

ALTER TABLE "shp_invoices" ADD COLUMN IF NOT EXISTS "order_charge_id" TEXT;

DROP INDEX IF EXISTS "shp_invoices_order_live_key";
CREATE UNIQUE INDEX IF NOT EXISTS "shp_invoices_order_live_key"
    ON "shp_invoices" ("order_id")
    WHERE "status" = 'ISSUED' AND "superseded_at" IS NULL AND "order_charge_id" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "shp_invoices_charge_live_key"
    ON "shp_invoices" ("order_charge_id")
    WHERE "status" = 'ISSUED' AND "superseded_at" IS NULL AND "order_charge_id" IS NOT NULL;
