-- ---------------------------------------------------------------------------
-- 072 - The window the customer was actually told.
--
-- "slot_notified_at" says THAT the window email went; this says WHICH window it
-- carried, as 'YYYY-MM-DD HH:MM-HH:MM'. A save is then judged against what the
-- customer read, not against the parcel as it stood a moment before - which,
-- when the courier's own tracking had moved the window since the email, made a
-- rebooked window look like no news and sent nothing.
--
-- NULL on every parcel told before this column existed; those fall back to
-- comparing against the parcel as it was. Idempotent; 001 carries it too.
-- ---------------------------------------------------------------------------

ALTER TABLE "shp_shipments" ADD COLUMN IF NOT EXISTS "slot_notified_window" TEXT;
