import { formatMoney } from '@/modules/shop/lib/money'

// Does the money a payment webhook reports match the order it names?
//
// The browser's confirm call has always checked this (see confirmPayment in
// lib/payments/stripe.ts and paypal.ts): an intent that took the wrong amount,
// or took it in the wrong currency, is refused. The webhook - which settles an
// order just as surely, and on its own whenever the shopper's browser does not
// come back - trusted the order id in the event and nothing else. A payment for
// a different figure (an intent altered after it was raised, a capture for part
// of the money, a second shop sharing the account) marked the order paid in full.
//
// It is not refused here, deliberately. The event is signed by the provider, so
// the money it describes is real, and an order left unpaid is pruned as an
// abandoned checkout within a day - which would lose a genuine payment from the
// books altogether. The order is still marked paid; the mismatch is written on
// it and the order held, so a person looks before anything is sent.

/** A payment as the provider reports it: minor units (pence) and an ISO code. */
export type PaidAmount = { minorUnits: number; currency: string }

/**
 * Pence from a decimal string ("123.45", "123.4", "123"), without passing
 * through a float on the way. Null for anything that is not a plain positive
 * amount, or that carries fractions of a penny.
 */
export function decimalToMinorUnits(value: string): number | null {
  const match = /^\s*(\d+)(?:\.(\d+))?\s*$/.exec(value)
  if (!match) return null
  const whole = match[1] ?? '0'
  const fraction = match[2] ?? ''
  if (fraction.length > 2 && /[^0]/.test(fraction.slice(2))) return null
  const pence = `${fraction}00`.slice(0, 2)
  const units = Number(whole) * 100 + Number(pence)
  return Number.isSafeInteger(units) ? units : null
}

function minorToDecimal(minorUnits: number): string {
  const sign = minorUnits < 0 ? '-' : ''
  const abs = Math.abs(Math.trunc(minorUnits))
  return `${sign}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, '0')}`
}

/**
 * The internal note to leave on an order whose webhook payment does not match
 * it, or null when it matches - or when the provider did not say how much it
 * took, which leaves nothing to compare.
 */
export function paidAmountMismatchNote(
  order: { total: string; currency: string },
  paid: PaidAmount | undefined,
  currencySymbol: string,
): string | null {
  if (!paid) return null
  const paidCurrency = paid.currency.trim().toUpperCase()
  const orderCurrency = order.currency.trim().toUpperCase()
  if (paidCurrency !== orderCurrency) {
    return (
      `The payment provider reports this order was paid in ${paidCurrency || 'an unknown currency'}, ` +
      `but it was placed in ${orderCurrency}. The order has been put on hold - check the payment ` +
      `before sending anything, and refund it if it is not right.`
    )
  }
  const expected = decimalToMinorUnits(order.total)
  if (expected !== null && expected === paid.minorUnits) return null
  return (
    `The payment provider reports ${formatMoney(minorToDecimal(paid.minorUnits), currencySymbol)} was paid for this order, ` +
    `but its total is ${formatMoney(order.total, currencySymbol)}. The order has been put on hold - check the payment ` +
    `before sending anything, and ask for or refund the difference.`
  )
}
