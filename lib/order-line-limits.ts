// How many lines one request may name, on the routes that take a list of an
// order's lines - dispatch, refund, and a customer's cancel or return.
//
// A ceiling, not a rule. An order is at most as long as the basket it came
// from, and a basket stops at 200 lines (GUEST_CART_MAX_LINES,
// MEMBER_CART_MAX_LINES), so nothing the admin screens or the order page send
// comes near it. What it turns away is a hand-rolled request listing the same
// line ten thousand times, which every one of those routes would otherwise
// parse, fold together and check one row at a time before refusing.
export const ORDER_LINE_BATCH_MAX = 200

/** The sentence a request over the ceiling gets back, naming what to do. */
export const ORDER_LINE_BATCH_MAX_MESSAGE = `That is more than ${ORDER_LINE_BATCH_MAX} lines in one go. Split it into smaller batches.`
