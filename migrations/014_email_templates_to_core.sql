-- The shop's emails moved into core's single email registry, edited in
-- Settings > Emails alongside every other email the site sends. Wording an
-- owner had already changed has to come with them, or an update would quietly
-- restore the stock copy on a live shop.
--
-- Only genuinely edited rows move their copy. A row still identical to what
-- 001_initial (and 008_shipments) seeded is not an edit: copying it across would
-- freeze today's default as a permanent override that never picks up a later
-- improvement. So the seed text is repeated below and compared against - the old
-- table has no "edited" flag, and this is the only way to tell the two apart.
--
-- The `is_active` switch moves either way: that one is a decision, not a default.
--
-- shp_email_templates is deliberately left in place. Nothing reads it any more,
-- but dropping it would make this the one update a rollback could not survive,
-- and a handful of dead rows is a cheap price for that.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'shp_email_templates') THEN
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'EmailTemplate') THEN
    RETURN;
  END IF;

  INSERT INTO "EmailTemplate" ("id", "key", "subject", "bodyHtml", "isActive", "updatedAt", "createdAt")
  SELECT
    gen_random_uuid()::text,
    seed.template_key,
    CASE WHEN t."subject"   = seed.seed_subject THEN NULL ELSE t."subject"   END,
    CASE WHEN t."body_html" = seed.seed_body    THEN NULL ELSE t."body_html" END,
    t."is_active",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  FROM "shp_email_templates" t
  JOIN (VALUES
    ('ORDER_CONFIRMED', 'shop.order-confirmed',
     'Your order {{orderNumber}} is confirmed',
     '<p>Hi {{customerName}},</p><p>Thanks for your order <strong>{{orderNumber}}</strong> - we''re getting it ready.</p><p>{{orderItems}}</p><p>Total: {{orderTotal}}</p>{{#if hasPreOrderItems}}<p>Pre-order notice: your order contains a pre-order item ({{preOrderItemName}}), expected to dispatch on or before {{preOrderDispatchDate}}.</p>{{/if}}<p>Shipping to: {{shippingAddress}}</p>'),

    ('STATUS_PROCESSING', 'shop.status-processing',
     'Your order {{orderNumber}} is being processed',
     '<p>Hi {{customerName}},</p><p>Your order <strong>{{orderNumber}}</strong> is now being processed.</p>'),

    ('STATUS_SHIPPED', 'shop.status-shipped',
     'Your order {{orderNumber}} is on its way',
     '<p>Hi {{customerName}},</p><p>Your order <strong>{{orderNumber}}</strong> is on its way.</p>'),

    ('STATUS_COMPLETED', 'shop.status-completed',
     'Your order {{orderNumber}} is complete',
     '<p>Hi {{customerName}},</p><p>Your order <strong>{{orderNumber}}</strong> is now complete. Thanks for shopping with us.</p>'),

    ('STATUS_CANCELLED', 'shop.status-cancelled',
     'Your order {{orderNumber}} has been cancelled',
     '<p>Hi {{customerName}},</p><p>Your order <strong>{{orderNumber}}</strong> has been cancelled.</p>'),

    ('PARTIAL_SHIPPED', 'shop.partial-shipped',
     '{{#if hasOutstanding}}Part of your order {{orderNumber}} is on its way{{/if}}{{#if isFinalPart}}The last part of your order {{orderNumber}} is on its way{{/if}}',
     '<p>Hi {{customerName}},</p>{{#if hasOutstanding}}<p>Good news - part of your order <strong>{{orderNumber}}</strong> is on its way. The rest of it is still with us, and we will email you again as soon as it is dispatched.</p>{{/if}}{{#if isFinalPart}}<p>Good news - the last part of your order <strong>{{orderNumber}}</strong> is on its way. That is everything from this order now dispatched.</p>{{/if}}<p><strong>In this parcel:</strong></p><p>{{dispatchedItems}}</p>{{#if hasOutstanding}}<p><strong>Still to come:</strong></p><p>{{outstandingItems}}</p>{{/if}}{{#if hasCarrier}}<p>Sent with {{carrier}}.</p>{{/if}}{{#if hasTracking}}<p>Tracking number: {{trackingNumber}}</p>{{/if}}<p>Parcels sent separately can arrive a day or two apart, so please do not worry if they turn up at different times.</p><p>Thanks for shopping with {{shopName}}.</p>'),

    ('ADMIN_NEW_ORDER', 'shop.admin-new-order',
     'New order received: {{orderNumber}}',
     '<p>New order <strong>{{orderNumber}}</strong> from {{customerName}} ({{customerEmail}}).</p><p>Total: {{orderTotal}}</p>'),

    ('LOW_STOCK', 'shop.low-stock',
     'Low stock alert: {{productName}}',
     '<p>{{productName}} is running low on stock ({{stockCount}} remaining).</p>'),

    ('BACK_IN_STOCK', 'shop.back-in-stock',
     '{{productName}} is back in stock',
     '<p>Good news - {{productName}} is back in stock.</p><p><a href="{{productUrl}}">View product</a></p><p><a href="{{unsubscribeUrl}}">Unsubscribe from this alert</a></p>'),

    ('IMPORT_COMPLETE', 'shop.import-complete',
     'Product import complete: {{createdCount}} created, {{updatedCount}} updated',
     '<p>Your product import has finished.</p><p>Created: {{createdCount}}, Updated: {{updatedCount}}, Skipped: {{skippedCount}}.</p>')
  ) AS seed(trigger_name, template_key, seed_subject, seed_body)
    ON seed.trigger_name = t."trigger"
  -- Nothing to carry: stock wording, still switched on. Leave core to its
  -- defaults rather than writing a row that says the same thing.
  WHERE t."is_active" = false
     OR t."subject"   <> seed.seed_subject
     OR t."body_html" <> seed.seed_body
  ON CONFLICT ("key") DO NOTHING;
END $$;
