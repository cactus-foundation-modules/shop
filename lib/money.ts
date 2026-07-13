// Single source of truth for rendering money in the shop. Every price shown to
// a shopper or admin goes through here so we never leak a raw "7.99" (or worse,
// an unformatted "7.9") without the currency symbol and two decimal places.
//
// Prices are held throughout the module as decimal pounds - NUMERIC(10,2) in
// the database, surfaced as strings by the query layer - so this only needs to
// coerce-and-format, never divide by 100.

/** Format a monetary amount as "£7.99". Accepts the string/number shapes prices
 * arrive in; nullish or non-numeric input formats as the symbol with 0.00. */
export function formatMoney(amount: string | number | null | undefined, symbol = '£'): string {
  const n = Number(amount)
  return `${symbol}${(Number.isFinite(n) ? n : 0).toFixed(2)}`
}
