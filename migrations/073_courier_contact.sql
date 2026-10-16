-- ---------------------------------------------------------------------------
-- 073 - "You need to ring the courier to arrange this delivery."
--
-- Some couriers - Furdeco among them - do not book a day with the customer
-- themselves from the shop's end: the customer has to get in touch and agree
-- one. Until now the only place the shop told anybody to contact a courier was
-- after a FAILED delivery. This is the same instruction given up front, per
-- parcel, because it is true of some parcels and not others.
--
--   shp_shipments.courier_contact_at
--       Set by staff from the order screen, which also emails the customer.
--       While set, and until the parcel arrives or is failed, the customer's
--       order page tells them to contact the courier, with the courier's phone
--       number, live chat link and the parcel's tracking number. NULL is the
--       ordinary case - the courier or the shop sorts the day out.
--
-- Idempotent, and the same column sits in 001_initial.sql for a fresh install.
-- ---------------------------------------------------------------------------

ALTER TABLE "shp_shipments" ADD COLUMN IF NOT EXISTS "courier_contact_at" TIMESTAMP(3);
