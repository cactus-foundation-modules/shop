-- Products made up of other products ("kits").
--
-- A kit has no stock of its own and often no SKU of its own: it is a list of
-- ordinary products (usually spare-part rows, see parts_only) and how many of
-- each go into one. Whether the kit can be sold is whatever its scarcest part
-- allows - one part out and the whole kit is out. The same table serves a
-- standalone product and a shop-variations child, because a variation child IS a
-- shp_products row.
--
-- Stock stays materialised on the kit's own row (track_inventory / stock_count)
-- rather than being worked out at read time. Every reader of stock in the shop
-- and its modules - the grid, the checkout, the variation picker, the shopping
-- feed - already looks at those two columns, and teaching each of them about
-- kits would be a dozen chances to miss one. Instead the database keeps the kit's
-- row true, from three triggers:
--
--   1. a part's count or tracking changes      -> every kit that uses it is redone
--   2. a part is added, changed or removed     -> that kit is redone
--   3. anything writes the kit's own count     -> the write is overridden
--
-- (3) is the safety net: an import, a bulk edit or an old code path that still
-- decrements "the product" on a kit changes nothing, because the number is not
-- the kit's to set. What actually moves on a sale is the parts - see
-- lib/db/product-components.ts - and (1) carries that up to the kit.
--
-- A part that does not keep a count (made to order, never runs out) never limits
-- the kit. A kit whose parts are all like that does not keep a count either.
--
-- One level only: a kit cannot be a part, and a part cannot be a kit. Enforced
-- in the trigger below, not just in the editor, so no writer can build a loop.
CREATE TABLE IF NOT EXISTS "shp_product_components" (
    "product_id"           TEXT        NOT NULL,
    "component_product_id" TEXT        NOT NULL,
    -- How many of the part go into ONE kit.
    "quantity"             INTEGER     NOT NULL DEFAULT 1,
    "position"             INTEGER     NOT NULL DEFAULT 0,
    "created_at"           TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "shp_product_components_pkey" PRIMARY KEY ("product_id", "component_product_id"),
    CONSTRAINT "shp_product_components_qty_check" CHECK ("quantity" > 0),
    CONSTRAINT "shp_product_components_self_check" CHECK ("product_id" <> "component_product_id"),
    CONSTRAINT "shp_product_components_product_fk" FOREIGN KEY ("product_id")
        REFERENCES "shp_products" ("id") ON DELETE CASCADE,
    -- Refuses, deliberately: deleting a part out from under a kit would leave a
    -- kit that looks available and cannot be built. Checked at commit rather
    -- than per row, so a kit and its own parts can still be deleted together -
    -- the part's check would otherwise run before the kit's delete had cascaded
    -- its list away.
    CONSTRAINT "shp_product_components_component_fk" FOREIGN KEY ("component_product_id")
        REFERENCES "shp_products" ("id") ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX IF NOT EXISTS "shp_product_components_component_idx"
    ON "shp_product_components" ("component_product_id");

-- What a kit's own row should say: whether it keeps a count and how many it can
-- make. Zero rows (not a kit) answers NULL for both.
CREATE OR REPLACE FUNCTION shp_kit_stock(kit_id TEXT, OUT tracked BOOLEAN, OUT qty INTEGER) AS $$
DECLARE
  part_count INTEGER;
  tracked_count INTEGER;
  buildable NUMERIC;
BEGIN
  SELECT COUNT(*),
         COUNT(*) FILTER (WHERE c."track_inventory"),
         MIN(FLOOR(GREATEST(COALESCE(c."stock_count", 0), 0)::numeric / pc."quantity")) FILTER (WHERE c."track_inventory")
    INTO part_count, tracked_count, buildable
    FROM "shp_product_components" pc
    JOIN "shp_products" c ON c."id" = pc."component_product_id"
   WHERE pc."product_id" = kit_id;

  IF part_count = 0 THEN
    tracked := NULL;
    qty := NULL;
  ELSIF tracked_count = 0 THEN
    tracked := false;
    qty := NULL;
  ELSE
    tracked := true;
    qty := LEAST(buildable, 2147483647)::integer;
  END IF;
END
$$ LANGUAGE plpgsql STABLE;

-- (3) The kit's own count is not the kit's to set.
CREATE OR REPLACE FUNCTION shp_kit_stock_guard() RETURNS trigger AS $$
DECLARE
  derived RECORD;
BEGIN
  SELECT * INTO derived FROM shp_kit_stock(NEW."id");
  IF derived.tracked IS NOT NULL THEN
    NEW."track_inventory" := derived.tracked;
    NEW."stock_count" := derived.qty;
  END IF;
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS shp_products_kit_stock_guard ON "shp_products";
CREATE TRIGGER shp_products_kit_stock_guard
  BEFORE UPDATE ON "shp_products"
  FOR EACH ROW EXECUTE FUNCTION shp_kit_stock_guard();

-- Redo one kit. Touches stock_count to itself so the guard above does the work
-- and a kit's alert marker is re-armed the way a restock re-arms any product.
CREATE OR REPLACE FUNCTION shp_kit_stock_refresh(kit_id TEXT) RETURNS void AS $$
BEGIN
  UPDATE "shp_products" k
     SET "stock_count" = k."stock_count",
         "low_stock_alerted_at" = CASE WHEN k."low_stock_alerted_at" IS NOT NULL
                                        AND (SELECT qty FROM shp_kit_stock(kit_id)) > COALESCE(k."low_stock_threshold", -1)
                                       THEN NULL ELSE k."low_stock_alerted_at" END,
         "updated_at" = CURRENT_TIMESTAMP
   WHERE k."id" = kit_id
     AND (k."track_inventory", k."stock_count") IS DISTINCT FROM
         ((SELECT tracked FROM shp_kit_stock(kit_id)), (SELECT qty FROM shp_kit_stock(kit_id)));
END
$$ LANGUAGE plpgsql;

-- (1) A part moved: redo every kit that uses it.
CREATE OR REPLACE FUNCTION shp_kit_parts_moved() RETURNS trigger AS $$
DECLARE
  kit RECORD;
BEGIN
  FOR kit IN SELECT "product_id" FROM "shp_product_components" WHERE "component_product_id" = NEW."id" LOOP
    PERFORM shp_kit_stock_refresh(kit."product_id");
  END LOOP;
  RETURN NULL;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS shp_products_kit_parts_moved ON "shp_products";
CREATE TRIGGER shp_products_kit_parts_moved
  AFTER UPDATE OF "stock_count", "track_inventory" ON "shp_products"
  FOR EACH ROW
  WHEN (OLD."stock_count" IS DISTINCT FROM NEW."stock_count" OR OLD."track_inventory" IS DISTINCT FROM NEW."track_inventory")
  EXECUTE FUNCTION shp_kit_parts_moved();

-- (2) The list itself changed. Also the one place nesting is refused.
CREATE OR REPLACE FUNCTION shp_kit_list_changed() RETURNS trigger AS $$
BEGIN
  IF TG_OP <> 'DELETE' THEN
    IF EXISTS (SELECT 1 FROM "shp_product_components" WHERE "product_id" = NEW."component_product_id") THEN
      RAISE EXCEPTION 'A kit cannot be a part of another kit.' USING ERRCODE = '23514';
    END IF;
    IF EXISTS (SELECT 1 FROM "shp_product_components" WHERE "component_product_id" = NEW."product_id") THEN
      RAISE EXCEPTION 'A part of another kit cannot be made into a kit.' USING ERRCODE = '23514';
    END IF;
    PERFORM shp_kit_stock_refresh(NEW."product_id");
  END IF;
  IF TG_OP <> 'INSERT' AND (TG_OP = 'DELETE' OR OLD."product_id" <> NEW."product_id") THEN
    PERFORM shp_kit_stock_refresh(OLD."product_id");
  END IF;
  RETURN NULL;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS shp_product_components_changed ON "shp_product_components";
CREATE TRIGGER shp_product_components_changed
  AFTER INSERT OR UPDATE OR DELETE ON "shp_product_components"
  FOR EACH ROW EXECUTE FUNCTION shp_kit_list_changed();
