// Single source of truth for rendering money in the shop. Every price shown to
// a shopper or admin goes through here so we never leak a raw "7.99" (or worse,
// an unformatted "7.9") without the currency symbol and two decimal places.
//
// Prices are held throughout the module as decimal pounds - NUMERIC(10,2) in
// the database, surfaced as strings by the query layer - so this only needs to
// coerce-and-format, never divide by 100.

/** Format a monetary amount as "£7.99", or "£1,600.00" once it runs to four
 * figures. Accepts the string/number shapes prices arrive in; nullish or
 * non-numeric input formats as the symbol with 0.00.
 *
 * The thousands separator is not decoration: this shop sells office pods at
 * £1,600 and boardroom tables above that, and "£1600.00" reads as a typo on a
 * price a customer is about to pay.
 *
 * The locale is pinned to en-GB rather than left to the runtime's default. It
 * has to be: this runs on the server for the RSC pass and again in the browser
 * for the client one, and a server that thinks it is in Germany would render
 * "1.600,00" into HTML that React then re-renders as "1,600.00" - a hydration
 * mismatch on every price in the shop. A shop whose currency is not sterling
 * still gets grouped thousands and a dot decimal, which is what the stored
 * NUMERIC(10,2) means and what every other figure in the admin already shows.
 */
export function formatMoney(amount: string | number | null | undefined, symbol = '£'): string {
  const n = Number(amount)
  const value = Number.isFinite(n) ? n : 0
  return `${symbol}${value.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
