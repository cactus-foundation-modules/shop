-- ---------------------------------------------------------------------------
-- 056 - Ask a question, from the product page.
--
-- Migration 055 gave a product FAQs, but only ones somebody at the shop had
-- thought to write. This is the other half: the shopper who has a question
-- nobody anticipated asks it on the page, leaves an email address, and gets the
-- answer back by email.
--
-- Every answered question is then written into that product's own FAQ set
-- (shp_products.faqs, migration 055) so the next shopper never has to ask it -
-- which is the whole point of collecting them on the product rather than in an
-- inbox. `published_at` records that that happened; an answer that never made it
-- into the FAQs (the product was deleted, the write failed) leaves it NULL, and
-- an owner who does not want a particular question on the page deletes the row
-- from the product's own FAQs tab, where it now lives like any other.
--
-- The email address is why this table is not just a FAQ draft: it is personal
-- data, given for one purpose. It is never rendered on the storefront - only the
-- question and the answer are, and only after somebody has read them.
--
-- Deleting a product takes its questions with it (CASCADE): a question about
-- something the shop no longer sells has nowhere to appear and nothing to be
-- about. Same call reviews made (rvw_reviews).
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "shp_product_questions" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "product_id" TEXT NOT NULL,
    -- The member who asked, when a signed-in one did. No FK: the Members system
    -- is optional, and a question outlives an account being closed.
    "member_id" TEXT,

    -- Who asked. The name is optional (a question is not an introduction); the
    -- email is not, because there is nowhere else to send the answer. Both are
    -- snapshots taken at submission rather than read live off a member record,
    -- so a change of name later does not rewrite an old thread.
    "asker_name" TEXT,
    "asker_email" TEXT NOT NULL,

    "question" TEXT NOT NULL,

    -- PENDING (nobody has looked at it) | ANSWERED (the shopper has been emailed)
    -- | REJECTED (read, and deliberately not answered - spam, or a question that
    -- belongs in an order enquiry). Rejected rather than deleted, so the same
    -- rubbish arriving twice is recognisable and so an owner can see what was
    -- turned down.
    "status" TEXT NOT NULL DEFAULT 'PENDING',

    -- The answer as it was emailed, kept verbatim. This is the record of what
    -- the customer was actually told, and it must not silently follow a later
    -- edit of the FAQ entry it seeded.
    "answer" TEXT,
    "answered_at" TIMESTAMP(3),
    -- Which admin user answered. No FK to the core User table: a member of staff
    -- leaving must not take the answer history with them.
    "answered_by_id" TEXT,
    "answered_by_name" TEXT,

    -- When the answer was written into the product's FAQs. NULL means it was
    -- not - see the header.
    "published_at" TIMESTAMP(3),

    -- The asker's IP, kept for the spam trail only. Never shown on a storefront.
    "submitted_ip" TEXT,

    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shp_product_questions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "shp_product_questions_status_check" CHECK ("status" IN ('PENDING', 'ANSWERED', 'REJECTED')),
    CONSTRAINT "shp_product_questions_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "shp_products"("id") ON DELETE CASCADE
);

-- The admin queue's query: waiting ones first, oldest first within that.
CREATE INDEX IF NOT EXISTS "shp_product_questions_status_created_at_idx" ON "shp_product_questions" ("status", "created_at");
-- "What has been asked about this product", from the product editor and from the
-- screen's own product filter.
CREATE INDEX IF NOT EXISTS "shp_product_questions_product_idx" ON "shp_product_questions" ("product_id", "created_at");
