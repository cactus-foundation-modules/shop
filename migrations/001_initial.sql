-- Shop Module - Initial Migration
-- Table prefix: shp_
-- Applied once by the Cactus module migration runner during build.
-- PROTECTED: written for review, not executed against the shared Neon DB
-- until Chris signs off (see plan review gate, task 7).
-- prisma/schema.prisma is untouched — every shp_ table below is queried via
-- $queryRaw/$executeRaw from modules/shop/lib/db.ts (Directory/Gazette pattern).

-- ---------------------------------------------------------------------------
-- Tax classes
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "shp_tax_classes" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,

    CONSTRAINT "shp_tax_classes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "shp_tax_classes_code_key" UNIQUE ("code")
);

-- ---------------------------------------------------------------------------
-- Shipping zones, tax zone rates, shipping rates
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "shp_shipping_zones" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    -- Array of postcode prefixes or exact codes — JSONB rather than TEXT[] to
    -- match the codebase's one existing array-column precedent (dir_entries.tags).
    "postcodes" JSONB NOT NULL DEFAULT '[]',
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shp_shipping_zones_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "shp_tax_zone_rates" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "zone_id" TEXT NOT NULL,
    "tax_class_id" TEXT NOT NULL,
    "rate" NUMERIC(5,4) NOT NULL,

    CONSTRAINT "shp_tax_zone_rates_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "shp_tax_zone_rates_zone_id_tax_class_id_key" UNIQUE ("zone_id", "tax_class_id"),
    CONSTRAINT "shp_tax_zone_rates_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "shp_shipping_zones"("id") ON DELETE CASCADE,
    CONSTRAINT "shp_tax_zone_rates_tax_class_id_fkey" FOREIGN KEY ("tax_class_id") REFERENCES "shp_tax_classes"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "shp_shipping_rates" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "zone_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "flat_rate" NUMERIC(10,2),
    -- Array of { upToKg: number, rate: number }
    "weight_rates" JSONB,
    "free_threshold" NUMERIC(10,2),
    "estimated_days" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "shp_shipping_rates_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "shp_shipping_rates_type_check" CHECK ("type" IN ('FLAT', 'WEIGHT_BASED', 'FREE')),
    CONSTRAINT "shp_shipping_rates_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "shp_shipping_zones"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "shp_shipping_rates_zone_id_idx" ON "shp_shipping_rates" ("zone_id");

