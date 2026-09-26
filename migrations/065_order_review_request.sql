-- ---------------------------------------------------------------------------
-- 065 - Whether the completion email may ask this customer for a review.
--
-- An owner who puts a "leave us a review" paragraph in the completion email
-- wraps it in {{#if hasReviewRequest}}...{{/if}}. This column is the flag
-- behind it: on for every order by default, switched off by staff on the order
-- screen when an order went badly and the last thing anybody wants is a
-- cheerful request for five stars. The rest of the email still goes.
--
-- Idempotent, and the same column sits in 001_initial.sql in place, so a fresh
-- install and an existing one land in the same place.
-- ---------------------------------------------------------------------------

ALTER TABLE "shp_orders" ADD COLUMN IF NOT EXISTS "ask_for_review" BOOLEAN NOT NULL DEFAULT true;
