-- How the customer asked to be kept posted about this order.
--
-- Three columns rather than a preference on the account, because most orders
-- are not placed by an account at all: a guest checkout has a name, an email
-- and (if they gave one) a phone number, and nowhere to hang a preference. So
-- the order carries its own, set on the confirmation page and - for a signed-in
-- shopper - kept in step with the choice on their notifications page.
--
--   notify_email - defaults true, which is exactly what every existing order
--                  already got, so this deploy changes nothing on its own.
--   notify_sms   - opt-in. A text costs the owner money and needs a number the
--                  shopper handed over on purpose.
--   notify_phone - the number the texts go to. Nullable and separate from
--                  customer_phone, which is the number for the DELIVERY (the
--                  courier's, sometimes a receptionist's) and has no business
--                  being texted order updates unless it was chosen for it.
--
-- Nothing is ever left with no way of being told: the checkout page and the
-- account page both refuse to turn the last channel off.

ALTER TABLE "shp_orders" ADD COLUMN IF NOT EXISTS "notify_email" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "shp_orders" ADD COLUMN IF NOT EXISTS "notify_sms" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "shp_orders" ADD COLUMN IF NOT EXISTS "notify_phone" TEXT;
