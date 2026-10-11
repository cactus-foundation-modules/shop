import type { ShpInvoiceLine, ShpInvoiceTaxRow } from '@/modules/shop/lib/types'
import type { DeliverySlice } from '@/modules/shop/lib/invoice-tax'

// The arithmetic on a credit note, kept pure and kept here so it can be tested
// without a database (see credit-note-tax.test.ts). Nothing in this file reads
// settings, the clock or the catalogue.
//
// Four rules decide everything below:
//
//  1. The gross credited is the money that actually went back. Not a fresh
//     calculation of what the line "should" have been worth: the customer's
//     statement shows the refund, the shop's bank shows the refund, and a credit
//     note that disagrees with either is a dispute rather than a document.
//
//  2. The VAT inside that money is the rate the line was SOLD at. Taken from the
//     invoice line itself, never re-derived from a tax table that may have moved
//     since - crediting a 2026 refund at a 2027 rate is how a return goes wrong
//     in a way nobody spots.
//
//  3. Every figure is a positive magnitude. The document declares its direction
//     in its heading, which is how a credit note is written; whoever consumes it
//     does the negating.
//
//  4. It must add up. The rate rows are reconciled so they sum exactly to the
//     credit's own tax and total, for the same reason the invoice's are.

/** One line of a refund, as the refund route recorded it. `amount` is the money
 *  handed back for those units, tax and all. */
export type CreditRefundItem = { orderItemId: string; quantity: number; amount: number }

export type CreditNoteMoney = {
  lines: ShpInvoiceLine[]
  taxBreakdown: ShpInvoiceTaxRow[]
  subtotal: string
  /** The delivery credited, on the document's own convention: gross on an
   *  INCLUSIVE shop, net (its tax in the tax row) on an EXCLUSIVE one - the
   *  way the invoice prints its delivery. "0.00" when none went back. */
  shippingAmount: string
  taxAmount: string
  total: string
}

/** Thrown when a refund cannot be tied back to what was invoiced. Never guessed
 *  around: a credit note carrying an invented VAT rate is worse than no credit
 *  note, because it looks like paperwork and files a wrong return. The caller
 *  turns this into a sentence on the order screen. */
export class CreditNoteMoneyError extends Error {}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function money(value: number): string {
  return round2(value).toFixed(2)
}

/**
 * Which invoice line a refunded order line is.
 *
 * By id where the invoice carries one. Invoices raised before credit notes
 * existed do not, and those fall back to position: invoice lines are built from
 * `getOrderItems` in order and never reordered, so the nth line is the nth item.
 * The caller passes the ids in that same order, which is what makes the fallback
 * a fact rather than a hope.
 */
function matchLine(
  lines: ShpInvoiceLine[],
  orderItemIds: string[],
  orderItemId: string,
): ShpInvoiceLine | null {
  const byId = lines.find((line) => line.orderItemId && line.orderItemId === orderItemId)
  if (byId) return byId
  const index = orderItemIds.indexOf(orderItemId)
  return index >= 0 && index < lines.length ? lines[index]! : null
}

/** The share of the invoice line's named charges that goes back with a refund.
 *
 *  A delivery service priced per item is INSIDE the line's price, and a credit
 *  note that showed the whole sum as goods would have the customer's accounts
 *  department reclaiming VAT under the wrong heading. But a refund no longer
 *  takes the delivery with it as a matter of course: the refund window lets an
 *  owner hand back a returned chair and keep the delivery that was made for it.
 *  The refund records only its money and its units, so the money is read goods
 *  first - the refunded units' goods are covered before a penny is called
 *  delivery, and only what is left over (up to those units' share of the
 *  delivery) is credited as delivery. A whole line credits all of it, a
 *  goods-only refund credits none, and a goodwill sum smaller than the goods
 *  is goods.
 *
 *  This is the SPLIT of money already being credited. It never adds a penny,
 *  which is why nothing below has to reconcile against it. */
function creditedCharges(source: ShpInvoiceLine, gross: number, sourceGross: number, quantity: number): ShpInvoiceLine['charges'] {
  if (!source.charges?.length || !(sourceGross > 0) || !(gross > 0)) return undefined
  const lineTotal = Number(source.lineTotal) || 0
  const chargeSum = source.charges.reduce((sum, charge) => sum + (Number(charge.amount) || 0), 0)
  if (!(lineTotal > 0) || !(chargeSum > 0)) return undefined
  const chargeRatio = Math.min(chargeSum / lineTotal, 1)
  const unitShare = source.quantity > 0 && quantity > 0 ? Math.min(quantity / source.quantity, 1) : 1
  const chargeGrossForUnits = sourceGross * chargeRatio * unitShare
  const goodsGrossForUnits = sourceGross * (1 - chargeRatio) * unitShare
  const creditedChargeGross = Math.min(Math.max(gross - goodsGrossForUnits, 0), chargeGrossForUnits)
  const scale = creditedChargeGross / (sourceGross * chargeRatio)
  const rows = source.charges
    .map((charge) => ({ label: charge.label, amount: money((Number(charge.amount) || 0) * scale) }))
    .filter((charge) => Number(charge.amount) > 0)
  return rows.length > 0 ? rows : undefined
}

/**
 * Turns an invoice and a settled refund into credit note lines and a
 * net/tax/gross summary per rate.
 */
