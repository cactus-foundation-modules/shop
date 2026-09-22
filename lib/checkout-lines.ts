import { z } from 'zod'
import { GUEST_CART_MAX_LINES } from '@/modules/shop/lib/db/guest-cart'
import { MEMBER_CART_MAX_LINES } from '@/modules/shop/lib/db/member-cart'

// The basket as every public checkout route takes it: the lines the browser
// holds, posted back to be priced (checkout session, cart validate, coupon,
// payment note) or turned into an order (payment intent).
//
// Each of those routes prices the whole lot against the database - a batched
// product read plus every installed module's line resolver - on a request
// anybody can make. The two basket stores already refused more than a couple of
// hundred lines and any line options bigger than a few KB; the routes doing the
// actual work took any number of either, and the one that writes an order
// stored whatever options it was handed on the order row. The same line ceiling
// here as there. The options ceiling is far roomier than the stores' few KB,
// though: the basket a shopper actually checks out from lives in their browser,
// which keeps whatever the product page allowed - and personalisation allows a
// good deal (free-text add-ons run to 2,000 characters apiece, and a line may
// carry several). A ceiling here exists to stop a hand-built request writing a
// megabyte onto an order row, not to refuse an engraving at the till.

/** As many lines as either basket store will keep. */
export const CHECKOUT_MAX_LINES = Math.max(GUEST_CART_MAX_LINES, MEMBER_CART_MAX_LINES)

/** A line's own options (engraving text, a chosen delivery tier), measured the
 *  way the basket stores measure them. */
export const CHECKOUT_LINE_META_MAX_BYTES = 32_000

export const CHECKOUT_TOO_MANY_LINES_MESSAGE =
  `Your basket has more than ${CHECKOUT_MAX_LINES} different items in it. Please split it into smaller orders.`
export const CHECKOUT_LINE_META_TOO_LARGE_MESSAGE =
  'The options chosen for one of the items in your basket are too long.'

export const CheckoutLineSchema = z.object({
  productId: z.string(),
  quantity: z.number().int().min(1),
  lineId: z.string().optional(),
  meta: z.record(z.unknown())
    .refine((m) => JSON.stringify(m).length <= CHECKOUT_LINE_META_MAX_BYTES, CHECKOUT_LINE_META_TOO_LARGE_MESSAGE)
    .optional(),
})

export const CheckoutLinesSchema = z.array(CheckoutLineSchema).max(CHECKOUT_MAX_LINES, CHECKOUT_TOO_MANY_LINES_MESSAGE)

/** Which of the ceilings above a refused request ran into, in the shopper's
 *  words. Null when it failed for any other reason, so each route keeps its own
 *  wording for a request that was simply malformed. */
export function checkoutLinesRefusal(error: z.ZodError): string | null {
  const issue = error.issues.find((i) => (
    i.path[0] === 'lines'
    && (i.message === CHECKOUT_TOO_MANY_LINES_MESSAGE || i.message === CHECKOUT_LINE_META_TOO_LARGE_MESSAGE)
  ))
  return issue?.message ?? null
}
