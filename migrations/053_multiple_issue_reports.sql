-- More than one issue report open on the same order at once.
--
-- One open damage report per order was a copy of the cancel/return guard, and
-- the guard was never about damage. That one exists so two approvals cannot
-- refund the same lines twice; an issue report spends nothing - it names lines
-- without taking them off the order - so nothing double-counts when two are
-- open together.
--
-- What it cost was the common case. An order of eight desks arrives, one is
-- scratched, the customer reports it, and the next morning they open the second
-- carton and find a broken leg. Until now the page answered "you have already
-- reported damage on this order", the button was gone, and the second fault
-- reached the shop as an email attached to nothing.
--
-- The cancel/return index is untouched: one of those at a time still holds.
DROP INDEX IF EXISTS "shp_order_requests_one_open_damage_idx";

-- Kept, and now the only thing this pair of columns is indexed for: the order
-- page and the admin queue both read "what is still open on this order", and
-- without the unique index above there is nothing left serving that read.
CREATE INDEX IF NOT EXISTS "shp_order_requests_order_status_idx"
    ON "shp_order_requests" ("order_id", "status");
