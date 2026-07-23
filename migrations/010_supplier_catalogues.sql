-- Catalogues belonging to a supplier (Shop > Suppliers).
--
-- A supplier hands you one or more catalogues - "Spring 2026", "Seating", "Trade
-- price list" - and each one usually lives in a Google Sheet somewhere. That is
-- a list per supplier, so it gets a table rather than more columns on
-- shp_suppliers: a supplier with four catalogues would otherwise mean four sets
-- of name/url columns and a hard ceiling on the fifth.
--
-- Unlike products, catalogues are linked to the supplier by ID, not by name.
-- Products are name-linked for a reason (the CSV columns carry a name, and the
-- column pre-dates the directory); a catalogue only ever exists inside the
-- directory row that owns it, so the foreign key is free and the cascade means a
-- deleted supplier cannot leave orphan catalogues behind.

CREATE TABLE IF NOT EXISTS "shp_supplier_catalogues" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "supplier_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    -- The Google Sheet (or any web address) the catalogue lives at. NULL when
    -- the owner has recorded a catalogue they have no link for yet.
    "sheet_url" TEXT,
    -- Display order within the supplier, so the owner's ordering survives a
    -- reload. Ties fall back to name in the query.
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "shp_supplier_catalogues_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "shp_supplier_catalogues_supplier_fkey" FOREIGN KEY ("supplier_id")
        REFERENCES "shp_suppliers" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "shp_supplier_catalogues_supplier_idx" ON "shp_supplier_catalogues" ("supplier_id");

-- Two catalogues of the same name under one supplier are a duplicate, not a
-- pair - the name is what the owner reads in the export.
CREATE UNIQUE INDEX IF NOT EXISTS "shp_supplier_catalogues_supplier_name_key"
    ON "shp_supplier_catalogues" ("supplier_id", LOWER("name"));