-- ---------------------------------------------------------------------------
-- Digital files
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "shp_digital_files" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "filename" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "mime_type" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shp_digital_files_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- Products
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "shp_products" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "description" TEXT,
    "short_description" TEXT,
    "sku" TEXT,
    "barcode" TEXT,

    -- Pricing
    "price" NUMERIC(10,2) NOT NULL,
    "compare_at_price" NUMERIC(10,2),
    "cost_price" NUMERIC(10,2),
    "tax_class_id" TEXT,

    -- Inventory (physical only)
    "track_inventory" BOOLEAN NOT NULL DEFAULT false,
    "stock_count" INTEGER,
    "low_stock_threshold" INTEGER,
    "out_of_stock_behaviour" TEXT NOT NULL DEFAULT 'BLOCK',

    -- Physical dimensions
    "weight" NUMERIC(10,3),
    "weight_unit" TEXT,
    "dimension_l" NUMERIC(10,2),
    "dimension_w" NUMERIC(10,2),
    "dimension_h" NUMERIC(10,2),
    "dimension_unit" TEXT,

    -- Digital
    "digital_file_id" TEXT,
    "download_limit" INTEGER,
    "download_expiry" INTEGER,

    -- SEO
    "meta_title" TEXT,
    "meta_description" TEXT,
    -- No FK - core Media table (same convention as dir_entries images/gz_posts featured_image_id)
    "og_image_id" TEXT,

    -- Dedupe marker for the daily low-stock cron - cleared whenever stock is
    -- topped back up above the threshold, so the next dip re-alerts.
    "low_stock_alerted_at" TIMESTAMP(3),

    -- Pre-orders (addendum B)
    "is_pre_order" BOOLEAN NOT NULL DEFAULT false,
    "pre_order_dispatch_date" TIMESTAMP(3),
    "pre_order_note" TEXT,
    "pre_order_max_quantity" INTEGER,
    "pre_order_count" INTEGER NOT NULL DEFAULT 0,

    -- Related products / upsells (addendum D)
    "related_mode" TEXT NOT NULL DEFAULT 'AUTOMATIC',
    "upsell_mode" TEXT NOT NULL DEFAULT 'AUTOMATIC',
    "related_limit" INTEGER NOT NULL DEFAULT 4,
    "upsell_limit" INTEGER NOT NULL DEFAULT 4,

    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shp_products_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "shp_products_slug_key" UNIQUE ("slug"),
    CONSTRAINT "shp_products_sku_key" UNIQUE ("sku"),
    CONSTRAINT "shp_products_type_check" CHECK ("type" IN ('PHYSICAL', 'DIGITAL', 'SERVICE')),
    CONSTRAINT "shp_products_status_check" CHECK ("status" IN ('DRAFT', 'ACTIVE', 'ARCHIVED')),
    CONSTRAINT "shp_products_out_of_stock_behaviour_check" CHECK ("out_of_stock_behaviour" IN ('BLOCK', 'BACKORDER')),
    CONSTRAINT "shp_products_related_mode_check" CHECK ("related_mode" IN ('MANUAL', 'AUTOMATIC')),
    CONSTRAINT "shp_products_upsell_mode_check" CHECK ("upsell_mode" IN ('MANUAL', 'AUTOMATIC')),
    CONSTRAINT "shp_products_tax_class_id_fkey" FOREIGN KEY ("tax_class_id") REFERENCES "shp_tax_classes"("id") ON DELETE SET NULL,
    CONSTRAINT "shp_products_digital_file_id_fkey" FOREIGN KEY ("digital_file_id") REFERENCES "shp_digital_files"("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "shp_products_status_idx" ON "shp_products" ("status");
CREATE INDEX IF NOT EXISTS "shp_products_type_idx" ON "shp_products" ("type");
CREATE INDEX IF NOT EXISTS "shp_products_tax_class_id_idx" ON "shp_products" ("tax_class_id");
CREATE INDEX IF NOT EXISTS "shp_products_digital_file_id_idx" ON "shp_products" ("digital_file_id");
CREATE INDEX IF NOT EXISTS "shp_products_is_pre_order_idx" ON "shp_products" ("is_pre_order");

-- ---------------------------------------------------------------------------
-- Product media
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "shp_product_media" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "product_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    -- Cloudflare Workers URL for images/video files, or embed URL for VIDEO_URL
    "url" TEXT NOT NULL,
    "alt_text" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shp_product_media_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "shp_product_media_type_check" CHECK ("type" IN ('IMAGE', 'VIDEO_FILE', 'VIDEO_URL')),
    CONSTRAINT "shp_product_media_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "shp_products"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "shp_product_media_product_id_idx" ON "shp_product_media" ("product_id");

-- ---------------------------------------------------------------------------
-- Categories
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "shp_categories" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "parent_id" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "meta_title" TEXT,
    "meta_description" TEXT,
    "og_image_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shp_categories_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "shp_categories_slug_key" UNIQUE ("slug"),
    -- SET NULL: deleting a parent promotes its children to root categories rather than blocking the delete
    CONSTRAINT "shp_categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "shp_categories"("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "shp_categories_parent_id_idx" ON "shp_categories" ("parent_id");

CREATE TABLE IF NOT EXISTS "shp_product_categories" (
    "product_id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,

    CONSTRAINT "shp_product_categories_pkey" PRIMARY KEY ("product_id", "category_id"),
    CONSTRAINT "shp_product_categories_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "shp_products"("id") ON DELETE CASCADE,
    CONSTRAINT "shp_product_categories_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "shp_categories"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "shp_product_categories_category_id_idx" ON "shp_product_categories" ("category_id");

-- ---------------------------------------------------------------------------
-- Tags
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "shp_tags" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,

    CONSTRAINT "shp_tags_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "shp_tags_name_key" UNIQUE ("name"),
    CONSTRAINT "shp_tags_slug_key" UNIQUE ("slug")
);

CREATE TABLE IF NOT EXISTS "shp_product_tags" (
    "product_id" TEXT NOT NULL,
    "tag_id" TEXT NOT NULL,

    CONSTRAINT "shp_product_tags_pkey" PRIMARY KEY ("product_id", "tag_id"),
    CONSTRAINT "shp_product_tags_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "shp_products"("id") ON DELETE CASCADE,
    CONSTRAINT "shp_product_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "shp_tags"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "shp_product_tags_tag_id_idx" ON "shp_product_tags" ("tag_id");

-- ---------------------------------------------------------------------------
-- Collections
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "shp_collections" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "image_id" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "meta_title" TEXT,
    "meta_description" TEXT,
    "og_image_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shp_collections_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "shp_collections_slug_key" UNIQUE ("slug")
);

CREATE TABLE IF NOT EXISTS "shp_product_collections" (
    "product_id" TEXT NOT NULL,
    "collection_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "shp_product_collections_pkey" PRIMARY KEY ("product_id", "collection_id"),
    CONSTRAINT "shp_product_collections_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "shp_products"("id") ON DELETE CASCADE,
    CONSTRAINT "shp_product_collections_collection_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "shp_collections"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "shp_product_collections_collection_id_idx" ON "shp_product_collections" ("collection_id");

-- ---------------------------------------------------------------------------
-- Discounts
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "shp_coupons" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "code" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "value" NUMERIC(10,2),
    "minimum_order_value" NUMERIC(10,2),
    "usage_limit" INTEGER,
    "usage_count" INTEGER NOT NULL DEFAULT 0,
    "per_customer_limit" INTEGER,
    "starts_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shp_coupons_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "shp_coupons_code_key" UNIQUE ("code"),
    CONSTRAINT "shp_coupons_type_check" CHECK ("type" IN ('PERCENTAGE', 'FIXED_AMOUNT', 'FREE_SHIPPING'))
);

CREATE TABLE IF NOT EXISTS "shp_automatic_discounts" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "value" NUMERIC(10,2),
    "minimum_order_value" NUMERIC(10,2),
    "free_shipping_threshold" NUMERIC(10,2),
    "starts_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shp_automatic_discounts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "shp_automatic_discounts_type_check" CHECK ("type" IN ('PERCENTAGE', 'FIXED_AMOUNT', 'FREE_SHIPPING'))
);

