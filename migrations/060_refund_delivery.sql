-- ---------------------------------------------------------------------------
-- 060 - Refunding the delivery charge.
--
-- Every refund used to be made of order lines and nothing else, so the money a
-- customer paid to have an order delivered could never be handed back through
-- the shop at all: a cancelled order refunded its goods and kept the delivery,
-- and the only way to return it was outside the system, with no credit note
-- and the books still holding the charge. UK distance selling expects the
-- standard delivery back when a whole order is cancelled.
--
-- The delivery part of a refund, tax and all, in the same money as "amount"
-- (which it is included in). Zero on every refund before this, which is what
-- they were.
--
-- Idempotent: safe on an install that already has the column.
-- ---------------------------------------------------------------------------

ALTER TABLE "shp_refunds" ADD COLUMN IF NOT EXISTS "shipping_amount" NUMERIC(10,2) NOT NULL DEFAULT 0;
