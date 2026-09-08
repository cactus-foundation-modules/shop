-- ---------------------------------------------------------------------------
-- 045 - Returns at the shop's discretion, and what it costs to collect them.
--
-- 043 gave a product two answers about returns: yes, or no. Plenty of trade is
-- neither. A contract chair that has been sat on, a desk that has been built
-- and taken apart again, anything bulky enough that the van costs more than the
-- restocking - a shop will often take those back, and will just as often not,
-- and the honest answer at the point of sale is "ask us". Promising a return it
-- may refuse is the worse of the two lies; refusing outright loses the sale it
-- would have taken.
--
--   shp_products.returns_discretionary
--       NULLABLE, exactly as "returnable" is and for the same reason: NULL is
--       "nothing said here", which on a variation child means "whatever the
--       listing says". Only meaningful where returns are allowed at all - a
--       product marked returnable = false is not returnable at anyone's
--       discretion, and the two are read in that order everywhere.
--
--       Deliberately a second column rather than a third value on "returnable".
--       That flag is a public CSV column, a variations column, a checkout
--       snapshot and a storefront pill; turning it into text would have every
--       one of those parse a word where they read a boolean, on a live
--       catalogue, to say something that fits beside it perfectly well.
--
--   shp_order_items.returns_discretionary
--       Snapshotted at checkout beside "returnable" (043), NOT NULL DEFAULT
--       false so every order placed before this existed records what was true
--       of it: an ordinary return, not a favour. What the customer bought under
--       is what they are held to, however the catalogue is edited afterwards.
--
--   shp_order_requests.return_charge
--       What the shop is keeping back for collecting the goods, entered when a
--       return is approved. NULL is not zero: it is "no charge was recorded",
--       which is what every request decided before today carries.
--
--       Money, so NUMERIC(10,2) - the same type shp_refunds.amount uses. A
--       charge is netted off the refund at the moment of approval, and recorded
--       whether or not the money moves then, because a shop that approves now
--       and refunds when the van comes back still has to remember what it said
--       it would keep.
--
-- Idempotent, and the same columns sit in 001_initial.sql in place, so a fresh
-- install and an existing one land in the same place.
-- ---------------------------------------------------------------------------

ALTER TABLE "shp_products"       ADD COLUMN IF NOT EXISTS "returns_discretionary" BOOLEAN;
ALTER TABLE "shp_order_items"    ADD COLUMN IF NOT EXISTS "returns_discretionary" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "shp_order_requests" ADD COLUMN IF NOT EXISTS "return_charge" NUMERIC(10,2);

-- ---------------------------------------------------------------------------
-- Damage reports.
--
-- "It arrived damaged" was one of the return reasons, and it was the wrong
-- shape for the job in every direction. A shopper picks it because it is true,
-- and the shop then has a return on its hands: goods collected, checked and
-- refunded, when what the customer wanted was the leg that snapped replaced. It
-- is also the one reason that has to work on goods the shop does not take back
-- at all - a bespoke desk that turns up smashed is still smashed - and on goods
-- whose return window shut months ago, because a fault does not read a calendar.
--
-- So it is its own kind of request, sharing the queue, the decision, the notes
-- and the item lines with the other two, and adding the one thing it cannot do
-- without: photographs. Nobody arranges a replacement off a sentence.
-- ---------------------------------------------------------------------------

ALTER TABLE "shp_order_requests" DROP CONSTRAINT IF EXISTS "shp_order_requests_type_check";
ALTER TABLE "shp_order_requests" ADD CONSTRAINT "shp_order_requests_type_check"
    CHECK ("type" IN ('CANCEL', 'RETURN', 'DAMAGE'));

-- One open request per order still holds - but a damage report is now counted
-- separately, and that is the point of splitting the index rather than widening
-- it. The original guard exists so two approvals cannot refund the same lines
-- twice; a damage report refunds nothing by itself, and a customer whose second
-- parcel arrives broken while a return is being decided must not be told to
-- wait their turn.
DROP INDEX IF EXISTS "shp_order_requests_one_open_idx";
CREATE UNIQUE INDEX IF NOT EXISTS "shp_order_requests_one_open_idx"
    ON "shp_order_requests" ("order_id") WHERE "status" = 'PENDING' AND "type" <> 'DAMAGE';
CREATE UNIQUE INDEX IF NOT EXISTS "shp_order_requests_one_open_damage_idx"
    ON "shp_order_requests" ("order_id") WHERE "status" = 'PENDING' AND "type" = 'DAMAGE';

CREATE TABLE IF NOT EXISTS "shp_order_request_photos" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "request_id" TEXT NOT NULL,
    -- Core Media id, so the file sits in the library like any other and is
    -- served through whatever the site serves media through. Plain TEXT and no
    -- FK, the same rule "decided_by" follows: module tables do not reach into
    -- core's schema.
    "media_id" TEXT,
    -- Snapshotted beside the id so the queue can show the photographs without a
    -- join into core, and still has something to show if the library row is
    -- tidied away underneath it.
    "url" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shp_order_request_photos_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "shp_order_request_photos_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "shp_order_requests"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "shp_order_request_photos_request_id_idx" ON "shp_order_request_photos" ("request_id");