-- ---------------------------------------------------------------------------
-- Orders
-- ---------------------------------------------------------------------------

-- Backs the order number generator (lib/order-number.ts) - a DB sequence
-- rather than a COUNT(*)-based scheme so concurrent checkouts can never
-- collide on the same order number.
CREATE SEQUENCE IF NOT EXISTS "shp_order_number_seq" START 1;

CREATE TABLE IF NOT EXISTS "shp_orders" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "order_number" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    -- Nullable, no FK - guest orders have no member; Members module is optional
    "member_id" TEXT,

    -- Customer snapshot (captured at order time, not a live relation)
    "customer_email" TEXT NOT NULL,
    "customer_name" TEXT NOT NULL,
    "customer_phone" TEXT,

    -- Addresses (ShpAddress shape)
    "shipping_address" JSONB NOT NULL,
    "billing_address" JSONB,

    -- Financials
    "subtotal" NUMERIC(10,2) NOT NULL,
    "discount_amount" NUMERIC(10,2) NOT NULL DEFAULT 0,
    "shipping_amount" NUMERIC(10,2) NOT NULL DEFAULT 0,
    "tax_amount" NUMERIC(10,2) NOT NULL DEFAULT 0,
    "total" NUMERIC(10,2) NOT NULL,
    -- INCLUSIVE | EXCLUSIVE, snapshot of shopConfig.taxMode at order time
    "tax_mode" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'GBP',

    -- Coupon
    "coupon_id" TEXT,
    "coupon_code" TEXT,

    -- Payment
    "payment_method" TEXT NOT NULL,
    "payment_status" TEXT NOT NULL DEFAULT 'PENDING',
    "payment_reference" TEXT,
    "paid_at" TIMESTAMP(3),

    -- Shipping (snapshot - rate itself may later change or be deleted)
    "shipping_rate_id" TEXT,
    "shipping_rate_name" TEXT,

    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shp_orders_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "shp_orders_order_number_key" UNIQUE ("order_number"),
    CONSTRAINT "shp_orders_status_check" CHECK ("status" IN ('PENDING', 'PROCESSING', 'SHIPPED', 'COMPLETED', 'CANCELLED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'ON_HOLD')),
    CONSTRAINT "shp_orders_payment_method_check" CHECK ("payment_method" IN ('STRIPE', 'PAYPAL', 'BANK_TRANSFER', 'CASH')),
    CONSTRAINT "shp_orders_payment_status_check" CHECK ("payment_status" IN ('PENDING', 'PAID', 'PARTIALLY_REFUNDED', 'REFUNDED', 'FAILED', 'AWAITING_CONFIRMATION')),
    CONSTRAINT "shp_orders_coupon_id_fkey" FOREIGN KEY ("coupon_id") REFERENCES "shp_coupons"("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "shp_orders_status_created_at_idx" ON "shp_orders" ("status", "created_at");
CREATE INDEX IF NOT EXISTS "shp_orders_payment_status_idx" ON "shp_orders" ("payment_status");
CREATE INDEX IF NOT EXISTS "shp_orders_customer_email_idx" ON "shp_orders" ("customer_email");
CREATE INDEX IF NOT EXISTS "shp_orders_member_id_idx" ON "shp_orders" ("member_id");
CREATE INDEX IF NOT EXISTS "shp_orders_coupon_id_idx" ON "shp_orders" ("coupon_id");

CREATE TABLE IF NOT EXISTS "shp_order_items" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "order_id" TEXT NOT NULL,
    -- Nullable, SET NULL on delete - product may later be deleted; snapshot fields below survive it
    "product_id" TEXT,
    "product_name" TEXT NOT NULL,
    "product_sku" TEXT,
    "product_type" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price" NUMERIC(10,2) NOT NULL,
    "tax_rate" NUMERIC(5,4) NOT NULL,
    "tax_amount" NUMERIC(10,2) NOT NULL,
    "total" NUMERIC(10,2) NOT NULL,
    "refunded_qty" INTEGER NOT NULL DEFAULT 0,
    "is_pre_order" BOOLEAN NOT NULL DEFAULT false,
    "pre_order_dispatch_date" TIMESTAMP(3),

    CONSTRAINT "shp_order_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "shp_order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "shp_orders"("id") ON DELETE CASCADE,
    CONSTRAINT "shp_order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "shp_products"("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "shp_order_items_order_id_idx" ON "shp_order_items" ("order_id");
CREATE INDEX IF NOT EXISTS "shp_order_items_product_id_idx" ON "shp_order_items" ("product_id");

-- ---------------------------------------------------------------------------
-- Digital downloads
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "shp_digital_downloads" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "order_id" TEXT NOT NULL,
    "order_item_id" TEXT NOT NULL,
    "file_id" TEXT NOT NULL,
    "token" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "download_count" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shp_digital_downloads_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "shp_digital_downloads_token_key" UNIQUE ("token"),
    CONSTRAINT "shp_digital_downloads_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "shp_orders"("id") ON DELETE CASCADE,
    CONSTRAINT "shp_digital_downloads_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "shp_order_items"("id") ON DELETE CASCADE,
    CONSTRAINT "shp_digital_downloads_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "shp_digital_files"("id") ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS "shp_digital_downloads_order_id_idx" ON "shp_digital_downloads" ("order_id");

-- ---------------------------------------------------------------------------
-- Refunds
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "shp_refunds" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "order_id" TEXT NOT NULL,
    "amount" NUMERIC(10,2) NOT NULL,
    "reason" TEXT,
    "provider_refund_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shp_refunds_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "shp_refunds_status_check" CHECK ("status" IN ('PENDING', 'COMPLETED', 'FAILED')),
    CONSTRAINT "shp_refunds_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "shp_orders"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "shp_refunds_order_id_idx" ON "shp_refunds" ("order_id");

CREATE TABLE IF NOT EXISTS "shp_refund_items" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "refund_id" TEXT NOT NULL,
    "order_item_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "amount" NUMERIC(10,2) NOT NULL,

    CONSTRAINT "shp_refund_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "shp_refund_items_refund_id_fkey" FOREIGN KEY ("refund_id") REFERENCES "shp_refunds"("id") ON DELETE CASCADE,
    CONSTRAINT "shp_refund_items_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "shp_order_items"("id") ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS "shp_refund_items_refund_id_idx" ON "shp_refund_items" ("refund_id");
CREATE INDEX IF NOT EXISTS "shp_refund_items_order_item_id_idx" ON "shp_refund_items" ("order_item_id");

-- ---------------------------------------------------------------------------
-- Order notes and email log
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "shp_order_notes" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "order_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    -- false = visible in a customer-facing email/portal
    "is_internal" BOOLEAN NOT NULL DEFAULT true,
    -- null = system-generated note
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shp_order_notes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "shp_order_notes_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "shp_orders"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "shp_order_notes_order_id_idx" ON "shp_order_notes" ("order_id");

CREATE TABLE IF NOT EXISTS "shp_order_emails" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "order_id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- ORDER_CONFIRMED | STATUS_UPDATED | MANUAL | REPLY_CATCHER
    "trigger" TEXT NOT NULL,

    CONSTRAINT "shp_order_emails_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "shp_order_emails_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "shp_orders"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "shp_order_emails_order_id_idx" ON "shp_order_emails" ("order_id");

-- ---------------------------------------------------------------------------
-- Saved addresses (Members module optional - no FK, memberId is a bare string)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "shp_saved_addresses" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "member_id" TEXT NOT NULL,
    "label" TEXT,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "address" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shp_saved_addresses_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "shp_saved_addresses_member_id_idx" ON "shp_saved_addresses" ("member_id");

-- ---------------------------------------------------------------------------
-- Email templates (seeded below)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "shp_email_templates" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "trigger" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body_html" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shp_email_templates_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "shp_email_templates_trigger_key" UNIQUE ("trigger")
);

INSERT INTO "shp_email_templates" ("trigger", "subject", "body_html") VALUES
    ('ORDER_CONFIRMED', 'Your order {{orderNumber}} is confirmed', '<p>Hi {{customerName}},</p><p>Thanks for your order <strong>{{orderNumber}}</strong> - we''re getting it ready.</p><p>{{orderItems}}</p><p>Total: {{orderTotal}}</p>{{#if hasPreOrderItems}}<p>Pre-order notice: your order contains a pre-order item ({{preOrderItemName}}), expected to dispatch on or before {{preOrderDispatchDate}}.</p>{{/if}}<p>Shipping to: {{shippingAddress}}</p>'),
    ('STATUS_PROCESSING', 'Your order {{orderNumber}} is being processed', '<p>Hi {{customerName}},</p><p>Your order <strong>{{orderNumber}}</strong> is now being processed.</p>'),
    ('STATUS_SHIPPED', 'Your order {{orderNumber}} is on its way', '<p>Hi {{customerName}},</p><p>Your order <strong>{{orderNumber}}</strong> is on its way.</p>'),
    ('STATUS_COMPLETED', 'Your order {{orderNumber}} is complete', '<p>Hi {{customerName}},</p><p>Your order <strong>{{orderNumber}}</strong> is now complete. Thanks for shopping with us.</p>'),
    ('STATUS_CANCELLED', 'Your order {{orderNumber}} has been cancelled', '<p>Hi {{customerName}},</p><p>Your order <strong>{{orderNumber}}</strong> has been cancelled.</p>'),
    ('ADMIN_NEW_ORDER', 'New order received: {{orderNumber}}', '<p>New order <strong>{{orderNumber}}</strong> from {{customerName}} ({{customerEmail}}).</p><p>Total: {{orderTotal}}</p>'),
    ('LOW_STOCK', 'Low stock alert: {{productName}}', '<p>{{productName}} is running low on stock ({{stockCount}} remaining).</p>'),
    ('BACK_IN_STOCK', '{{productName}} is back in stock', '<p>Good news - {{productName}} is back in stock.</p><p><a href="{{productUrl}}">View product</a></p><p><a href="{{unsubscribeUrl}}">Unsubscribe from this alert</a></p>'),
    ('IMPORT_COMPLETE', 'Product import complete: {{createdCount}} created, {{updatedCount}} updated', '<p>Your product import has finished.</p><p>Created: {{createdCount}}, Updated: {{updatedCount}}, Skipped: {{skippedCount}}.</p>')
ON CONFLICT ("trigger") DO NOTHING;

-- ---------------------------------------------------------------------------
-- Back-in-stock subscriptions (addendum A)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "shp_back_in_stock_subscriptions" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "product_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    -- Nullable, no FK - guest subscriptions have no member
    "member_id" TEXT,
    -- Null until notification is sent; rows are retained afterwards for reporting
    "notified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shp_back_in_stock_subscriptions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "shp_back_in_stock_subscriptions_product_id_email_key" UNIQUE ("product_id", "email"),
    CONSTRAINT "shp_back_in_stock_subscriptions_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "shp_products"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "shp_back_in_stock_subscriptions_product_id_idx" ON "shp_back_in_stock_subscriptions" ("product_id");

-- ---------------------------------------------------------------------------
-- CSV import jobs (addendum C)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "shp_import_jobs" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "filename" TEXT NOT NULL,
    "total_rows" INTEGER NOT NULL DEFAULT 0,
    "processed_rows" INTEGER NOT NULL DEFAULT 0,
    "created_count" INTEGER NOT NULL DEFAULT 0,
    "updated_count" INTEGER NOT NULL DEFAULT 0,
    "skipped_count" INTEGER NOT NULL DEFAULT 0,
    -- Array of { row: number, reason: string }
    "errors" JSONB,
    -- User-defined column mapping
    "column_map" JSONB,
    "created_by" TEXT NOT NULL,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shp_import_jobs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "shp_import_jobs_status_check" CHECK ("status" IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'))
);

CREATE INDEX IF NOT EXISTS "shp_import_jobs_created_at_idx" ON "shp_import_jobs" ("created_at");

-- ---------------------------------------------------------------------------
-- Related products, upsells, and per-product automatic exclusions (addendum D)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "shp_related_products" (
    "product_id" TEXT NOT NULL,
    "related_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "shp_related_products_pkey" PRIMARY KEY ("product_id", "related_id"),
    CONSTRAINT "shp_related_products_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "shp_products"("id") ON DELETE CASCADE,
    CONSTRAINT "shp_related_products_related_id_fkey" FOREIGN KEY ("related_id") REFERENCES "shp_products"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "shp_upsell_products" (
    "product_id" TEXT NOT NULL,
    "upsell_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "shp_upsell_products_pkey" PRIMARY KEY ("product_id", "upsell_id"),
    CONSTRAINT "shp_upsell_products_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "shp_products"("id") ON DELETE CASCADE,
    CONSTRAINT "shp_upsell_products_upsell_id_fkey" FOREIGN KEY ("upsell_id") REFERENCES "shp_products"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "shp_auto_exclude_products" (
    "product_id" TEXT NOT NULL,
    "excluded_id" TEXT NOT NULL,

    CONSTRAINT "shp_auto_exclude_products_pkey" PRIMARY KEY ("product_id", "excluded_id"),
    CONSTRAINT "shp_auto_exclude_products_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "shp_products"("id") ON DELETE CASCADE,
    CONSTRAINT "shp_auto_exclude_products_excluded_id_fkey" FOREIGN KEY ("excluded_id") REFERENCES "shp_products"("id") ON DELETE CASCADE
);

-- ---------------------------------------------------------------------------
-- Settings (singleton) - stores the whole ShpConfig blob as one JSON column,
-- same approach as SiteConfig.membersConfig/consentBannerConfig in core but
-- at module-table level (Q2 - no shopConfig column added to core SiteConfig).
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "shp_settings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "config" JSONB NOT NULL DEFAULT '{}',
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shp_settings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "shp_settings_singleton" CHECK ("id" = 'singleton')
);

INSERT INTO "shp_settings" ("id") VALUES ('singleton') ON CONFLICT ("id") DO NOTHING;
