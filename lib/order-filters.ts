import type { ListOrdersFilter, OrderFulfilment, OrderSort } from '@/modules/shop/lib/db/orders'
import type { ShpOrderStatus, ShpPaymentStatus } from '@/modules/shop/lib/types'

// One reading of the orders list's query string, shared by the list route and
// the CSV export. Export exists to hand someone the rows they are looking at,
// so the two have to agree on what "the rows they are looking at" means - a
// second parser would eventually export a different set than the screen shows.

const STATUSES: ShpOrderStatus[] = ['PENDING', 'PROCESSING', 'SHIPPED', 'COMPLETED', 'CANCELLED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'ON_HOLD']
const PAYMENT_STATUSES: Array<ShpPaymentStatus | 'UNPAID'> = ['UNPAID', 'PENDING', 'PAID', 'PARTIALLY_REFUNDED', 'REFUNDED', 'FAILED', 'AWAITING_CONFIRMATION']
const FULFILMENTS: OrderFulfilment[] = ['UNDISPATCHED', 'PARTIAL', 'DISPATCHED']
const SORTS: OrderSort[] = ['newest', 'oldest', 'total-desc', 'total-asc', 'customer-asc', 'status']

function pick<T extends string>(value: string | null, allowed: T[]): T | undefined {
  return value && (allowed as string[]).includes(value) ? (value as T) : undefined
}

// A date that does not parse is dropped rather than throwing: a hand-edited URL
// should show an unfiltered list, not a 500.
function pickDate(value: string | null, endOfDay = false): Date | undefined {
  if (!value) return undefined
  const parsed = new Date(endOfDay && /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T23:59:59.999` : value)
  return Number.isNaN(parsed.getTime()) ? undefined : parsed
}

export function parseOrderListFilter(params: URLSearchParams): ListOrdersFilter {
  return {
    status: pick(params.get('status'), STATUSES),
    paymentStatus: pick(params.get('paymentStatus'), PAYMENT_STATUSES),
    fulfilment: pick(params.get('fulfilment'), FULFILMENTS),
    sort: pick(params.get('sort'), SORTS),
    search: params.get('search')?.trim() || undefined,
    preOrder: params.get('preOrder') === 'true',
    openOnly: params.get('open') === '1',
    dateFrom: pickDate(params.get('dateFrom')),
    dateTo: pickDate(params.get('dateTo'), true),
    page: params.get('page') ? Number(params.get('page')) : undefined,
    perPage: params.get('perPage') ? Number(params.get('perPage')) : undefined,
  }
}
