import { NextRequest, NextResponse } from 'next/server'
import { requireShopUser } from '@/modules/shop/lib/access'
import { toCsvRow } from '@/modules/shop/lib/csv'
import { getOrderById, getOrderRowMetrics, listOrders } from '@/modules/shop/lib/db/orders'
import { parseOrderListFilter } from '@/modules/shop/lib/order-filters'
import { orderCompanyName } from '@/modules/shop/lib/order-display'
import type { ShpAddress } from '@/modules/shop/lib/types'

// A download of whatever the orders screen is currently showing - same filters,
// same order, read through the same parser (lib/order-filters.ts) so the file
// cannot quietly contain a different set of orders than the screen does.
//
// One row per order, not per line: this is the export an owner reconciles
// against their bank statement or hands to an accountant, and a per-line file
// makes every total appear several times over. Amounts go out unformatted and
// unsymbolled (7.99, not £7.99) so a spreadsheet reads them as numbers.

const COLUMNS = [
  // 'kind' and 'replacement_for' sit at the front rather than the back: a £0
  // row in an accounts export is a question, and the answer has to be beside
  // the order number rather than thirty columns to the right of it.
  'order_number', 'kind', 'replacement_for', 'placed_at', 'status', 'payment_status', 'payment_method', 'payment_reference', 'paid_at',
  'customer_name', 'customer_organisation', 'customer_reference', 'customer_email', 'customer_phone', 'account_holder',
  'items', 'units', 'dispatched_units', 'refunded_units', 'outstanding_units',
  'subtotal', 'discount', 'coupon_code', 'shipping', 'shipping_method', 'tax', 'tax_mode', 'total', 'currency',
  'delivery_line1', 'delivery_line2', 'delivery_city', 'delivery_county', 'delivery_postcode', 'delivery_country',
] as const

function iso(date: Date | null): string {
  return date ? new Date(date).toISOString() : ''
}

function addressPart(address: ShpAddress | null, key: keyof ShpAddress): string {
  return (address?.[key] as string | undefined) ?? ''
}

export async function GET(request: NextRequest) {
  const gate = await requireShopUser('shop.orders')
  if (gate.error) return gate.error

  const filter = parseOrderListFilter(request.nextUrl.searchParams)
  // Paging belongs to the screen, not to the file: an export of "page 2 of the
  // unpaid orders" is nobody's idea of a useful spreadsheet. Capped rather than
  // unbounded so one click can never try to stream the whole history at once.
  const { orders } = await listOrders({ ...filter, page: 1, perPage: 5000 })
  const metrics = await getOrderRowMetrics(orders.map((o) => o.id))

  // The parents named by any replacements in the export, so the file can print
  // a number rather than an id. One query, and none at all on the export that
  // holds no replacements - which is nearly all of them.
  const parentIds = [...new Set(orders.map((o) => o.parentOrderId).filter((id): id is string => Boolean(id)))]
  const parentNumbers = new Map(
    (await Promise.all(parentIds.map((id) => getOrderById(id))))
      .filter((o): o is NonNullable<typeof o> => o !== null)
      .map((o) => [o.id, o.orderNumber]),
  )

  const rows = orders.map((order) => {
    const m = metrics[order.id]
    const address = order.shippingAddress ?? null
    return toCsvRow([
      order.orderNumber,
      order.kind,
      // The parent's NUMBER, not its id: this is a spreadsheet somebody reads.
      // Blank on a sale, and blank on the rare replacement whose parent has
      // since been deleted - the foreign key clears rather than cascades.
      order.parentOrderId ? parentNumbers.get(order.parentOrderId) ?? '' : '',
      iso(order.createdAt),
      order.status,
      order.paymentStatus,
      order.paymentMethod,
      order.paymentReference ?? '',
      iso(order.paidAt),
      order.customerName,
      // One column, not two: an order placed before the organisation moved off
      // the delivery address still exports what it was given - see
      // orderCompanyName.
      orderCompanyName(order) ?? '',
      // Their number for the order, not ours. The column a finance team
      // reconciles the export against.
      order.customerReference ?? '',
      order.customerEmail,
      order.customerPhone ?? '',
      order.memberId ? 'yes' : 'no',
      String(m?.lineCount ?? 0),
      String(m?.unitCount ?? 0),
      String(m?.dispatchedUnits ?? 0),
      String(m?.refundedUnits ?? 0),
      String(m?.outstandingUnits ?? 0),
      order.subtotal,
      order.discountAmount,
      order.couponCode ?? '',
      order.shippingAmount,
      order.shippingRateName ?? '',
      order.taxAmount,
      order.taxMode,
      order.total,
      order.currency,
      addressPart(address, 'line1'),
      addressPart(address, 'line2'),
      addressPart(address, 'city'),
      addressPart(address, 'county'),
      addressPart(address, 'postcode'),
      addressPart(address, 'country'),
    ])
  })

  const csv = [toCsvRow([...COLUMNS]), ...rows].join('\r\n')
  return new NextResponse(csv, {
    headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="orders-export.csv"' },
  })
}
