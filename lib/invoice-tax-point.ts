// The tax point an invoice for goods carries: the day the sale counts for VAT.
//
// Pure, and in whole days already worked out in the site's own timezone, so the
// rule can be read and tested without a database or a clock. lib/invoices.ts
// gathers the three days and hands them over.
//
// The rule is the ordinary UK one for goods (the time-of-supply rules in HMRC's
// VAT Guide, Notice 700):
//
//  - The BASIC tax point is the day the goods left. Here that is the first
//    parcel recorded against the order, which is the earliest any of it was
//    supplied and so the direction that can never file a sale late.
//  - Paid on or before that day, the payment fixes the tax point and nothing
//    raised afterwards moves it. That is every card sale taken at checkout.
//  - Not despatched yet, the earlier of payment and the invoice itself is it -
//    which, with nothing paid, is simply the day the invoice is raised.
//  - Otherwise the goods went first. An invoice raised within 14 days of them
//    going is dated its own day; one raised later than that falls back to the
//    day they left.
//
// The last line is the one this file exists for. It used to be "the day the
// invoice was raised" across the board for anything unpaid, which is right on
// the day of despatch and for a fortnight after, and wrong from then on: a
// pay-later order invoiced by hand a month after it went out was filed a month
// late, possibly in the next quarter.

/** How long after despatch an invoice may still carry its own date. */
export const INVOICE_AFTER_DESPATCH_DAYS = 14

const DAY_MS = 24 * 60 * 60 * 1000

/** Whole days from one yyyy-mm-dd to another. Both parse as UTC midnight, so
 *  there is no clock change in between to make a day 23 hours long. */
function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS)
}

export function invoiceTaxPointDay(input: {
  /** The day the invoice is being raised. */
  issuedDay: string
  /** The day the order was paid for, where it has been. */
  paidDay: string | null
  /** The day the first parcel left, where one has. */
  despatchDay: string | null
}): string {
  const { issuedDay, paidDay, despatchDay } = input
  // yyyy-mm-dd compares correctly as a string, which is why every day here is one.
  if (!despatchDay || despatchDay > issuedDay) return paidDay ?? issuedDay
  if (paidDay && paidDay <= despatchDay) return paidDay
  return daysBetween(despatchDay, issuedDay) <= INVOICE_AFTER_DESPATCH_DAYS ? issuedDay : despatchDay
}
