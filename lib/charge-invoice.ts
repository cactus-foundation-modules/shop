// The money on a paid charge's own VAT invoice (a redelivery fee).
//
// A charge paid after checkout is a separate supply on a separate day, so it
// gets a separate invoice: one line, the charge's own recorded net, VAT and
// gross, and nothing of the order's goods or delivery. It is never folded into
// the order's invoice - see chargeLinesToFold below for the one historical case
// that still is, and why.
//
// Pure, so the figures can be tested without a database. lib/invoices.ts raises
// the invoice itself (issueInvoiceForCharge).

import { formatRatePercent, type InvoiceExtraLine } from '@/modules/shop/lib/invoice-tax'
import type { ShpInvoiceLine, ShpInvoiceTaxRow, ShpOrder, ShpOrderCharge } from '@/modules/shop/lib/types'

export type ChargeInvoiceMoney = {
  subtotal: string
  discountAmount: string
  shippingAmount: string
  taxAmount: string
  total: string
  lines: ShpInvoiceLine[]
  taxBreakdown: ShpInvoiceTaxRow[]
}

/** The charge as an invoice line, in the order-line rate convention (0.2 for
 *  20%) - charges keep their rate as a percentage (20). */
export function chargeInvoiceLine(charge: Pick<ShpOrderCharge, 'reason' | 'netAmount' | 'taxAmount' | 'total' | 'taxRate'>): InvoiceExtraLine {
  return {
    name: charge.reason,
    net: Number(charge.netAmount),
    tax: Number(charge.taxAmount),
    gross: Number(charge.total),
    taxRatePercent: Number(charge.taxRate) / 100,
  }
}

/** Everything a charge's invoice says about money. The order is only read for
 *  its tax mode, so the line prints the way the rest of the shop's paperwork
 *  does; none of its figures come along.
 *
 *  Built directly rather than through buildInvoiceMoney: that one works out
 *  delivery's VAT as whatever the order's tax exceeds its goods' tax by, and an
 *  "order" of no goods would have the fee's own VAT read as delivery. One line
 *  at one rate needs no apportioning - the charge's recorded figures are the
 *  invoice. */
export function chargeInvoiceMoney(
  order: Pick<ShpOrder, 'taxMode'>,
  charge: Pick<ShpOrderCharge, 'reason' | 'netAmount' | 'taxAmount' | 'total' | 'taxRate'>,
): ChargeInvoiceMoney {
  const line = chargeInvoiceLine(charge)
  const net = line.net.toFixed(2)
  const tax = line.tax.toFixed(2)
  const gross = line.gross.toFixed(2)
  const ratePercent = formatRatePercent(line.taxRatePercent)
  const subtotal = order.taxMode === 'INCLUSIVE' ? gross : net
  const lines: ShpInvoiceLine[] = [{
    name: line.name,
    sku: null,
    quantity: 1,
    unitPrice: subtotal,
    lineTotal: subtotal,
    taxRatePercent: ratePercent,
    net,
    tax,
    gross,
    detail: [],
    orderItemId: null,
  }]
  return {
    subtotal,
    discountAmount: '0.00',
    shippingAmount: '0.00',
    taxAmount: tax,
    total: gross,
    lines,
    taxBreakdown: [{ ratePercent, net, tax, gross }],
  }
}

/**
 * The settled charges an ORDER invoice still carries as lines of its own.
 *
 * Only a PAID charge with no invoice of its own. Every charge paid from this
 * release on gets its own invoice the moment it is paid, and an order invoice
 * raised later first raises any that are missing (issueInvoiceForOrder), so on
 * a fresh order invoice this is always empty. What it still catches is a charge
 * paid before charge invoices existed, already folded into an order invoice:
 * a replacement for that invoice (a change of company, lib/invoice-reissue.ts)
 * must come out at the figures the original did.
 */
export function chargeLinesToFold(
  charges: readonly Pick<ShpOrderCharge, 'id' | 'status' | 'reason' | 'netAmount' | 'taxAmount' | 'total' | 'taxRate'>[],
  chargeIdsWithOwnInvoice: ReadonlySet<string>,
): InvoiceExtraLine[] {
  return charges
    .filter((charge) => charge.status === 'PAID' && !chargeIdsWithOwnInvoice.has(charge.id))
    .map(chargeInvoiceLine)
}
