import type { ShpInvoiceLine, ShpInvoiceTaxRow, ShpOrder, ShpOrderItem } from '@/modules/shop/lib/types'

// The arithmetic on an invoice, kept pure and kept here so it can be tested
// without a database (see invoice-tax.test.ts). Nothing in this file reads
// settings, the clock or the catalogue.
//
// Three rules decide everything below:
//
//  1. The invoice must add up to what was actually charged. Every figure is
//     derived from the order and its items as they were stored at checkout, and
//     the rows are reconciled at the end so the tax rows sum to the order's own
//     tax and the gross rows sum to its total. An invoice that disagrees with
//     the payment by a penny is worse than useless - it is a dispute.
//
//  2. A discount is an order-level thing (a coupon applies to the basket, not
//     to a line), so it is apportioned across lines by value - which is exactly
//     what resolveOrderTotals did when it worked the tax out in the first place.
//     Line money columns still show the line's own pre-discount total, because a
//     line that quietly showed its share of a coupon would not equal quantity
//     times price and would read as an error.
//
//  3. Delivery is rated as the goods it delivers are, apportioned by value.
//     Same method, same reasoning, as shippingTaxAmount in lib/checkout.ts: on
//     the ordinary single-rate shop it lands wholly on that rate, and a basket
//     of zero-rated goods lands on zero without any special pleading.

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function money(value: number): string {
  return round2(value).toFixed(2)
}

/** A tax rate as it is printed: 0.2 -> "20", 0.175 -> "17.5". Trailing zeroes
 *  dropped, because "20%" is how a rate is written and "20.00%" is not. */
export function formatRatePercent(rate: number): string {
  const percent = round2(rate * 100)
  return String(Number(percent.toFixed(2)))
}

/** One order line's detail rows, taken from the personalisation snapshot the
 *  cart-line resolvers wrote. Never re-resolved: the invoice records what was
 *  bought, not what the product page would say about it today.
 *
 *  The delivery field is dropped. A line's batch names the field it restates
 *  (`fieldLabel` - see LineMeta), and that field is a promise about when
 *  something will turn up: it belongs on a confirmation email, where it is still
 *  a live question. An invoice is a record of what was charged, it is read
 *  months later by an accountant, and "by Wednesday 2nd of September" is by then
 *  either history or wrong. */
function lineDetail(item: ShpOrderItem): { label: string; value: string }[] {
  const fields = item.lineMeta?.fields
  if (!Array.isArray(fields)) return []
  const deliveryLabel = item.lineMeta?.batch?.fieldLabel?.trim().toLowerCase() ?? ''
  return fields
    .filter((field) => field && typeof field.label === 'string' && typeof field.value === 'string')
    .filter((field) => !deliveryLabel || field.label.trim().toLowerCase() !== deliveryLabel)
    .map((field) => ({ label: field.label, value: field.value }))
}

export type InvoiceMoney = {
  lines: ShpInvoiceLine[]
  taxBreakdown: ShpInvoiceTaxRow[]
}

/**
 * Turns an order and its items into invoice lines and a net/tax/gross summary
 * per rate.
 *
 * `order.taxAmount` is authoritative for the total tax - it is what was charged
 * - so the per-rate rows are reconciled against it rather than recomputed from
 * scratch and hoped over.
 */
