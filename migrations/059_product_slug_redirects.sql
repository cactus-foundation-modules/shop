-- When a product or variation moves to a new web address, the old one forwards
-- there permanently. Optional on delete: send visitors somewhere sensible
-- instead of a dead link.
--
-- Idempotent: safe on an install that already has the table.

CREATE TABLE IF NOT EXISTS "shp_product_slug_redirects" (
    "slug" TEXT NOT NULL,
    "target_slug" TEXT,
    "target_path" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "shp_product_slug_redirects_pkey" PRIMARY KEY ("slug"),
    CONSTRAINT "shp_product_slug_redirects_target_check" CHECK (
        ("target_slug" IS NOT NULL AND "target_path" IS NULL)
        OR ("target_slug" IS NULL AND "target_path" IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS "shp_product_slug_redirects_target_slug_idx"
    ON "shp_product_slug_redirects" ("target_slug")
    WHERE "target_slug" IS NOT NULL;
