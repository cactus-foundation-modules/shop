-- ---------------------------------------------------------------------------
-- 076 - A failed order email tries again on its own, for five minutes.
--
-- A note with "failed_email" (067) used to sit there until somebody pressed
-- Resend. The mail service refusing one message for a minute ("Greeting never
-- received", order DW000245) left a customer without their delivery window on
-- the morning it mattered, while the order page said they had been told.
--
-- These columns are the retry's state, on the note that already carries the
-- message as rendered:
--
--   email_retry_until  - when the automatic tries stop. NULL on a note that
--                        is not being retried (every note before this file,
--                        and any site with no way to schedule the retry).
--   email_next_try_at  - when the next try is due. NULL once the tries have
--                        stopped, whichever way they stopped.
--   email_lease_until  - held by whichever request is sending it right now,
--                        so a Resend click and an automatic try cannot both
--                        put the same email in front of the customer.
--   email_tries        - how many automatic and manual tries have been made
--                        after the first send.
--   email_settled_at   - the email went after all, or a newer one about the
--                        same thing replaced it. A settled note offers no
--                        Resend and no longer counts as "not told".
--
-- Idempotent.
-- ---------------------------------------------------------------------------

ALTER TABLE "shp_order_notes" ADD COLUMN IF NOT EXISTS "email_retry_until" TIMESTAMP(3);
ALTER TABLE "shp_order_notes" ADD COLUMN IF NOT EXISTS "email_next_try_at" TIMESTAMP(3);
ALTER TABLE "shp_order_notes" ADD COLUMN IF NOT EXISTS "email_lease_until" TIMESTAMP(3);
ALTER TABLE "shp_order_notes" ADD COLUMN IF NOT EXISTS "email_tries" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "shp_order_notes" ADD COLUMN IF NOT EXISTS "email_settled_at" TIMESTAMP(3);

-- The retry runner's only question: which notes are still trying. Almost
-- always none, so the partial index is almost always empty.
CREATE INDEX IF NOT EXISTS "shp_order_notes_email_next_try_idx"
  ON "shp_order_notes" ("email_next_try_at")
  WHERE "email_next_try_at" IS NOT NULL AND "email_settled_at" IS NULL;
