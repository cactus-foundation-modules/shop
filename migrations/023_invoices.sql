-- Invoices.
--
-- The shop could already print a receipt (app/public/shop/account/orders/[id]/
-- receipt), and that page says in its own comment why it is not called a VAT
-- invoice: the settings held no registration number and no trading address, so
-- naming it one would have been a claim the data could not back up. This table
-- is the other half of that sentence - a real invoice, issued once, numbered in
-- its own sequence, and frozen at the moment of issue.
--
-- Frozen is the point. Every figure, every address, the seller's own VAT number
-- and the wording underneath are SNAPSHOTS in JSONB, not joins. An invoice is a
-- statutory record of what was charged on a given day; re-deriving it from the
-- order six months later, after somebody has corrected a product name or moved
-- the business, would quietly rewrite history. The order stays the live thing,
-- the invoice stays the paperwork.
--
-- Numbering comes from a sequence rather than a count, for the same reason
-- shp_order_number_seq exists: two orders completing in the same second must
-- never be handed the same number, and HMRC expects invoice numbers to be
-- unique and sequential. NOTE for anyone touching backup/restore - a sequence is
-- invisible to information_schema.tables, so it has to be dumped deliberately
-- (see lib/backup/serialize.ts); missing it would restart this at 1 and the next
-- invoice would collide.
--
-- Everything here is idempotent so it is harmless that 001_initial.sql creates
-- the same table for fresh installs.

CREATE SEQUENCE IF NOT EXISTS "shp_invoice_number_seq" START 1;

CREATE TABLE IF NOT EXISTS "shp_invoices" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "order_id" TEXT NOT NULL,
    -- Snapshot of the order's own number. The FK above is there for the join,
    -- but the number is printed on the document, so it is copied rather than
    -- looked up: paperwork does not go and ask the order what it is called.
    "order_number" TEXT NOT NULL DEFAULT '',
    "invoice_number" TEXT NOT NULL,
    -- ISSUED or VOID. Invoices are never deleted and never edited: a wrong one
    -- is voided and a fresh one issued, so the numbering keeps its sequence and
    -- the trail of what was sent out survives.
    "status" TEXT NOT NULL DEFAULT 'ISSUED',
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- The tax point: the date the VAT belongs to, which is the date the goods
    -- were paid for where that is known and the issue date otherwise. Held as a
    -- DATE because that is what a VAT return works in.
    "tax_point_date" DATE NOT NULL,
    "due_date" DATE,

    "currency" TEXT NOT NULL,
    "currency_symbol" TEXT NOT NULL DEFAULT '',
    -- INCLUSIVE or EXCLUSIVE, copied from the order so the document can say
    -- whether the figures already carry the tax.
    "tax_mode" TEXT NOT NULL,
    "subtotal" NUMERIC(10,2) NOT NULL,
    "discount_amount" NUMERIC(10,2) NOT NULL DEFAULT 0,
    "shipping_amount" NUMERIC(10,2) NOT NULL DEFAULT 0,
    "tax_amount" NUMERIC(10,2) NOT NULL DEFAULT 0,
    "total" NUMERIC(10,2) NOT NULL,

    -- Snapshots (see the header). `seller` is who issued it - name, address,
    -- VAT and company numbers; `customer` is who it is for; `lines` is what was
    -- charged; `tax_breakdown` is net/tax/gross per rate, which is the part an
    -- accountant actually reads; `wording` is the headings and terms as they
    -- stood in settings on the day.
    "seller" JSONB NOT NULL DEFAULT '{}',
    "customer" JSONB NOT NULL DEFAULT '{}',
    "lines" JSONB NOT NULL DEFAULT '[]',
    "tax_breakdown" JSONB NOT NULL DEFAULT '[]',
    "wording" JSONB NOT NULL DEFAULT '{}',

    -- AUTO for one the shop issued off the back of a status change, MANUAL for
    -- one somebody pressed the button for.
    "issued_by" TEXT NOT NULL DEFAULT 'AUTO',
    -- Which change triggered it (PAID, SHIPPED, COMPLETED), for the audit trail.
    "issue_trigger" TEXT,
    "created_by_user_id" TEXT,

    -- What the bookkeeping sinks made of it (see lib/invoice-sinks.ts): one
    -- entry per registered sink, with whether it took the invoice and what it
    -- said if it did not. Recorded rather than logged and forgotten, because a
    -- sale that quietly failed to reach the books is exactly the sort of fault
    -- nobody notices until the VAT return is due.
    "sink_results" JSONB NOT NULL DEFAULT '[]',

    "voided_at" TIMESTAMP(3),
    "void_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shp_invoices_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "shp_invoices_invoice_number_key" UNIQUE ("invoice_number"),
    CONSTRAINT "shp_invoices_status_check" CHECK ("status" IN ('ISSUED', 'VOID')),
    CONSTRAINT "shp_invoices_issued_by_check" CHECK ("issued_by" IN ('AUTO', 'MANUAL')),
    CONSTRAINT "shp_invoices_order_id_fkey"
        FOREIGN KEY ("order_id") REFERENCES "shp_orders"("id") ON DELETE CASCADE
);

-- One live invoice per order, enforced in the database rather than by a read
-- followed by a write: two workers reacting to the same status change (the
-- order screen and the bulk bar, say) must not both issue one. Partial, so a
-- voided invoice leaves the order free to be invoiced again.
CREATE UNIQUE INDEX IF NOT EXISTS "shp_invoices_order_issued_key"
    ON "shp_invoices" ("order_id") WHERE "status" = 'ISSUED';
CREATE INDEX IF NOT EXISTS "shp_invoices_order_id_idx" ON "shp_invoices" ("order_id");
CREATE INDEX IF NOT EXISTS "shp_invoices_issued_at_idx" ON "shp_invoices" ("issued_at" DESC);
CREATE INDEX IF NOT EXISTS "shp_invoices_tax_point_idx" ON "shp_invoices" ("tax_point_date");
