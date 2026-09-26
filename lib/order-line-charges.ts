// The named charges folded into an order line's price - a delivery service
// priced per item, say - worked back out of it for anything that lists an order.
//
// Pure, and imports nothing but types, so the admin order screen (a client
// component) and the invoice arithmetic can share one answer. Two documents
// about the same order that split the delivery differently would be worse than
// either one not splitting it at all.
//
// The figure persisted on the line (LineMeta.charges) is PER UNIT and UNCLAMPED
// by design - the true cost of the service for one of them. What the shopper
// was shown, and what every listing of the order has to agree with, is that
// figure multiplied by the quantity and capped at the line's own total, scaling
// the whole set together where the cap bites - exactly what attributeCharges
// did in lib/checkout.ts when the basket first showed these rows.
//
// Nothing here adds money: every penny is already inside the line's total.

export type LineChargeAmount = { label: string; amount: number }

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

/** The line's charges as LINE totals, clamped to the line, rounded to the
 *  penny. Empty where the line carries none, or none worth printing. */
export function attributedLineCharges(charges: unknown, quantity: number, lineTotal: number): LineChargeAmount[] {
  if (!Array.isArray(charges) || charges.length === 0) return []
  const raw = charges
    .filter((c): c is { label: string; amount: unknown } => !!c && typeof c === 'object' && typeof (c as { label?: unknown }).label === 'string')
    .map((c) => ({ label: c.label, amount: Number(c.amount) * quantity }))
    .filter((c) => Number.isFinite(c.amount))
  const attributed = raw.reduce((sum, c) => sum + c.amount, 0)
  if (!(attributed > 0)) return []
  const cap = Math.max(0, lineTotal)
  const scale = attributed > cap ? cap / attributed : 1
  return raw
    .map((c) => ({ label: c.label, amount: round2(c.amount * scale) }))
    .filter((c) => c.amount > 0)
}

export type SplitOrderLine = {
  /** What the goods themselves cost, one of them, with the charges taken out. */
  goodsUnitPrice: number
  /** And all of them. */
  goodsTotal: number
  /** The charges taken out, as line totals. */
  charges: LineChargeAmount[]
}

/** One order line with its charges taken out of its price. A line carrying no
 *  charges comes back exactly as stored. */
export function splitOrderLine(line: {
  quantity: number
  unitPrice: string | number
  total: string | number
  lineMeta?: { charges?: unknown } | null
}): SplitOrderLine {
  const unitPrice = Number(line.unitPrice) || 0
  const total = Number(line.total) || 0
  const charges = attributedLineCharges(line.lineMeta?.charges, line.quantity, total)
  const chargeTotal = charges.reduce((sum, c) => sum + c.amount, 0)
  if (chargeTotal === 0) return { goodsUnitPrice: unitPrice, goodsTotal: total, charges }
  return {
    goodsUnitPrice: line.quantity > 0 ? round2(unitPrice - chargeTotal / line.quantity) : unitPrice,
    goodsTotal: round2(total - chargeTotal),
    charges,
  }
}

/** Every line's charges summed by label, in the order the lines first mention
 *  them - the rows a totals block prints underneath the goods subtotal. */
export function orderChargeRows(lines: Array<{ charges: LineChargeAmount[] }>): LineChargeAmount[] {
  const rows: LineChargeAmount[] = []
  for (const line of lines) {
    for (const charge of line.charges) {
      const row = rows.find((existing) => existing.label === charge.label)
      if (row) row.amount = round2(row.amount + charge.amount)
      else rows.push({ label: charge.label, amount: charge.amount })
    }
  }
  return rows
}
