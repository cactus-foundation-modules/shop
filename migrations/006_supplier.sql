-- Supplier name on a product (shop settings > General > Suppliers).
--
-- One nullable text column rather than a shp_suppliers table: what owners asked
-- for is a name written against the thing they bought, not a supplier directory
-- with addresses and terms. A table can arrive later without this column having
-- lied about anything in the meantime.
--
-- Variations carry their own supplier for free, because a variation is a hidden
-- child shp_products row - the same column serves both, and shop settings decide
-- whether the box is offered on variations at all.

ALTER TABLE "shp_products" ADD COLUMN IF NOT EXISTS "supplier" TEXT;
