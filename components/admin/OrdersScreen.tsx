'use client'

import { useCallback, useEffect, useState } from 'react'
import { useAdminPath } from '@/components/admin/AdminPathContext'
import { ordersScreenCss } from '@/modules/shop/components/admin/orders-screen-css'
import {
  ORDER_STATUS_BADGE,
  PAYMENT_STATUS_BADGE,
  SETTABLE_STATUSES,
  badgeFor,
  fulfilmentBadge,
  paymentMethodLabel,
  relativeTime,
} from '@/modules/shop/components/admin/order-labels'
import { orderCompanyName } from '@/modules/shop/lib/order-display'
import { formatMoney } from '@/modules/shop/lib/money'
import { useCurrencySymbol } from '@/modules/shop/components/admin/use-currency-symbol'
import { useAlert, useConfirm } from '@/modules/shop/components/admin/dialogs'
import type { ShpAddress } from '@/modules/shop/lib/types'

type OrderRow = {
  id: string
  orderNumber: string
  status: string
  paymentStatus: string
  paymentMethod: string
  customerName: string
  customerEmail: string
  // Carried so the list can lead with the organisation an order was placed on
  // behalf of. The addresses come too, for orders placed while it lived in the
  // delivery address - they arrive whole from the list route and picking them
  // apart server-side would buy nothing.
  customerOrganisation?: string | null
  shippingAddress?: ShpAddress | null
  billingAddress?: ShpAddress | null
  memberId: string | null
  total: string
  createdAt: string
}
type RowMetrics = {
  lineCount: number
  unitCount: number
  refundedUnits: number
  dispatchedUnits: number
  outstandingUnits: number
  hasPreOrder: boolean
}
type Overview = {
  awaitingPayment: number
  toDispatch: number
  preOrdersOutstanding: number
  paidOrders30d: number
  revenue30d: string
}

// Every control on the screen lives in one object, which is also exactly what
// goes in the query string. That is what makes a filtered list linkable, gives
// the browser's back button something sensible to do, and lets a tile at the
// top set three filters at once without a special case per tile.
type Filters = {
  search: string
  status: string
  paymentStatus: string
  fulfilment: string
  preOrder: boolean
  openOnly: boolean
  dateFrom: string
  dateTo: string
  sort: string
  page: number
  perPage: number
}

const DEFAULTS: Filters = {
  search: '', status: '', paymentStatus: '', fulfilment: '', preOrder: false, openOnly: false,
  dateFrom: '', dateTo: '', sort: 'newest', page: 1, perPage: 25,
}

const STATUS_TABS: Array<{ value: string; label: string }> = [
  { value: '', label: 'All' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'PROCESSING', label: 'Processing' },
  { value: 'SHIPPED', label: 'Dispatched' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'ON_HOLD', label: 'On hold' },
  { value: 'CANCELLED', label: 'Cancelled' },
]

const DATE_PRESETS: Array<{ value: string; label: string; days: number | null }> = [
  { value: '', label: 'Any date', days: null },
  { value: '7', label: 'Last 7 days', days: 7 },
  { value: '30', label: 'Last 30 days', days: 30 },
  { value: '90', label: 'Last 90 days', days: 90 },
  { value: '365', label: 'Last 12 months', days: 365 },
]

function isoDay(daysAgo: number): string {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  return d.toISOString().slice(0, 10)
}

function filtersToParams(f: Filters): URLSearchParams {
  const p = new URLSearchParams()
  if (f.search) p.set('search', f.search)
  if (f.status) p.set('status', f.status)
  if (f.paymentStatus) p.set('paymentStatus', f.paymentStatus)
  if (f.fulfilment) p.set('fulfilment', f.fulfilment)
  if (f.preOrder) p.set('preOrder', 'true')
  if (f.openOnly) p.set('open', '1')
  if (f.dateFrom) p.set('dateFrom', f.dateFrom)
  if (f.dateTo) p.set('dateTo', f.dateTo)
  if (f.sort && f.sort !== DEFAULTS.sort) p.set('sort', f.sort)
  if (f.page > 1) p.set('page', String(f.page))
  if (f.perPage !== DEFAULTS.perPage) p.set('perPage', String(f.perPage))
  return p
}

