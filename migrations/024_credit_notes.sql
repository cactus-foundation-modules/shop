-- Credit notes: the document that undoes an invoice, in whole or in part.
--
-- Everything here is idempotent so it is harmless that 001_initial.sql creates
-- the same objects for fresh installs.
--
-- A separate table rather than a `kind` column on shp_invoices, deliberately.
-- That table carries a partial unique index of one live invoice per order, and
-- an order can have any number of credit notes against it - a refund a month
-- for six months is six of them. Widening the index to dodge that would leave
-- every existing query on shp_invoices ("the invoice for this order", "void
-- this one") silently able to pick up a credit note, which is the kind of fault
-- that reads as working until an owner voids the wrong document.

CREATE SEQUENCE IF NOT EXISTS "shp_credit_note_number_seq" START 1;

CREATE TABLE IF NOT EXISTS "shp_credit_notes" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "order_id" TEXT NOT NULL,
    -- Snapshots of the numbers printed on the document, copied rather than
    -- looked up, for the same reason the invoice copies them: paperwork does
    -- not go and ask the order what it is called.
    "order_number" TEXT NOT NULL DEFAULT '',
    "credit_note_number" TEXT NOT NULL,

    -- The invoice being credited. A credit note that does not name its invoice
    -- is not a credit note - it is the reference that lets anyone reading the
    -- books, or HMRC, tie the two documents together. The FK is ON DELETE SET
    -- NULL rather than CASCADE: the number stays printed on a document that has
    -- already gone out, so losing the row must not lose the credit note.
    "invoice_id" TEXT,
    "invoice_number" TEXT NOT NULL DEFAULT '',

    -- The refund that caused it. One credit note per refund, enforced below -
    -- the refund route and a retry must not raise two for the same money.
    "refund_id" TEXT,

    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- The tax point of the CREDIT, not of the sale: the day the money went
    -- back. A credit dated into the quarter the sale was in would reopen a
    -- return that has very likely already been filed.
    "tax_point_date" DATE NOT NULL,

    "currency" TEXT NOT NULL,
    "currency_symbol" TEXT NOT NULL DEFAULT '',
    "tax_mode" TEXT NOT NULL,

    -- Positive magnitudes, every one of them. The document declares its own
    -- direction in its heading, which is how a credit note is written and what
    -- a customer expects to read; a column of minus signs reads as an error.
    -- Whoever consumes it does the negating - which is exactly what the books
    -- already do for a voided invoice.
    "subtotal" NUMERIC(10,2) NOT NULL DEFAULT 0,
    "shipping_amount" NUMERIC(10,2) NOT NULL DEFAULT 0,
    "tax_amount" NUMERIC(10,2) NOT NULL DEFAULT 0,
    "total" NUMERIC(10,2) NOT NULL,

    -- Same shapes as the invoice's, so one set of document blocks draws both.
    "seller" JSONB NOT NULL DEFAULT '{}',
    "customer" JSONB NOT NULL DEFAULT '{}',
    "lines" JSONB NOT NULL DEFAULT '[]',
    "tax_breakdown" JSONB NOT NULL DEFAULT '[]',
    "wording" JSONB NOT NULL DEFAULT '{}',

    -- Why the money went back, in the words whoever refunded it typed.
    "reason" TEXT,

    -- AUTO for one raised off the back of a refund, MANUAL for one somebody
    -- pressed the button for.
    "issued_by" TEXT NOT NULL DEFAULT 'AUTO',
    "created_by_user_id" TEXT,

    -- What the bookkeeping sinks made of it. Same reasoning as the invoice's:
    -- a credit that quietly failed to reach the books leaves the shop paying
    -- VAT on money it handed back, and nobody notices until the return is due.
    "sink_results" JSONB NOT NULL DEFAULT '[]',

    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shp_credit_notes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "shp_credit_notes_number_key" UNIQUE ("credit_note_number"),
    CONSTRAINT "shp_credit_notes_issued_by_check" CHECK ("issued_by" IN ('AUTO', 'MANUAL')),
    CONSTRAINT "shp_credit_notes_order_id_fkey"
        FOREIGN KEY ("order_id") REFERENCES "shp_orders"("id") ON DELETE CASCADE,
    CONSTRAINT "shp_credit_notes_invoice_id_fkey"
        FOREIGN KEY ("invoice_id") REFERENCES "shp_invoices"("id") ON DELETE SET NULL,
    CONSTRAINT "shp_credit_notes_refund_id_fkey"
        FOREIGN KEY ("refund_id") REFERENCES "shp_refunds"("id") ON DELETE SET NULL
);

-- One credit note per refund, enforced in the database rather than by a read
-- followed by a write. The refund route raises one as the refund settles, and
-- the retry button on the order screen raises one for a refund that did not get
-- its own; both can genuinely be in flight at once, and two credit notes for
-- one refund is money credited twice.
CREATE UNIQUE INDEX IF NOT EXISTS "shp_credit_notes_refund_key"
    ON "shp_credit_notes" ("refund_id") WHERE "refund_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "shp_credit_notes_order_id_idx" ON "shp_credit_notes" ("order_id");
CREATE INDEX IF NOT EXISTS "shp_credit_notes_invoice_id_idx" ON "shp_credit_notes" ("invoice_id");
CREATE INDEX IF NOT EXISTS "shp_credit_notes_issued_at_idx" ON "shp_credit_notes" ("issued_at" DESC);
CREATE INDEX IF NOT EXISTS "shp_credit_notes_tax_point_idx" ON "shp_credit_notes" ("tax_point_date");