export function buildInvoiceMoney(order: ShpOrder, items: ShpOrderItem[]): InvoiceMoney {
  const inclusive = order.taxMode === 'INCLUSIVE'
  const subtotal = Number(order.subtotal)
  const discountAmount = Number(order.discountAmount)
  const shippingAmount = Number(order.shippingAmount)
  const orderTax = Number(order.taxAmount)
  const orderTotal = Number(order.total)

  // The same ratio resolveOrderTotals used to spread the discount across lines.
  const discountRatio = subtotal > 0 ? Math.min(discountAmount / subtotal, 1) : 0

  type Bucket = { rate: number; net: number; tax: number; gross: number; taxable: number }
  const buckets = new Map<string, Bucket>()
  const lines: ShpInvoiceLine[] = []
  let goodsTax = 0
  let taxableTotal = 0

  for (const item of items) {
    const rate = Number(item.taxRate) || 0
    const lineTotal = Number(item.total) || 0
    // Post-discount, which is the base the tax was worked out on at checkout.
    const taxable = lineTotal * (1 - discountRatio)
    // The tax stored on the line, not a fresh calculation: that figure is what
    // the customer paid, and a recomputation here would silently "correct" an
    // order placed under a rate that has since changed.
    const tax = Number(item.taxAmount) || 0
    const net = inclusive ? taxable - tax : taxable
    const gross = inclusive ? taxable : taxable + tax

    goodsTax += tax
    taxableTotal += taxable

    const key = formatRatePercent(rate)
    const bucket = buckets.get(key) ?? { rate, net: 0, tax: 0, gross: 0, taxable: 0 }
    bucket.net += net
    bucket.tax += tax
    bucket.gross += gross
    bucket.taxable += taxable
    buckets.set(key, bucket)

    lines.push({
      name: item.productName,
      sku: item.productSku,
      quantity: item.quantity,
      unitPrice: money(Number(item.unitPrice) || 0),
      lineTotal: money(lineTotal),
      taxRatePercent: key,
      net: money(net),
      tax: money(tax),
      gross: money(gross),
      detail: lineDetail(item),
    })
  }

  // Delivery. Its tax is whatever the order carries over and above the goods',
  // which keeps this tied to the charged figure instead of re-deriving a rate
  // that may since have been edited in the tax table.
  const deliveryTax = Math.max(0, round2(orderTax - goodsTax))
  if (shippingAmount > 0 || deliveryTax > 0) {
    const shares: { key: string; share: number }[] = []
    if (taxableTotal > 0) {
      for (const [key, bucket] of buckets) shares.push({ key, share: bucket.taxable / taxableTotal })
    }
    if (shares.length === 0) {
      // Delivery on its own (a zero-value basket, or an order whose lines have
      // all been priced at nothing). It still needs a row, and the rate it
      // implies is the honest one to print.
      const impliedRate = shippingAmount > 0 && deliveryTax > 0
        ? (inclusive ? deliveryTax / Math.max(shippingAmount - deliveryTax, 0.01) : deliveryTax / shippingAmount)
        : 0
      shares.push({ key: formatRatePercent(impliedRate), share: 1 })
      if (!buckets.has(shares[0]!.key)) {
        buckets.set(shares[0]!.key, { rate: impliedRate, net: 0, tax: 0, gross: 0, taxable: 0 })
      }
    }
    // The CHARGE is split by value; the TAX on each slice is that slice's own
    // rate. Splitting the tax by value instead would hand a zero-rated row a
    // share of VAT, which is not a rounding quibble - it is a wrong return.
    const slices = shares.map(({ key, share }) => {
      const bucket = buckets.get(key)!
      const charge = shippingAmount * share
      const tax = inclusive ? charge - charge / (1 + bucket.rate) : charge * bucket.rate
      return { key, charge, tax }
    })
    // Scaled to the delivery tax the order actually carries, so the rows still
    // sum to the charged figure when the rate table has moved since.
    const sliceTax = slices.reduce((sum, slice) => sum + slice.tax, 0)
    const scale = sliceTax > 0 ? deliveryTax / sliceTax : 0
    for (const slice of slices) {
      const bucket = buckets.get(slice.key)!
      const tax = slice.tax * scale
      bucket.tax += tax
      bucket.net += inclusive ? slice.charge - tax : slice.charge
      bucket.gross += inclusive ? slice.charge : slice.charge + tax
    }
  }

  // Rows out, biggest first - which is the order an invoice reads in, and the
  // order the reconciliation below relies on.
  const rows: ShpInvoiceTaxRow[] = [...buckets.entries()]
    .sort((a, b) => b[1].rate - a[1].rate)
    .map(([key, bucket]) => ({
      ratePercent: key,
      net: money(bucket.net),
      tax: money(bucket.tax),
      gross: money(bucket.gross),
    }))

  return { lines, taxBreakdown: reconcile(rows, orderTax, orderTotal) }
}

/**
 * Nudges the largest row so the summary sums exactly to the order's own tax and
 * total. Apportioning by value in floating point leaves pennies about; a VAT
 * summary that is a penny out from the payment is the sort of thing that gets
 * an invoice sent back, and "which row absorbs the rounding" is a presentation
 * question rather than an accounting one.
 */
function reconcile(rows: ShpInvoiceTaxRow[], orderTax: number, orderTotal: number): ShpInvoiceTaxRow[] {
  if (rows.length === 0) return rows
  const sumTax = rows.reduce((sum, row) => sum + Number(row.tax), 0)
  const sumGross = rows.reduce((sum, row) => sum + Number(row.gross), 0)
  const taxDrift = round2(orderTax - sumTax)
  const grossDrift = round2(orderTotal - sumGross)
  if (taxDrift === 0 && grossDrift === 0) return rows

  // The biggest gross row absorbs it: the smallest relative distortion, and on
  // the overwhelmingly common single-rate shop there is only one row anyway.
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
