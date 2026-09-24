// Shop's one well-known checkout answer: does this shopper consent to marketing.
//
// A plain module on purpose, with no 'use client'. The order route reads this on
// the server and the checkout reads it in the browser, and a value imported from
// a 'use client' file into a route handler arrives as a proxy that throws the
// moment it is touched.
//
// Any checkout extra (built in or from a module) writes a plain boolean under
// this id in the checkout's `agreements` map, true meaning "consents". Shop
// reads it without needing to know who wrote it or how the question was put.
// Everything else in `agreements` is either the admin-authored
// checkoutAgreements list or a module's own private business.
export const MARKETING_CONSENT_AGREEMENT_ID = 'marketing-consent'

/**
 * What the checkout said about marketing, or null when nothing said anything.
 *
 * Null is not a no. It covers a shop with nothing asking the question and a
 * shopper who never touched the box, and the two cannot be told apart from what
 * the browser keeps. A no is only ever recorded when somebody actually answered.
 */
export function marketingConsentFromAgreements(agreements: Record<string, boolean> | undefined): boolean | null {
  const answer = agreements?.[MARKETING_CONSENT_AGREEMENT_ID]
  return typeof answer === 'boolean' ? answer : null
}

/**
 * The answer an account should hold, worked out from its orders.
 *
 * Newest first is the caller's job. Only an order placed at the account's own
 * email address counts: a shopper buying a gift for a friend answered on behalf
 * of the friend's address, not their own, and their own preference must not move
 * because of it.
 */
export function latestMarketingConsent(
  orders: ReadonlyArray<{ customerEmail: string; marketingConsent: boolean | null }>,
  memberEmail: string,
): boolean | null {
  const email = memberEmail.trim().toLowerCase()
  for (const order of orders) {
    if (order.marketingConsent !== null && order.customerEmail.trim().toLowerCase() === email) {
      return order.marketingConsent
    }
  }
  return null
}
