-- Checkout drafts - an order that has not been paid for, and therefore is not
-- an order yet.
--
-- Some payment methods take the money on somebody else's site: the shopper is
-- handed over to their bank or to a hosted card page, and the shop only learns
-- the outcome when they come back, or when a webhook lands. Until this table
-- existed, the shop coped with that by writing the order row FIRST, at the
-- moment the method was picked, and leaving it PENDING. It made the return path
-- simple - there was always a row to mark PAID - and it made the orders list a
-- lie. Every shopper who thought better of it on the bank's own page, or who
-- never got as far as typing a card number, left a real order behind them, with
-- a real order number, in the same list as the orders somebody had actually
-- paid for.
--
-- So for those methods the order is now born at the moment the money is real,
-- and this is where everything it will be made of waits in the meantime. A
-- shopper who walks away leaves a draft nobody ever sees, swept up later.
--
-- Two things are settled at draft time rather than at settlement, deliberately:
--
--   id           - the id the ORDER will be given when it is created. The
--                  payment module's own row is keyed by it and the provider's
--                  return URL carries it, so minting it here means nothing has
--                  to be re-pointed once the order exists.
--   order_number - reserved from the same sequence as any other order, because
--                  it is quoted to the payment provider and ends up on the
--                  shopper's bank statement. An abandoned draft leaves a gap in
--                  the numbering, which is a far smaller price than a phantom
--                  order.
--
-- The row is DELETED the moment the order is created from it, in the same
-- transaction, so "is there a draft here" and "is there an order here" can never
-- both be true. Everything is idempotent so it is harmless that 001_initial.sql
-- creates the same table for fresh installs.

CREATE TABLE IF NOT EXISTS "shp_checkout_drafts" (
    -- Not defaulted: the caller mints this, because the payment provider is
    -- told it before the row is written.
    "id" TEXT NOT NULL,
    "order_number" TEXT NOT NULL,
    "payment_method" TEXT NOT NULL,
    -- Copied out of the payload as columns of their own, so the settlement path
    -- can check that a payment is for the right money without unpacking (or
    -- trusting) the whole snapshot.
    "customer_email" TEXT NOT NULL,
    "customer_name" TEXT NOT NULL,
    "total" NUMERIC(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'GBP',
    -- The whole order-to-be: every figure, every line, the addresses, the
    -- agreements. Exactly what the order-creating call would have been handed
    -- had the order been written there and then.
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- Generous on purpose. A bank payment can take days to be confirmed, and a
    -- draft swept while its money is still in flight would mean a payment that
    -- settles with no order to settle it against - the one failure worse than
    -- the one this table fixes.
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shp_checkout_drafts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "shp_checkout_drafts_order_number_key" UNIQUE ("order_number")
);

CREATE INDEX IF NOT EXISTS "shp_checkout_drafts_expires_at_idx" ON "shp_checkout_drafts" ("expires_at");
