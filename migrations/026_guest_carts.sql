-- Server-side basket for shoppers who are not signed in.
--
-- Until this table, a guest's basket lived in localStorage and nowhere else:
-- the shop only learned what was in it when an order was placed. That made the
-- basket a browser's private notebook, which was fine for running a checkout
-- and useless for anything else - a shopper who swapped devices lost it, a
-- cleared cache lost it, and any module wanting to know what had been left
-- behind had to read the shopper's own storage to find out.
--
-- One row per guest basket, keyed on a random id kept in a cookie the shop
-- sets for itself. The cookie carries the id and nothing else: no fingerprint,
-- nothing derived from the shopper, no way back to a person from the value. It
-- is the "shopping basket" cookie every cookie-law guidance names as strictly
-- necessary - the basket cannot work without something identifying which
-- basket is yours - so it needs no banner and is set whatever the shopper has
-- said to one.
--
-- What it does NOT hold is the point. Lines only, in exactly the shape the
-- browser already stores (productId / quantity / optional lineId + meta).
-- Nothing typed into the checkout - no name, no email, no phone, no delivery
-- address - ever reaches this row. Those stay in the browser until the shopper
-- either places an order, is handed to a payment provider (shp_checkout_drafts),
-- or agrees to be remembered. A strictly-necessary cookie earns its exemption
-- by being strictly necessary, and a name and address are not.
--
-- Lines are display state, not money: prices, stock and per-line delivery are
-- still resolved server-side at cart validate and again at checkout, exactly as
-- for shp_member_carts. Nothing here is trusted beyond "these are the things
-- they picked".
--
-- Rows are swept on write once they have gone untouched for longer than the
-- cookie lives, so an abandoned basket does not sit here for ever and the table
-- does not grow without limit.

CREATE TABLE IF NOT EXISTS "shp_guest_carts" (
    "cart_id" TEXT NOT NULL,
    "lines" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shp_guest_carts_pkey" PRIMARY KEY ("cart_id")
);

-- The sweep orders by this and nothing else.
CREATE INDEX IF NOT EXISTS "shp_guest_carts_updated_at_idx" ON "shp_guest_carts"("updated_at");
