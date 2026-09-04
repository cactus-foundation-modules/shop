-- Which invoice already took a refund off its face.
--
-- A refund is dealt with in exactly one of two ways, and never in both. Refunded
-- after the invoice went out: a credit note undoes that part of the sale.
-- Refunded BEFORE the order was ever invoiced - a line went out of stock while
-- it was being picked, the money went straight back - there is nothing to
-- credit, and the invoice is simply raised without it.
--
-- Which of the two happened cannot be worked out afterwards from dates alone. A
-- refund can be sitting PENDING at the moment the invoice is raised and settle a
-- few seconds later: it is older than the invoice and yet was not taken off it,
-- and it needs a credit note like any other. So the fact is recorded here at the
-- moment the invoice is built, and everything else reads it rather than guessing.
--
-- Cleared when the invoice that netted them is voided: the document that
-- absorbed those refunds no longer exists, so they are back to being undealt-with
-- and the next invoice takes them off again.
ALTER TABLE "shp_refunds" ADD COLUMN IF NOT EXISTS "netted_off_invoice_id" TEXT;

CREATE INDEX IF NOT EXISTS "shp_refunds_netted_off_invoice_id_idx"
  ON "shp_refunds" ("netted_off_invoice_id");
