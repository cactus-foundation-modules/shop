-- Issue reports: "something is missing" answered per line, and photographs
-- asked for and added after the report is in, and requests staff raise on a
-- customer's behalf.
--
-- "Something is missing", answered per line.
--
-- The issue form now asks what kind of problem it is before anything else, and
-- a missing item gets its own questions: which of the delivered lines, how many,
-- and whether the whole thing failed to turn up or only parts of it. The answer
-- belongs to the LINE, not the report - an order of a desk and a chair can be
-- missing the chair outright and the desk's leg bolts in the same breath - so
-- it lives here rather than as another reason code.
--
-- NULL on every line of every other request, and on every line recorded before
-- this. The CHECK rides on the ADD COLUMN, so it is created with the column and
-- the statement stays a no-op on an install that already has both.
ALTER TABLE "shp_order_request_items"
    ADD COLUMN IF NOT EXISTS "missing" TEXT
    CONSTRAINT "shp_order_request_items_missing_check" CHECK ("missing" IN ('WHOLE', 'PARTS'));

-- Asking the customer for photographs, after the report is in.
--
-- Photographs are optional on the form now, so the owner needs a way to ask for
-- them once they have looked: the queue sends an email with a link straight to
-- the report, and these two say when that was and what it asked to see. The
-- customer's order page shows the note beside an "Add photos" button, and the
-- queue shows what has come in since.
ALTER TABLE "shp_order_requests" ADD COLUMN IF NOT EXISTS "photos_requested_at" TIMESTAMP(3);
ALTER TABLE "shp_order_requests" ADD COLUMN IF NOT EXISTS "photos_request_note" TEXT;

-- Who put a photograph on a report: a core User id where staff added it from
-- the queue (one emailed in, say), NULL where the customer sent it. Plain TEXT,
-- no FK, as "decided_by" is.
ALTER TABLE "shp_order_request_photos" ADD COLUMN IF NOT EXISTS "added_by" TEXT;

-- Who raised a request: a core User id where staff raised it on the customer's
-- behalf (from the order screen - a phone call, an email), NULL where the
-- customer raised it themselves. Plain TEXT, no FK, as "decided_by" is.
ALTER TABLE "shp_order_requests" ADD COLUMN IF NOT EXISTS "raised_by" TEXT;
