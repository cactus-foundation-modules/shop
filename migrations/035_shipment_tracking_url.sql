-- A link the customer can follow to watch their parcel.
--
-- A tracking number on its own is homework: the customer has to work out whose
-- website to paste it into. The carriers all hand out a URL when a parcel is
-- booked, so this stores it alongside the number and the dispatch email turns
-- it into a button.
--
-- Nullable and optional throughout: plenty of parcels go out with no tracking
-- at all, and a shop that only ever quotes a number carries on exactly as it
-- did. Idempotent, and mirrored in 001_initial.sql for fresh installs.

ALTER TABLE "shp_shipments" ADD COLUMN IF NOT EXISTS "tracking_url" TEXT;
