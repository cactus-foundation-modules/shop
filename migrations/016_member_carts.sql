-- Server-side basket for signed-in members, so a cart started on a phone is
-- still there on a laptop. Guests keep the localStorage-only cart they always
-- had; a member's browser keeps its localStorage copy too and treats this table
-- as the shared truth it merges with on sign-in and pushes to on every change.
--
-- One row per member, the whole basket in one jsonb array, in exactly the shape
-- the client already stores (productId / quantity / optional lineId + meta).
-- Lines are display state, not money: prices, stock and per-line delivery are
-- still resolved server-side at cart validate and again at checkout, so nothing
-- here is trusted beyond "these are the things they picked".
--
-- No FK on member_id, matching shp_saved_addresses and shp_orders: the Members
-- side of core is optional as far as this module's schema is concerned.

CREATE TABLE IF NOT EXISTS "shp_member_carts" (
    "member_id" TEXT NOT NULL,
    "lines" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shp_member_carts_pkey" PRIMARY KEY ("member_id")
);
