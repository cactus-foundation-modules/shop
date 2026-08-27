-- Every deliberate change to a stock count, and who asked for it.
--
-- Until now a stock count was a number with no history: it went down at
-- payment, down again on a pre-order dispatch, back up when a shipment was
-- undone, and up or down by however much somebody typed into the product
-- editor. When the number on the shelf and the number on the screen disagreed -
-- and they always eventually disagree - there was nothing to read.
--
-- The immediate reason it exists now is that purchasing can book a delivery in.
-- Goods arriving is the first stock movement that originates OUTSIDE the shop
-- altogether, through core's inventory-adjuster capability, and a count that
-- moves because another module said so is exactly the count somebody will later
-- want explained.
--
-- Deliberately NOT backfilled and deliberately NOT wired into the five existing
-- stock write sites in this release: a half-populated history that looks
-- complete is worse than an empty one that is honestly new. Those sites move
-- onto adjustStock() in their own change, where each can be reasoned about.
CREATE TABLE IF NOT EXISTS "shp_stock_movements" (
    "id"         TEXT        NOT NULL DEFAULT gen_random_uuid()::text,
    "product_id" TEXT        NOT NULL,
    -- Signed. Positive took stock in, negative took it out.
    "delta"      INTEGER     NOT NULL,
    -- What the count was and what it became. Nullable because a product that is
    -- not tracking inventory has no count to record, and because GREATEST(...,0)
    -- means "after" is not always "before + delta" - which is precisely the sort
    -- of thing worth being able to see afterwards.
    "qty_before" INTEGER,
    "qty_after"  INTEGER,
    -- Machine-readable: "purchase-order.receipt", "order.paid", "admin.edit".
    "reason"     TEXT        NOT NULL,
    -- The document a person would recognise: a goods-received number, an order
    -- number. Free text, never a foreign key - the paperwork frequently belongs
    -- to a module that may later be uninstalled.
    "reference"  TEXT,
    -- Which module asked. 'shop' for its own writes.
    "source"     TEXT        NOT NULL DEFAULT 'shop',
    "user_id"    TEXT,
    "note"       TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "shp_stock_movements_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "shp_stock_movements_product_fk" FOREIGN KEY ("product_id")
        REFERENCES "shp_products" ("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "shp_stock_movements_product_idx"
    ON "shp_stock_movements" ("product_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "shp_stock_movements_created_idx"
    ON "shp_stock_movements" ("created_at" DESC);
