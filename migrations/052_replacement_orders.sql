-- ---------------------------------------------------------------------------
-- 052 - Replacement parts: sending one out, and letting the customer watch it.
--
-- A customer reports something broken (a DAMAGE request, migration 045), and
-- until now the shop's answer ended at an email saying it would be put right.
-- What actually followed - a gas lift picked off a shelf, put in a box, handed
-- to a courier - was written down nowhere, and the customer had no more idea
-- where it was than the shop did.
--
-- The replacement is modelled as an ORDER OF ITS OWN, hung off the original.
-- Not a fudge: every piece of delivery tracking this shop has - parcels,
-- tracking stages, carrier scan feeds, the live vehicle position, signatures,
-- the customer's own tracking page - hangs off shp_shipments.order_id, which is
-- NOT NULL and points here. A bespoke "replacements" table would have meant
-- writing dispatch and tracking a second time, worse, for the same result.
--
--   shp_orders.kind
--       'SALE' for everything ever placed, and for everything placed at a
--       checkout from now on. 'REPLACEMENT' for a part sent out to put an
--       earlier order right.
--
--       The rule everywhere it is read: MONEY FOLLOWS payment_status, COUNTS
--       FOLLOW kind. A free replacement is worth nothing and so never disturbs
--       a revenue or tax figure on its own; what it would disturb is a COUNT of
--       orders - a shop's "42 orders this month", a customer's "your fourth
--       order" - and those are the queries that filter on this column. A
--       replacement the customer is charged for is real money and is left
--       alone, which is why the filter is never written as "total > 0".
--
--   shp_orders.parent_order_id
--       The order being put right. SET NULL rather than CASCADE: an order that
--       is somehow deleted must not take the record of the part with it, and a
--       parcel that has been delivered is a fact whoever else it belonged to.
--
--   shp_order_items.replaces_order_item_id
--       Which LINE of the original this part is for. The whole point of the
--       feature and the reason parent_order_id is not enough on its own: a
--       replacement is almost never the thing that was bought. Nobody sends a
--       second chair; they send the gas lift out of it. Without this the part
--       sits beside a five-line order with no way of saying which line it
--       belongs to, and the original order can never show "gas lift sent" in
--       the right place.
--
--   shp_order_requests.replacement_order_id
--       Joins the asking to the doing: the damage report the part was sent for.
--       The trail then reads end to end - photographs, decision, part, parcel,
--       delivery - on both the admin's queue and the customer's order page.
--
--   shp_products.parts_only
--       "This is a spare part, not something to sell." Purchasable, ACTIVE,
--       stocked and costed exactly like any other product, and kept off every
--       storefront surface - grids, the sitemap, search cards.
--
--       A column of its own rather than another meaning for catalogue_hidden,
--       which shop-variations owns and which the ADMIN product list also hides:
--       a part whose stock and cost nobody can open and edit is not worth
--       cataloguing in the first place.
--
-- Idempotent, and the same columns sit in 001_initial.sql in place, so a fresh
-- install and an existing one land in the same place.
-- ---------------------------------------------------------------------------

ALTER TABLE "shp_orders" ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'SALE';
ALTER TABLE "shp_orders" ADD COLUMN IF NOT EXISTS "parent_order_id" TEXT;

-- Dropped and recreated so re-running the migration cannot stack two copies of
-- the same rule, and so an install that took an earlier draft of it still ends
-- up with exactly this one.
ALTER TABLE "shp_orders" DROP CONSTRAINT IF EXISTS "shp_orders_kind_check";
ALTER TABLE "shp_orders" ADD CONSTRAINT "shp_orders_kind_check"
    CHECK ("kind" IN ('SALE', 'REPLACEMENT'));

ALTER TABLE "shp_orders" DROP CONSTRAINT IF EXISTS "shp_orders_parent_order_id_fkey";
ALTER TABLE "shp_orders" ADD CONSTRAINT "shp_orders_parent_order_id_fkey"
    FOREIGN KEY ("parent_order_id") REFERENCES "shp_orders"("id") ON DELETE SET NULL;

-- The one query the customer's order page adds: "what has been sent out to put
-- this order right". Partial, because the column is NULL on every ordinary
-- order and there is no sense indexing several years of those.
CREATE INDEX IF NOT EXISTS "shp_orders_parent_order_id_idx"
    ON "shp_orders" ("parent_order_id") WHERE "parent_order_id" IS NOT NULL;

-- Sat in the COUNT filters described above, alongside payment_status.
CREATE INDEX IF NOT EXISTS "shp_orders_kind_idx" ON "shp_orders" ("kind");

ALTER TABLE "shp_order_items" ADD COLUMN IF NOT EXISTS "replaces_order_item_id" TEXT;

-- SET NULL, not RESTRICT. The order line this points at cannot be deleted while
-- the order exists, and if the order goes the whole line goes with it - so the
-- only thing RESTRICT would achieve is blocking the parent's own deletion long
-- after the part was delivered and forgotten about.
ALTER TABLE "shp_order_items" DROP CONSTRAINT IF EXISTS "shp_order_items_replaces_order_item_id_fkey";
ALTER TABLE "shp_order_items" ADD CONSTRAINT "shp_order_items_replaces_order_item_id_fkey"
    FOREIGN KEY ("replaces_order_item_id") REFERENCES "shp_order_items"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "shp_order_items_replaces_order_item_id_idx"
    ON "shp_order_items" ("replaces_order_item_id") WHERE "replaces_order_item_id" IS NOT NULL;

ALTER TABLE "shp_order_requests" ADD COLUMN IF NOT EXISTS "replacement_order_id" TEXT;

ALTER TABLE "shp_order_requests" DROP CONSTRAINT IF EXISTS "shp_order_requests_replacement_order_id_fkey";
ALTER TABLE "shp_order_requests" ADD CONSTRAINT "shp_order_requests_replacement_order_id_fkey"
    FOREIGN KEY ("replacement_order_id") REFERENCES "shp_orders"("id") ON DELETE SET NULL;

ALTER TABLE "shp_products" ADD COLUMN IF NOT EXISTS "parts_only" BOOLEAN NOT NULL DEFAULT false;

-- In the WHERE of every storefront product query (lib/db/products.ts), so it is
-- worth an index for the same reason catalogue_hidden has one.
CREATE INDEX IF NOT EXISTS "shp_products_parts_only_idx" ON "shp_products" ("parts_only");