function paramsToFilters(p: URLSearchParams): Filters {
  return {
    search: p.get('search') ?? '',
    status: p.get('status') ?? '',
    paymentStatus: p.get('paymentStatus') ?? '',
    fulfilment: p.get('fulfilment') ?? '',
    preOrder: p.get('preOrder') === 'true',
    openOnly: p.get('open') === '1',
    dateFrom: p.get('dateFrom') ?? '',
    dateTo: p.get('dateTo') ?? '',
    sort: p.get('sort') ?? DEFAULTS.sort,
    page: Math.max(1, Number(p.get('page')) || 1),
    perPage: Math.min(200, Math.max(5, Number(p.get('perPage')) || DEFAULTS.perPage)),
  }
}

export function OrdersScreen() {
  const adminPath = useAdminPath()
  const currencySymbol = useCurrencySymbol()
  const [alert, alertNode] = useAlert()
  const [confirm, confirmNode] = useConfirm()

  // Read straight from the address bar on first render so a link to a filtered
  // list opens on that list rather than flashing the default one first.
  const [filters, setFilters] = useState<Filters>(() =>
    typeof window === 'undefined' ? DEFAULTS : paramsToFilters(new URLSearchParams(window.location.search))
  )
  const [searchBox, setSearchBox] = useState(filters.search)

  const [orders, setOrders] = useState<OrderRow[]>([])
  const [metrics, setMetrics] = useState<Record<string, RowMetrics>>({})
  const [overview, setOverview] = useState<Overview | null>(null)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkStatus, setBulkStatus] = useState<string>('PROCESSING')
  const [bulkEmail, setBulkEmail] = useState(true)
  const [busy, setBusy] = useState(false)
  const [menuFor, setMenuFor] = useState<{ id: string; x: number; y: number } | null>(null)
  // Bumped whenever something changes an order, so the counters at the top are
  // re-read rather than sitting there stale after a bulk change.
  const [overviewToken, setOverviewToken] = useState(0)

  function update(patch: Partial<Filters>) {
    // Any change to what is being looked at goes back to page one - staying on
    // page 4 of a list that now has two pages shows an empty screen and reads
    // as "no orders".
    setFilters((f) => ({ ...f, page: 1, ...patch }))
  }

  // Debounce the search box into the filter object.
  useEffect(() => {
    if (searchBox === filters.search) return
    const t = setTimeout(() => update({ search: searchBox }), 250)
    return () => clearTimeout(t)
  }, [searchBox, filters.search])

  // Keep the address bar in step, without pushing a history entry per keystroke.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const query = filtersToParams(filters).toString()
    const url = query ? `${window.location.pathname}?${query}` : window.location.pathname
    window.history.replaceState(null, '', url)
  }, [filters])

  const refresh = useCallback(() => {
    setLoading(true)
    setError(null)
    const params = filtersToParams(filters)
    params.set('page', String(filters.page))
    params.set('perPage', String(filters.perPage))
    fetch(`/api/m/shop/admin/orders?${params}`)
      .then(async (r) => {
        if (!r.ok) {
          setError('Those orders could not be loaded. Try again in a moment.')
          return
        }
        const data = await r.json()
        setOrders(data.orders ?? [])
        setMetrics(data.metrics ?? {})
        setTotal(data.total ?? 0)
        // Drop the selection whenever the view changes - a bulk action must
        // never touch a row that is no longer on screen.
        setSelected(new Set())
      })
      .catch(() => setError('Those orders could not be loaded. Try again in a moment.'))
      .finally(() => setLoading(false))
  }, [filters])

  // refresh() flips `loading` on before awaiting the fetch - one deliberate
  // re-render, not a cascade; every other setState it makes runs after the await.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(refresh, [refresh])

  // The counters are their own call: they cover the whole shop rather than the
  // current filter, so paging through a list has no business re-running them.
  useEffect(() => {
    fetch('/api/m/shop/admin/orders?perPage=1&stats=1')
      .then(async (r) => { if (r.ok) setOverview((await r.json()).overview ?? null) })
      .catch(() => {})
  }, [overviewToken])

  // A fixed-position menu would drift away from its button on scroll.
  useEffect(() => {
    if (!menuFor) return
    const close = () => setMenuFor(null)
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [menuFor])

  function toggle(id: string) {
    setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }
  const allOnPage = orders.length > 0 && orders.every((o) => selected.has(o.id))
  const someOnPage = orders.some((o) => selected.has(o.id))

  async function setStatusFor(ids: string[], status: string, sendEmail: boolean) {
    setBusy(true)
    const res = await fetch('/api/m/shop/admin/orders/bulk', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'status', ids, status, sendEmail }),
    })
    setBusy(false)
    if (!res.ok) {
      await alert(((await res.json().catch(() => ({}))) as { error?: string }).error ?? 'That change could not be made.')
      return
    }
    const result = await res.json() as { updated: number; unchanged: number; failures: Array<{ orderNumber: string; error: string }> }
    refresh()
    setOverviewToken((n) => n + 1)
    if (result.failures.length > 0) {
      // Named one by one: "3 of 12 failed" tells an owner nothing about which
      // three to go and look at.
      await alert(
        `${result.updated} order${result.updated === 1 ? '' : 's'} updated.\n\n` +
        result.failures.map((f) => `${f.orderNumber}: ${f.error}`).join('\n\n'),
        'Some orders were left as they were'
      )
    }
  }

  async function bulkApply() {
    const ids = [...selected]
    const label = ORDER_STATUS_BADGE[bulkStatus]?.label ?? bulkStatus
    if (!(await confirm({
      title: `Mark ${ids.length} order${ids.length === 1 ? '' : 's'} as ${label.toLowerCase()}?`,
      message: bulkEmail
        ? 'Each customer will be emailed about the change, where there is a message set up for it.'
        : 'No emails will be sent.',
      confirmLabel: 'Change status',
      danger: bulkStatus === 'CANCELLED',
    }))) return
    await setStatusFor(ids, bulkStatus, bulkEmail)
  }

  function openMenu(e: React.MouseEvent<HTMLButtonElement>, id: string) {
    const r = e.currentTarget.getBoundingClientRect()
    setMenuFor((cur) => (cur?.id === id ? null : { id, x: r.right, y: r.bottom + 4 }))
  }

  async function copy(text: string, what: string) {
    setMenuFor(null)
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      await alert(`${what} could not be copied - your browser would not allow it. It is: ${text}`)
    }
  }

  const pageCount = Math.max(1, Math.ceil(total / filters.perPage))
  const firstOnPage = total === 0 ? 0 : (filters.page - 1) * filters.perPage + 1
  const lastOnPage = Math.min(filters.page * filters.perPage, total)
  const hasFilters = Boolean(
    filters.search || filters.status || filters.paymentStatus || filters.fulfilment ||
    filters.preOrder || filters.openOnly || filters.dateFrom || filters.dateTo
  )
  const menuOrder = menuFor ? orders.find((o) => o.id === menuFor.id) : null
  const datePreset = DATE_PRESETS.find((p) => p.days != null && filters.dateFrom === isoDay(p.days) && !filters.dateTo)?.value ?? (filters.dateFrom || filters.dateTo ? 'custom' : '')

  // A tile is "on" when the list is already showing exactly what it counts.
  const tileActive = {
    unpaid: filters.paymentStatus === 'UNPAID' && filters.openOnly,
    dispatch: filters.paymentStatus === 'PAID' && filters.fulfilment === 'UNDISPATCHED' && filters.openOnly,
    preOrder: filters.preOrder && filters.openOnly,
  }

  function clearFilters() {
    setSearchBox('')
    setFilters({ ...DEFAULTS, perPage: filters.perPage, sort: filters.sort })
  }

  return (
    <div>
      <style dangerouslySetInnerHTML={{ __html: ordersScreenCss }} />

      <div className="page-header">
        <div>
          <h1 className="page-title">Orders</h1>
          {!loading && <p className="sox-count">{total} order{total === 1 ? '' : 's'}{hasFilters ? ' match these filters' : ''}</p>}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <a className="btn btn-secondary btn-sm" href={`/api/m/shop/admin/orders/export?${filtersToParams(filters)}`}>Export CSV</a>
        </div>
      </div>

      <div className="sox-tiles">
        <button
          type="button"
          className={`sox-tile${tileActive.unpaid ? ' is-active' : ''}${overview && overview.awaitingPayment > 0 ? ' is-attention' : ''}`}
          onClick={() => update(tileActive.unpaid ? { paymentStatus: '', openOnly: false } : { paymentStatus: 'UNPAID', openOnly: true, status: '', fulfilment: '', preOrder: false })}
        >
          <span className="sox-tile-label">Awaiting payment</span>
          <span className="sox-tile-value">{overview?.awaitingPayment ?? '—'}</span>
          <span className="sox-tile-note">Money not in yet</span>
        </button>
        <button
          type="button"
          className={`sox-tile${tileActive.dispatch ? ' is-active' : ''}${overview && overview.toDispatch > 0 ? ' is-attention' : ''}`}
          onClick={() => update(tileActive.dispatch ? { paymentStatus: '', fulfilment: '', openOnly: false } : { paymentStatus: 'PAID', fulfilment: 'UNDISPATCHED', openOnly: true, status: '', preOrder: false })}
        >
          <span className="sox-tile-label">To send</span>
          <span className="sox-tile-value">{overview?.toDispatch ?? '—'}</span>
          <span className="sox-tile-note">Paid, nothing gone out</span>
        </button>
        <button
          type="button"
          className={`sox-tile${tileActive.preOrder ? ' is-active' : ''}`}
          onClick={() => update(tileActive.preOrder ? { preOrder: false, openOnly: false } : { preOrder: true, openOnly: true, status: '', paymentStatus: '', fulfilment: '' })}
        >
          <span className="sox-tile-label">Pre-orders</span>
          <span className="sox-tile-value">{overview?.preOrdersOutstanding ?? '—'}</span>
          <span className="sox-tile-note">Waiting on stock</span>
        </button>
        {/* Revenue is counted by the day the money landed, which is not the date
            the list filters on, so this one deliberately does not link anywhere
            rather than sending an owner to a list that disagrees with it. */}
        <div className="sox-tile is-static">
          <span className="sox-tile-label">Last 30 days</span>
          <span className="sox-tile-value">{overview ? formatMoney(overview.revenue30d, currencySymbol) : '—'}</span>
          <span className="sox-tile-note">{overview ? `${overview.paidOrders30d} paid order${overview.paidOrders30d === 1 ? '' : 's'}` : 'Taken so far'}</span>
        </div>
      </div>

      <div className="sox-toolbar">
        <input
          className="sox-search"
          aria-label="Search orders"
          placeholder="Search by order number, organisation, name or email…"
          value={searchBox}
          onChange={(e) => setSearchBox(e.target.value)}
        />
        <div className="sox-seg" role="group" aria-label="Filter by status">
          {STATUS_TABS.map((t) => (
            <button key={t.value} type="button" className={filters.status === t.value ? 'is-active' : ''} onClick={() => update({ status: t.value })}>{t.label}</button>
          ))}
        </div>
      </div>

      <div className="sox-filters">
        <span className="sox-filters-label">Narrow it down</span>
        <select className="sox-select" aria-label="Filter by payment" value={filters.paymentStatus} onChange={(e) => update({ paymentStatus: e.target.value })}>
          <option value="">Any payment</option>
          <option value="UNPAID">Unpaid (still owed)</option>
          <option value="PAID">Paid</option>
          <option value="AWAITING_CONFIRMATION">Awaiting confirmation</option>
          <option value="PARTIALLY_REFUNDED">Part refunded</option>
          <option value="REFUNDED">Refunded</option>
          <option value="FAILED">Payment failed</option>
        </select>
        <select className="sox-select" aria-label="Filter by dispatch" value={filters.fulfilment} onChange={(e) => update({ fulfilment: e.target.value })}>
          <option value="">Any dispatch state</option>
          <option value="UNDISPATCHED">Nothing sent yet</option>
          <option value="PARTIAL">Partly dispatched</option>
          <option value="DISPATCHED">All dispatched</option>
        </select>
        <select
          className="sox-select"
          aria-label="Filter by date"
          value={datePreset}
          onChange={(e) => {
            const preset = DATE_PRESETS.find((p) => p.value === e.target.value)
            if (!preset) return
            update({ dateFrom: preset.days == null ? '' : isoDay(preset.days), dateTo: '' })
          }}
        >
          {DATE_PRESETS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          {datePreset === 'custom' && <option value="custom">Custom range</option>}
        </select>
        <input className="sox-date" type="date" aria-label="From date" value={filters.dateFrom} onChange={(e) => update({ dateFrom: e.target.value })} />
        <input className="sox-date" type="date" aria-label="To date" value={filters.dateTo} onChange={(e) => update({ dateTo: e.target.value })} />
        <div className="sox-seg" role="group" aria-label="Extra filters">
          <button type="button" className={filters.preOrder ? 'is-active' : ''} onClick={() => update({ preOrder: !filters.preOrder })}>Pre-orders only</button>
          <button type="button" className={filters.openOnly ? 'is-active' : ''} onClick={() => update({ openOnly: !filters.openOnly })}>Hide cancelled</button>
        </div>
        <select className="sox-select" aria-label="Sort" value={filters.sort} onChange={(e) => update({ sort: e.target.value })}>
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="total-desc">Biggest first</option>
          <option value="total-asc">Smallest first</option>
          <option value="customer-asc">Customer A–Z</option>
          <option value="status">By status</option>
        </select>
        {hasFilters && <button type="button" className="btn btn-ghost btn-sm" onClick={clearFilters}>Clear filters</button>}
      </div>

      {error && <p className="sox-error">{error}</p>}

      {selected.size > 0 && (
        <div className="sox-bulkbar">
          <span className="sox-bulkbar-count">{selected.size} selected</span>
          <select className="sox-select" aria-label="Status to set" value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value)}>
            {SETTABLE_STATUSES.map((s) => <option key={s} value={s}>Mark as {(ORDER_STATUS_BADGE[s]?.label ?? s).toLowerCase()}</option>)}
          </select>
          <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={bulkApply}>Apply</button>
          <label>
            <input type="checkbox" checked={bulkEmail} onChange={(e) => setBulkEmail(e.target.checked)} />
            Email the customers
          </label>
          <span className="sox-bulkbar-spacer" />
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSelected(new Set())}>Clear</button>
        </div>
      )}

      {loading ? (
        <div className="sox-wrap"><div className="sox-loading">Loading orders…</div></div>
      ) : orders.length === 0 ? (
        <div className="sox-empty">
          {hasFilters ? (
            <>
              <h3>No orders match those filters</h3>
              <p>Try widening the search or clearing a filter.</p>
              <button type="button" className="btn btn-secondary btn-sm" onClick={clearFilters}>Clear filters</button>
            </>
          ) : (
            <>
              <h3>No orders yet</h3>
              <p>When someone buys something, it will appear here - along with everything you need to get it out of the door.</p>
            </>
          )}
        </div>
      ) : (
        <div className="sox-wrap">
          <table className="sox-table">
            <thead>
              <tr>
                <th className="sox-check">
                  <input
                    type="checkbox"
                    aria-label="Select all on this page"
                    checked={allOnPage}
                    ref={(el) => { if (el) el.indeterminate = someOnPage && !allOnPage }}
                    onChange={() => setSelected(() => (allOnPage ? new Set() : new Set(orders.map((o) => o.id))))}
                  />
                </th>
                <th>Order</th>
                <th>Customer</th>
                <th>Items</th>
                <th>Payment</th>
                <th>Dispatch</th>
                <th>Status</th>
                <th className="sox-num">Total</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => {
                const m = metrics[o.id]
                const status = badgeFor(ORDER_STATUS_BADGE, o.status)
                const payment = badgeFor(PAYMENT_STATUS_BADGE, o.paymentStatus)
                const dispatch = fulfilmentBadge(m)
                const company = orderCompanyName(o)
                return (
                  <tr key={o.id} className={selected.has(o.id) ? 'is-selected' : ''}>
                    <td className="sox-check">
                      <input type="checkbox" aria-label={`Select order ${o.orderNumber}`} checked={selected.has(o.id)} onChange={() => toggle(o.id)} />
                    </td>
                    <td>
                      <a className="sox-ordno" href={`/${adminPath}/m/shop/orders/${o.id}`}>{o.orderNumber}</a>
                      <p className="sox-sub">{relativeTime(o.createdAt)}</p>
                    </td>
                    <td>
                      <div className="sox-badges">
                        {/* A business orders as the business: the company leads
                            when there is one, and the person who placed it drops
                            to the line below rather than disappearing. */}
                        <span>{company ?? o.customerName}</span>
                        {/* Worth knowing at a glance: a guest cannot look their
                            own order up from an account, so chasing them is a
                            different job. */}
                        {o.memberId && <span className="badge badge-default">Account</span>}
                      </div>
                      <p className="sox-sub">{company ? `${o.customerName} · ${o.customerEmail}` : o.customerEmail}</p>
                    </td>
                    <td className="sox-nowrap">
                      {m ? `${m.unitCount} item${m.unitCount === 1 ? '' : 's'}` : '—'}
                      {m && m.lineCount !== m.unitCount && <p className="sox-sub">{m.lineCount} product{m.lineCount === 1 ? '' : 's'}</p>}
                    </td>
                    <td>
                      <div className="sox-badges">
                        <span className={`badge ${payment.cls}`}>{payment.label}</span>
                      </div>
                      <p className="sox-sub">{paymentMethodLabel(o.paymentMethod)}</p>
                    </td>
                    <td>
                      <div className="sox-badges">
                        <span className={`badge ${dispatch.cls}`}>{dispatch.label}</span>
                        {m?.hasPreOrder && <span className="badge badge-info">Pre-order</span>}
                      </div>
                    </td>
                    <td><span className={`badge ${status.cls}`}>{status.label}</span></td>
                    <td className="sox-num">
                      {formatMoney(o.total, currencySymbol)}
                      {m && m.refundedUnits > 0 && <p className="sox-sub">{m.refundedUnits} refunded</p>}
                    </td>
                    <td className="sox-actions">
                      <button type="button" className="sox-kebab" aria-label={`Actions for order ${o.orderNumber}`} aria-haspopup="menu" onClick={(e) => openMenu(e, o.id)}>⋯</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {total > 0 && (
        <div className="sox-pager">
          <span className="sox-pager-info">Showing {firstOnPage}–{lastOnPage} of {total}</span>
          <div className="sox-pager-btns">
            <select className="sox-select" aria-label="Orders per page" value={filters.perPage} onChange={(e) => update({ perPage: Number(e.target.value) })}>
              <option value={25}>25 per page</option>
              <option value={50}>50 per page</option>
              <option value={100}>100 per page</option>
            </select>
            <button type="button" className="btn btn-secondary btn-sm" disabled={filters.page <= 1} onClick={() => setFilters((f) => ({ ...f, page: Math.max(1, f.page - 1) }))}>Previous</button>
            <span className="btn btn-ghost btn-sm" style={{ pointerEvents: 'none' }}>Page {filters.page} of {pageCount}</span>
            <button type="button" className="btn btn-secondary btn-sm" disabled={filters.page >= pageCount} onClick={() => setFilters((f) => ({ ...f, page: Math.min(pageCount, f.page + 1) }))}>Next</button>
          </div>
        </div>
      )}

      {menuFor && menuOrder && (
        <>
          <div className="sox-menu-overlay" onClick={() => setMenuFor(null)} />
          <div className="sox-menu" role="menu" style={{ left: menuFor.x, top: menuFor.y }}>
            <a role="menuitem" href={`/${adminPath}/m/shop/orders/${menuOrder.id}`}>📄 Open order</a>
            <a role="menuitem" href={`/${adminPath}/m/shop/customers/${encodeURIComponent(menuOrder.customerEmail)}`}>👤 This customer</a>
            <a role="menuitem" href={`mailto:${menuOrder.customerEmail}?subject=${encodeURIComponent(`Your order ${menuOrder.orderNumber}`)}`}>✉️ Email customer</a>
            <button role="menuitem" type="button" onClick={() => copy(menuOrder.customerEmail, 'The email address')}>⧉ Copy email address</button>
            <div className="sox-menu-sep" />
            <div className="sox-menu-head">Change status</div>
            {SETTABLE_STATUSES.filter((s) => s !== menuOrder.status).map((s) => (
              <button
                key={s}
                role="menuitem"
                type="button"
                disabled={busy}
                onClick={() => { setMenuFor(null); void setStatusFor([menuOrder.id], s, true) }}
              >
                {ORDER_STATUS_BADGE[s]?.label ?? s}
              </button>
            ))}
          </div>
        </>
      )}

      {alertNode}
      {confirmNode}
    </div>
  )
}
