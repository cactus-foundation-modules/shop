-- Optional price types. A shop only ever charges one figure, but owners keep
-- more than one number against a product: what it costs them, what the maker
-- says it should sell for, what a trade customer pays, and what it drops to in
-- a sale. Which of these are offered at all is a shop setting (config
-- `enabledPriceTypes`); the columns are always here, so switching one on is a
-- checkbox rather than a migration.
--
--   price        - mandatory, the normal selling price. Unchanged.
--   sale_price   - when set (and below price), this is what the shopper is
--                  charged and `price` becomes the struck-through "was".
--   retail_price - RRP. Reference only, never charged.
--   trade_price  - wholesale. Reference only, never charged, never public.
--   cost_price   - unchanged, already here, still margin-only.
--
-- compare_at_price is retired: it modelled the same sale as `price` +
-- `sale_price` but inverted (you had to overwrite the real price to run an
-- offer, losing it). Its values are carried across below before the column
-- goes, so no figure an owner typed is lost:
--   compare_at > price  - a live offer. price was the discounted figure, so it
--                         becomes sale_price and compare_at becomes price. The
--                         shopper sees and pays exactly what they did before.
--   compare_at <= price - not a discount at all (data entered the other way
--                         round, or left over). Kept as retail_price, which is
--                         the closest honest reading of a reference figure.
--
-- Idempotent: the ADDs are IF NOT EXISTS, the backfill is a no-op once
-- compare_at_price is gone, and the DROP is IF EXISTS.

ALTER TABLE "shp_products" ADD COLUMN IF NOT EXISTS "sale_price" NUMERIC(10,2);
ALTER TABLE "shp_products" ADD COLUMN IF NOT EXISTS "retail_price" NUMERIC(10,2);
ALTER TABLE "shp_products" ADD COLUMN IF NOT EXISTS "trade_price" NUMERIC(10,2);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'shp_products' AND column_name = 'compare_at_price'
  ) THEN
    UPDATE "shp_products"
       SET "sale_price" = "price",
           "price" = "compare_at_price",
           "compare_at_price" = NULL
     WHERE "compare_at_price" IS NOT NULL
       AND "compare_at_price" > "price"
       AND "sale_price" IS NULL;

    UPDATE "shp_products"
       SET "retail_price" = "compare_at_price"
     WHERE "compare_at_price" IS NOT NULL
       AND "retail_price" IS NULL;
  END IF;
END $$;

ALTER TABLE "shp_products" DROP COLUMN IF EXISTS "compare_at_price";
