-- The organisation an order was placed on behalf of, as a column on the order
-- rather than a field inside the delivery address.
--
-- It used to be asked for above address line 1. That put it in the wrong place
-- twice over: it was repeated on every address a shopper saved, and it described
-- the buyer rather than the door a parcel goes to. It is a contact detail now,
-- asked for under the shopper's own name and kept on their account between
-- orders. Anyone who needs the company on the delivery label puts it in line 1,
-- where a courier reads it.
--
-- Nullable: plenty of shops never ask for one.

ALTER TABLE "shp_orders" ADD COLUMN IF NOT EXISTS "customer_organisation" TEXT;

-- Orders placed while it lived in the address keep what they were given, moved
-- across so the orders list, the search and the invoice all read one column
-- instead of guessing. Billing first, then delivery: billing is the party being
-- invoiced, and a delivery company may well be a site office. A blank string
-- counts as not given rather than as a company called "".
--
-- Only rows with nothing in the new column are touched, so this can never
-- overwrite an organisation somebody has since put right.
UPDATE "shp_orders"
SET "customer_organisation" = COALESCE(
      NULLIF(btrim("billing_address"->>'company'), ''),
      NULLIF(btrim("shipping_address"->>'company'), '')
    )
WHERE "customer_organisation" IS NULL
  AND COALESCE(
        NULLIF(btrim("billing_address"->>'company'), ''),
        NULLIF(btrim("shipping_address"->>'company'), '')
      ) IS NOT NULL;
