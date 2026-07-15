-- Pluggable payment methods (shop.payment-providers extension point).
--
-- shp_orders.payment_method was constrained to a closed IN-list of the four
-- built-in methods. Module-contributed providers use their own method codes
-- (e.g. GOCARDLESS_IBP), which shop cannot enumerate, so drop the constraint.
-- The payment provider registry is now the source of truth for valid codes.
--
-- Idempotent: safe to re-run on existing installs; fresh installs already omit
-- the constraint (001_initial.sql).
ALTER TABLE "shp_orders" DROP CONSTRAINT IF EXISTS "shp_orders_payment_method_check";
