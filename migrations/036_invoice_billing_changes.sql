-- Correcting who an invoice is made out to.
--
-- Everything here is idempotent so it is harmless that 001_initial.sql creates
-- the same objects for fresh installs.
--
-- Two different corrections, and the whole point of this file is that they are
-- not the same thing:
--
--  - THE ADDRESS MOVED. Same company, same VAT registration, same party being
--    billed - their accounts department is now on the third floor rather than
--    the second. Nothing about the supply changed, so nothing about the sale
--    changed, and reissuing paperwork over a postcode would burn an invoice
--    number to say the same thing twice. The address on the document is
--    corrected in place and what it used to say is kept in customer_amendments,
--    so the trail survives.
--
--  - THE COMPANY CHANGED. A different legal person is now being invoiced, and
--    that is a different supply on paper whatever it feels like on the phone.
--    HMRC's answer is not an edit: the invoice that went out is credited in
--    full and a fresh one is raised to the new name. Both documents stay
--    readable for ever - the customer's own accountant has very likely already
--    filed the first one.
--
-- The second of those is what superseded_at is for. The original stays ISSUED,
-- because it WAS issued and a credit note has undone it; VOID would say it was
-- withdrawn before anybody acted on it, which is a different story and would
-- have the books reverse the sale twice over. So "the live invoice for this
-- order" grows a second condition, and the partial unique index that stops two
-- of them existing has to grow the same one.

ALTER TABLE "shp_invoices" ADD COLUMN IF NOT EXISTS "customer_amendments" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "shp_invoices" ADD COLUMN IF NOT EXISTS "superseded_at" TIMESTAMP(3);
ALTER TABLE "shp_invoices" ADD COLUMN IF NOT EXISTS "superseded_by_invoice_id" TEXT;
ALTER TABLE "shp_invoices" ADD COLUMN IF NOT EXISTS "supersede_reason" TEXT;

-- Self-referential and ON DELETE SET NULL: the replacement's number is printed
-- on a document that has already gone out, so losing the row must never take
-- the paperwork's own reference with it.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'shp_invoices_superseded_by_fkey'
  ) THEN
    ALTER TABLE "shp_invoices"
      ADD CONSTRAINT "shp_invoices_superseded_by_fkey"
      FOREIGN KEY ("superseded_by_invoice_id") REFERENCES "shp_invoices"("id") ON DELETE SET NULL;
  END IF;
END $$;

-- One LIVE invoice per order. The old index counted a superseded one, which
-- would have made a replacement impossible to insert at all.
DROP INDEX IF EXISTS "shp_invoices_order_issued_key";
CREATE UNIQUE INDEX IF NOT EXISTS "shp_invoices_order_live_key"
    ON "shp_invoices" ("order_id") WHERE "status" = 'ISSUED' AND "superseded_at" IS NULL;
CREATE INDEX IF NOT EXISTS "shp_invoices_superseded_by_idx"
    ON "shp_invoices" ("superseded_by_invoice_id");
