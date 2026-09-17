// How a validated basket's line prices add up on the cart page and in the slide-out
// panel. Both surfaces read the same validate response (line subtotals already
// include any per-line charges, each line carries its own tax rate), so one
// helper keeps the two from drifting.

export type BasketTotalsLine = {
  lineSubtotal: number
  taxRate?: number
  charges?: { label: string; amount: number }[] | null
}

export type BasketTotals = {
  lineTotal: number
  /** Goods only - line total minus named charges broken out by resolvers. */
  subtotal: number
  chargeRows: { label: string; amount: number }[]
  taxAmount: number
  total: number
}

export function computeBasketTotals(
  lines: BasketTotalsLine[],
  taxMode: 'INCLUSIVE' | 'EXCLUSIVE',
): BasketTotals {
  const lineTotal = lines.reduce((sum, l) => sum + l.lineSubtotal, 0)
  const chargeRows: { label: string; amount: number }[] = []
  for (const line of lines) {
    for (const charge of line.charges ?? []) {
      const row = chargeRows.find((r) => r.label === charge.label)
      if (row) row.amount += charge.amount
      else chargeRows.push({ label: charge.label, amount: charge.amount })
    }
  }
  const chargeTotal = chargeRows.reduce((sum, r) => sum + r.amount, 0)
  const subtotal = lineTotal - chargeTotal
  const taxAmount = lines.reduce((sum, l) => {
    const rate = l.taxRate ?? 0
    if (rate <= 0) return sum
    return sum + (taxMode === 'INCLUSIVE' ? l.lineSubtotal - l.lineSubtotal / (1 + rate) : l.lineSubtotal * rate)
  }, 0)
  const total = taxMode === 'INCLUSIVE' ? lineTotal : lineTotal + taxAmount
  return { lineTotal, subtotal, chargeRows, taxAmount, total }
}
