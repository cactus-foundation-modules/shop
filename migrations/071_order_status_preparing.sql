-- ---------------------------------------------------------------------------
-- 071 - A new order status: PREPARING.
--
-- PROCESSING is an order that has been paid for. PREPARING is one whose goods
-- have been ordered in from the supplier: another module (purchasing) tells the
-- shop the purchase order has gone, and the shop moves the order on. Nothing
-- about the order's own columns changes, only which values the status check
-- accepts.
--
-- Idempotent: the constraint is dropped and recreated whatever it held before.
-- 001 carries the same list for a fresh install.
-- ---------------------------------------------------------------------------

ALTER TABLE "shp_orders" DROP CONSTRAINT IF EXISTS "shp_orders_status_check";
ALTER TABLE "shp_orders" ADD CONSTRAINT "shp_orders_status_check"
  CHECK ("status" IN ('PENDING', 'PROCESSING', 'PREPARING', 'SHIPPED', 'COMPLETED', 'CANCELLED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'ON_HOLD'));
