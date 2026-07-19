-- Supplier directory (shop settings > General > Suppliers, then Shop > Suppliers).
--
-- 006 added a free-text "supplier" column on shp_products, which is still where
-- a product's supplier lives. This file adds the directory the name is chosen
-- from: account number, discount, status, contact details and notes, none of
-- which belong on every product row.
--
-- Products are linked by NAME, not by id. That keeps the CSV import/export
-- columns working exactly as they did, keeps suppliers already typed against a
-- product valid without a back-fill, and means uninstalling the directory later
-- costs nothing. The trade is that a rename has to carry the products with it,
-- which renameSupplier does in the same transaction (see lib/db/suppliers.ts).
--
-- Variations need no column of their own: a variation is a hidden shp_products
-- row (catalogue_hidden = true), so it already carries a supplier, and the
-- product/variation counts are that same flag split two ways.

CREATE TABLE IF NOT EXISTS "shp_suppliers" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "name" TEXT NOT NULL,
    "account_number" TEXT,
    -- Trade discount off list, as a percentage. NULL means none recorded, which
    -- is not the same as a recorded 0%.
    "discount_percent" NUMERIC(5,2),
    "status" TEXT NOT NULL DEFAULT 'ENABLED',
    "contact_name" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "shp_suppliers_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "shp_suppliers_status_check" CHECK ("status" IN ('ENABLED', 'DISABLED')),
    CONSTRAINT "shp_suppliers_discount_percent_check" CHECK ("discount_percent" IS NULL OR ("discount_percent" >= 0 AND "discount_percent" <= 100))
);

-- Case-insensitive uniqueness on the name: the name IS the link to products, so
-- two suppliers differing only in case would split one supplier's product count
-- in two and make renames ambiguous.
CREATE UNIQUE INDEX IF NOT EXISTS "shp_suppliers_name_lower_key" ON "shp_suppliers" (LOWER("name"));

-- The product counts group by supplier name across every product row, so that
-- lookup wants an index of its own.
CREATE INDEX IF NOT EXISTS "shp_products_supplier_idx" ON "shp_products" ("supplier");