//
// `delivery` is the delivery charge handed back with the refund, already split
// across rates and scaled to what went back (deliverySlices in
// lib/invoice-tax.ts, which is how the invoice split it). It lands in the rate
// rows and the totals, and in `shippingAmount` rather than as a line, because
// delivery is not a line on the invoice either.
export function buildCreditNoteMoney(
  invoiceLines: ShpInvoiceLine[],
  orderItemIds: string[],
  refundItems: CreditRefundItem[],
  taxMode: 'INCLUSIVE' | 'EXCLUSIVE',
  delivery: DeliverySlice[] = [],
): CreditNoteMoney {
  type Bucket = { rate: number; net: number; tax: number; gross: number }
  const buckets = new Map<string, Bucket>()
  const lines: ShpInvoiceLine[] = []
  let totalNet = 0
  let totalTax = 0
  let totalGross = 0

  for (const item of refundItems) {
    const source = matchLine(invoiceLines, orderItemIds, item.orderItemId)
    if (!source) {
      throw new CreditNoteMoneyError(
        'One of the refunded items is not on the invoice, so the tax on it cannot be worked out.',
      )
    }

    const gross = round2(Number(item.amount) || 0)
    // The proportion of this line that is tax, as it was CHARGED. Both figures
    // come off the invoice, so an INCLUSIVE shop and an EXCLUSIVE one are
    // handled by the same division without either being special-cased.
    const sourceGross = Number(source.gross) || 0
    const sourceTax = Number(source.tax) || 0
    const taxRatio = sourceGross > 0 ? sourceTax / sourceGross : 0
    const tax = round2(gross * taxRatio)
    const net = round2(gross - tax)

    totalNet += net
    totalTax += tax
    totalGross += gross

    const key = source.taxRatePercent || '0'
    const bucket = buckets.get(key) ?? { rate: Number(key) || 0, net: 0, tax: 0, gross: 0 }
    bucket.net += net
    bucket.tax += tax
    bucket.gross += gross
    buckets.set(key, bucket)

    lines.push({
      name: source.name,
      sku: source.sku,
      quantity: item.quantity,
      // What one unit is being credited at, which on a part-refunded line is not
      // necessarily what it was sold at - somebody crediting a goodwill fiver
      // against a chair is doing exactly that.
      unitPrice: money(item.quantity > 0 ? gross / item.quantity : gross),
      lineTotal: money(gross),
      taxRatePercent: key,
      net: money(net),
      tax: money(tax),
      gross: money(gross),
      detail: source.detail ?? [],
      charges: creditedCharges(source, gross, sourceGross, item.quantity),
      orderItemId: item.orderItemId,
    })
  }

  // Goods first, so the subtotal below is the goods' alone.
  const goodsNet = totalNet
  const goodsGross = totalGross
  let deliveryNet = 0
  let deliveryGross = 0
  for (const slice of delivery) {
    const bucket = buckets.get(slice.ratePercent) ?? { rate: slice.rate, net: 0, tax: 0, gross: 0 }
    bucket.net += slice.net
    bucket.tax += slice.tax
    bucket.gross += slice.gross
    buckets.set(slice.ratePercent, bucket)
    deliveryNet += slice.net
    deliveryGross += slice.gross
    totalTax += slice.tax
    totalGross += slice.gross
  }

  const rows: ShpInvoiceTaxRow[] = [...buckets.entries()]
    .sort((a, b) => b[1].rate - a[1].rate)
    .map(([key, bucket]) => ({
      ratePercent: key,
      net: money(bucket.net),
      tax: money(bucket.tax),
      gross: money(bucket.gross),
    }))

  const taxAmount = round2(totalTax)
  const total = round2(totalGross)

  return {
    lines,
    taxBreakdown: reconcile(rows, taxAmount, total),
    // Same convention the invoice prints under: an EXCLUSIVE shop's subtotal is
    // the net figure with the tax added as its own row beneath, an INCLUSIVE
    // one's already carries it. Matching the invoice matters more than usual
    // here, because the two documents are read side by side.
    subtotal: money(taxMode === 'INCLUSIVE' ? goodsGross : goodsNet),
    shippingAmount: money(taxMode === 'INCLUSIVE' ? deliveryGross : deliveryNet),
    taxAmount: money(taxAmount),
    total: money(total),
  }
}

/**
 * Nudges the largest row so the summary sums exactly to the credit's own tax and
 * total. Same method, and same reasoning, as the invoice's: apportioning in
 * floating point leaves pennies about, and "which row absorbs the rounding" is a
 * presentation question rather than an accounting one.
 */
function reconcile(rows: ShpInvoiceTaxRow[], creditTax: number, creditTotal: number): ShpInvoiceTaxRow[] {
  if (rows.length === 0) return rows
  const sumTax = rows.reduce((sum, row) => sum + Number(row.tax), 0)
  const sumGross = rows.reduce((sum, row) => sum + Number(row.gross), 0)
  const taxDrift = round2(creditTax - sumTax)
  const grossDrift = round2(creditTotal - sumGross)
  if (taxDrift === 0 && grossDrift === 0) return rows

  let target = 0
  for (let i = 1; i < rows.length; i += 1) {
    if (Number(rows[i]!.gross) > Number(rows[target]!.gross)) target = i
  }
  const row = rows[target]!
  const tax = round2(Number(row.tax) + taxDrift)
  const gross = round2(Number(row.gross) + grossDrift)
  rows[target] = {
    ratePercent: row.ratePercent,
    net: money(gross - tax),
    tax: money(tax),
    gross: money(gross),
  }
  return rows
}
