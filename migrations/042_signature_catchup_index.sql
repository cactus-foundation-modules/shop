-- The poller's second query: parcels still missing their proof of delivery.
--
-- WHY THERE IS A SECOND ONE
--
-- The tracking poll deliberately ignores parcels on a finished order - an order
-- nobody is waiting for is not worth asking a courier about every hour, for ever.
-- But an owner who marks an order complete HIMSELF, before the courier's page
-- has been read again, closes the order and the door at the same moment: the
-- parcel is never looked at again and its signature is never taken. That
-- happened on the first real delivery this ran against, the day it shipped.
--
-- So a completed order's parcel stays in the queue while it has no signature and
-- is recent enough to still be worth asking about. This index is that query's -
-- partial, because on any shop that has been running a while the rows it will
-- never look at are almost all of them.
--
-- Idempotent, and mirrored in 001_initial.sql for fresh installs.

CREATE INDEX IF NOT EXISTS "shp_shipments_signature_catchup_idx"
    ON "shp_shipments" ("tracking_checked_at")
    WHERE "tracking_url" IS NOT NULL AND "signature_url" IS NULL;
