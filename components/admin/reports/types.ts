import { formatMoney } from '@/modules/shop/lib/money'
import type { Grouping } from './charts'

// The shapes app/api/admin/reports/sales and /profits answer with.

export type Kpis = {
  orders: number; gross: number; net: number; tax: number; shipping: number; discount: number
  customers: number; units: number; refunds: number; refundsNet: number; refundCount: number; aov: number
  newCustomers?: number; returningCustomers?: number
}

export type SalesReport = {
  period: { from: string; to: string; previousFrom: string; previousTo: string; days: number; grouping: Grouping; timezone: string }
  kpis: { current: Kpis; previous: Kpis }
  series: Array<{ bucket: string; orders: number; gross: number; net: number; refunds: number; previousNet: number | null; previousOrders: number | null }>
  byMethod: Array<{ key: string; orders: number; gross: number }>
  byStatus: Array<{ key: string; orders: number; gross: number }>
  heatmap: Array<{ dow: number; hour: number; orders: number; gross: number }>
  products: Array<{ id: string | null; name: string; sku: string | null; units: number; orders: number; net: number; previousNet: number }>
  customers: Array<{ email: string; name: string; organisation: string | null; orders: number; gross: number; net: number; firstAt: string; lastAt: string; member: boolean; isNew: boolean }>
}

export type OrderCost = { source: string; ref: string; label?: string; path?: string; status?: string; invoicedOn?: string; amount: number; basis: 'billed' | 'ordered' }

export type ProfitRow = {
  id: string; orderNumber: string; paidAt: string; customer: string; email: string; organisation: string | null
  status: string; paymentStatus: string; paymentMethod: string; units: number
  gross: number; net: number; shipping: number; discount: number; charges: number; refunds: number
  income: number; cost: number; profit: number; margin: number | null
  basis: 'none' | 'billed' | 'ordered' | 'mixed'
  costs: OrderCost[]
}

export type ProfitsReport = {
  period: { from: string; to: string; days: number; grouping: Grouping; timezone: string }
  providers: string[]
  failed: string[]
  truncated: boolean
  orders: ProfitRow[]
}

/** Money with a proper minus sign in front of the symbol: "−£12.00", never "£-12.00". */
export function money(v: number, symbol: string): string {
  return v < 0 ? `−${formatMoney(-v, symbol)}` : formatMoney(v, symbol)
}

/** Axis money: "£1.2k", "£15k", "£2.4m". */
export function compactMoney(v: number, symbol: string): string {
  const a = Math.abs(v)
  const sign = v < 0 ? '−' : ''
  if (a >= 1_000_000) return `${sign}${symbol}${(a / 1_000_000).toFixed(a >= 10_000_000 ? 0 : 1)}m`
  if (a >= 1_000) return `${sign}${symbol}${(a / 1_000).toFixed(a >= 10_000 ? 0 : 1)}k`
  return `${sign}${symbol}${a.toFixed(0)}`
}

export const count = (v: number) => Math.round(v).toLocaleString('en-GB')
export const pct = (v: number | null) => (v == null ? '—' : `${v.toFixed(1)}%`)

/** Day/month with no padding and no year: "4/11". */
export function dayMonth(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`)
  return `${d.getUTCDate()}/${d.getUTCMonth() + 1}`
}

export function shortDate(iso: string): string {
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso.length === 16 ? `${iso}:00Z` : iso)
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}
