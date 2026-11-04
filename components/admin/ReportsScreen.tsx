'use client'

import { useEffect, useMemo, useState } from 'react'
import { TabStrip } from '@/components/admin/TabStrip'
import { useAdminPath } from '@/components/admin/AdminPathContext'
import { readTabParam, setTabParams, useTabParam } from '@/modules/shop/lib/admin/tab-url'
import { useCurrencySymbol } from '@/modules/shop/components/admin/use-currency-symbol'
import { reportsCss } from './reports/reports-css'
import { Card, DataTable, Kpi, MultiPick, PRESETS, PeriodToolbar, Skeleton, humanise, type Column, type PeriodState } from './reports/ui'
import { RankList, seriesColour } from './reports/charts'
import { SalesTab } from './reports/SalesTab'
import { ProfitsTab } from './reports/ProfitsTab'
import { CustomersTab, ProductsTab } from './reports/CatalogueTabs'
import { money, type ProfitsReport, type SalesReport } from './reports/types'

// Shop > Reports. One period and one set of filters across every tab, held in
// the URL so a report can be bookmarked or sent to somebody:
//   Sales      - the headline figures, the trend, the mix, when people buy
//   Profits    - every order against what it cost (shop.order-costs)
//   Products   - what sold, and what moved
//   Customers  - who bought, new and returning
//   Tax        - collected, refunded and owed by rate, for the VAT return
//   Order-size deduction - catalogue checks, on a shop that runs it
//
// A new tab is a component that takes the period's data and draws it; the
// toolbar, the URL and the fetching all stay here.

type TaxRow = { taxRate: string; orderCount: number; taxCollected: string; taxRefunded?: string; taxNet?: string }
// A catalogue row the order-size deduction has something to say about - see
// lib/db/suppliers.ts listOrderSizeDeductionChecks.
type DeductionRow = {
  id: string
  name: string
  sku: string | null
  supplier: string
  price: string
  salePrice: string | null
  orderSizeDeduction: string | null
}
type DeductionChecks = { enabled: boolean; impossible: DeductionRow[]; missing: DeductionRow[] }

const TABS = ['sales', 'profits', 'products', 'customers', 'tax', 'deduction'] as const
type Tab = (typeof TABS)[number]

const DEFAULT_PRESET = '30d'

function initialPeriod(): PeriodState {
  const [from, to] = PRESETS.find((p) => p.key === DEFAULT_PRESET)!.range()
  return { from, to, preset: DEFAULT_PRESET, group: 'auto', compare: true }
}

const LIST = /^[A-Z_]+(,[A-Z_]+)*$/

export function ReportsScreen() {
  const symbol = useCurrencySymbol()
  const adminPath = useAdminPath()
  const [tab, setTab] = useTabParam<Tab>('tab', 'sales', TABS)
  const [period, setPeriod] = useState<PeriodState>(initialPeriod)
  const [methods, setMethods] = useState<string[]>([])
  const [statuses, setStatuses] = useState<string[]>([])
  const [ready, setReady] = useState(false)

  // The URL's period and filters, read once on mount (see lib/admin/tab-url.ts).
  useEffect(() => {
    const preset = readTabParam('preset')
    const from = readTabParam('from')
    const to = readTabParam('to')
    const group = readTabParam('group')
    const known = PRESETS.find((p) => p.key === preset)
    const next = initialPeriod()
    if (known) { const [f, t] = known.range(); Object.assign(next, { preset: known.key, from: f, to: t }) }
    else if (from && to && /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to)) Object.assign(next, { preset: 'custom', from, to })
    if (group === 'day' || group === 'week' || group === 'month') next.group = group
    if (readTabParam('compare') === '0') next.compare = false
    const m = readTabParam('method')
    const s = readTabParam('status')
    /* eslint-disable react-hooks/set-state-in-effect -- one-shot read of the URL on mount */
    setPeriod(next)
    if (m && LIST.test(m)) setMethods(m.split(','))
    if (s && LIST.test(s)) setStatuses(s.split(','))
    setReady(true)
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [])

  useEffect(() => {
    if (!ready) return
    setTabParams({
      preset: period.preset === DEFAULT_PRESET ? null : period.preset,
      from: period.preset === 'custom' ? period.from : null,
      to: period.preset === 'custom' ? period.to : null,
      group: period.group === 'auto' ? null : period.group,
      compare: period.compare ? null : '0',
      method: methods.length ? methods.join(',') : null,
      status: statuses.length ? statuses.join(',') : null,
    })
  }, [ready, period, methods, statuses])

  const query = useMemo(() => new URLSearchParams({
    from: period.from,
    to: period.to,
    ...(period.group !== 'auto' ? { group: period.group } : {}),
    ...(methods.length ? { method: methods.join(',') } : {}),
    ...(statuses.length ? { status: statuses.join(',') } : {}),
  }).toString(), [period.from, period.to, period.group, methods, statuses])

  const [sales, setSales] = useState<SalesReport | null>(null)
  const [salesError, setSalesError] = useState(false)
  const [profits, setProfits] = useState<ProfitsReport | null>(null)
  const [profitsQuery, setProfitsQuery] = useState<string | null>(null)
  const [tax, setTax] = useState<{ query: string; rows: TaxRow[] } | null>(null)
  const [deduction, setDeduction] = useState<DeductionChecks>({ enabled: false, impossible: [], missing: [] })

  // Filter choices remembered once seen, so ticking one never makes the others vanish.
  const [seenMethods, setSeenMethods] = useState<string[]>([])
  const [seenStatuses, setSeenStatuses] = useState<string[]>([])

  useEffect(() => {
    fetch('/api/m/shop/admin/reports/order-size-deduction').then(async (r) => { if (r.ok) setDeduction(await r.json()) }).catch(() => {})
  }, [])

  useEffect(() => {
    if (!ready) return
    let cancelled = false
    fetch(`/api/m/shop/admin/reports/sales?${query}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status))
        const data = (await r.json()) as SalesReport
        if (cancelled) return
        const merge = (had: string[], keys: string[]) => (keys.every((k) => had.includes(k)) ? had : [...new Set([...had, ...keys])].sort())
        setSeenMethods((had) => merge(had, data.byMethod.map((x) => x.key)))
        setSeenStatuses((had) => merge(had, data.byStatus.map((x) => x.key)))
        setSalesError(false)
        setSales(data)
      })
      .catch(() => { if (!cancelled) setSalesError(true) })
    return () => { cancelled = true }
  }, [ready, query])

  // Profits only when its tab is open: it asks every cost provider too.
  useEffect(() => {
    if (!ready || tab !== 'profits' || profitsQuery === query) return
    let cancelled = false
    fetch(`/api/m/shop/admin/reports/profits?${query}`)
      .then(async (r) => { if (r.ok && !cancelled) { setProfits(await r.json()); setProfitsQuery(query) } })
      .catch(() => {})
    return () => { cancelled = true }
  }, [ready, tab, query, profitsQuery])

  const taxQuery = `from=${period.from}&to=${period.to}`
  useEffect(() => {
    if (!ready || tab !== 'tax' || tax?.query === taxQuery) return
    let cancelled = false
    fetch(`/api/m/shop/admin/reports/tax?${taxQuery}`)
      .then(async (r) => { if (r.ok && !cancelled) setTax({ query: taxQuery, rows: (await r.json()).report }) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [ready, tab, taxQuery, tax?.query])

  const grouping = sales?.period.grouping ?? profits?.period.grouping ?? 'day'
  const methodOptions = seenMethods.map((k) => ({ key: k, label: humanise(k) }))
  const statusOptions = seenStatuses.map((k) => ({ key: k, label: humanise(k) }))
  const filtersApply = tab === 'sales' || tab === 'profits' || tab === 'products' || tab === 'customers'
  const loading = <><div className="rpt-kpis">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} height="6rem" />)}</div><Skeleton height="18rem" /></>

  const items: Array<{ key: Tab; label: string }> = [
    { key: 'sales', label: 'Sales' },
    { key: 'profits', label: 'Profits' },
    { key: 'products', label: 'Products' },
    { key: 'customers', label: 'Customers' },
    { key: 'tax', label: 'Tax' },
    // Only on a shop that runs the deduction. A tab that was always there and
    // always empty would read as a feature that had broken.
    ...(deduction.enabled ? [{ key: 'deduction' as const, label: 'Order-size deduction' }] : []),
  ]

  return (
    <div className="rpt-app">
      <style>{reportsCss}</style>
      <div className="page-header"><h1 className="page-title">Reports</h1></div>
      <TabStrip items={items.map((i) => ({ key: i.key, label: i.label, active: tab === i.key, onClick: () => setTab(i.key) }))} />

      {tab !== 'deduction' && (
        <PeriodToolbar
          value={period}
          onChange={setPeriod}
          note={sales ? `${sales.period.from} to ${sales.period.to} · ${sales.period.timezone}` : undefined}
        >
          {filtersApply && (
            <>
              <MultiPick label="Payment method" options={methodOptions} value={methods} onChange={setMethods} />
              <MultiPick label="Order status" options={statusOptions} value={statuses} onChange={setStatuses} />
              {(methods.length > 0 || statuses.length > 0) && (
                <button type="button" className="rpt-linkbtn" onClick={() => { setMethods([]); setStatuses([]) }}>Clear filters</button>
              )}
            </>
          )}
        </PeriodToolbar>
      )}

      {salesError && (tab === 'sales' || tab === 'products' || tab === 'customers') && (
        <div className="rpt-banner is-warn" role="alert"><span aria-hidden="true">⚠</span><span>The figures would not load. Try again in a moment.</span></div>
      )}

      {tab === 'sales' && (sales ? <SalesTab data={sales} symbol={symbol} compare={period.compare} adminPath={adminPath} /> : !salesError && loading)}
      {tab === 'products' && (sales ? <ProductsTab data={sales} symbol={symbol} adminPath={adminPath} /> : !salesError && loading)}
      {tab === 'customers' && (sales ? <CustomersTab data={sales} symbol={symbol} /> : !salesError && loading)}
      {tab === 'profits' && (profits && profitsQuery === query
        ? <ProfitsTab data={profits} symbol={symbol} adminPath={adminPath} grouping={profits.period.grouping ?? grouping} csvHref={`/api/m/shop/admin/reports/profits?format=csv&${query}`} />
        : loading)}
      {tab === 'tax' && <TaxTab rows={tax?.query === taxQuery ? tax.rows : null} symbol={symbol} csvHref={`/api/m/shop/admin/reports/tax?format=csv&${taxQuery}`} />}
      {tab === 'deduction' && deduction.enabled && <DeductionTab checks={deduction} symbol={symbol} adminPath={adminPath} />}
    </div>
  )
}

function TaxTab({ rows, symbol, csvHref }: { rows: TaxRow[] | null; symbol: string; csvHref: string }) {
  const m = (v: number | string | undefined | null) => money(Number(v ?? 0), symbol)
  if (!rows) return <Skeleton height="18rem" />
  const totals = rows.reduce(
    (sum, t) => ({
      collected: sum.collected + Number(t.taxCollected ?? 0),
      refunded: sum.refunded + Number(t.taxRefunded ?? 0),
      net: sum.net + Number(t.taxNet ?? t.taxCollected ?? 0),
    }),
    { collected: 0, refunded: 0, net: 0 },
  )
  const rate = (r: TaxRow) => `${(Number(r.taxRate) * 100).toFixed(1)}%`
  const columns: Column<TaxRow>[] = [
    { key: 'rate', label: 'Tax rate', sort: (r) => Number(r.taxRate), render: (r) => <b>{rate(r)}</b>, footer: 'Total' },
    { key: 'orders', label: 'Orders', numeric: true, sort: (r) => r.orderCount, render: (r) => r.orderCount },
    { key: 'collected', label: 'Tax collected', numeric: true, sort: (r) => Number(r.taxCollected), render: (r) => m(r.taxCollected), footer: m(totals.collected) },
    { key: 'refunded', label: 'Tax refunded', numeric: true, sort: (r) => Number(r.taxRefunded ?? 0), render: (r) => (Number(r.taxRefunded ?? 0) ? `−${m(r.taxRefunded)}` : '—'), footer: totals.refunded ? `−${m(totals.refunded)}` : '—' },
    { key: 'net', label: 'Tax owed', numeric: true, sort: (r) => Number(r.taxNet ?? r.taxCollected), render: (r) => <b>{m(r.taxNet ?? r.taxCollected)}</b>, footer: m(totals.net) },
  ]
  return (
    <div>
      <div className="rpt-kpis">
        <Kpi hero label="Tax owed" value={m(totals.net)} hint="Collected, less what went back with refunds" />
        <Kpi label="Tax collected" value={m(totals.collected)} />
        <Kpi label="Tax refunded" value={m(totals.refunded)} />
        <Kpi label="Rates in use" value={rows.length} />
      </div>
      <div className="rpt-grid3">
        <Card title="Tax by rate" actions={<a href={csvHref} className="btn btn-secondary btn-sm">Export CSV</a>}>
          <DataTable rows={rows} columns={columns} rowKey={(r) => r.taxRate} initialSort={{ key: 'rate', dir: 'desc' }} empty="No tax in this period." footer={rows.length > 1} />
          <p className="field-hint" style={{ margin: '0.75rem 0 0' }}>
            Tax collected counts on the day each order was paid for, delivery included; tax refunded counts on the day the
            refund was made. Days start at midnight in your site&apos;s timezone.
          </p>
        </Card>
        <Card title="Where the tax sits" subtitle="Owed, by rate">
          <RankList format={(v) => m(v)} empty="No tax in this period." rows={rows.map((r, i) => ({ key: r.taxRate, label: <><span className="rpt-swatch" style={{ background: seriesColour(i), marginRight: 6 }} />{rate(r)}</>, value: Number(r.taxNet ?? r.taxCollected) }))} />
        </Card>
      </div>
    </div>
  )
}

function DeductionTab({ checks, symbol, adminPath }: { checks: DeductionChecks; symbol: string; adminPath: string }) {
  const m = (v: string | null) => (v == null ? '—' : money(Number(v), symbol))
  const columns: Column<DeductionRow>[] = [
    { key: 'name', label: 'Product', sort: (r) => r.name.toLowerCase(), render: (r) => <a href={`/${adminPath}/m/shop/products/${r.id}`}>{r.name}</a> },
    { key: 'sku', label: 'Code', sort: (r) => r.sku ?? '', render: (r) => r.sku ?? '—' },
    { key: 'supplier', label: 'Supplier', sort: (r) => r.supplier, render: (r) => r.supplier || '—' },
    { key: 'charged', label: 'Charged', numeric: true, sort: (r) => Number(r.salePrice ?? r.price), render: (r) => m(r.salePrice ?? r.price) },
    { key: 'amount', label: 'Amount inside it', numeric: true, sort: (r) => Number(r.orderSizeDeduction ?? 0), render: (r) => m(r.orderSizeDeduction) },
  ]
  return (
    <div style={{ marginTop: '1rem' }}>
      <div className="rpt-kpis">
        <Kpi hero={checks.impossible.length > 0} label="Stamped with more than they are worth" value={checks.impossible.length} />
        <Kpi label="On offer with no amount stamped" value={checks.missing.length} />
      </div>
      <Card title="More than it is worth" subtitle="The amount inside the price is the whole price or more. These would sell for nothing once a basket qualified, so the amount is almost certainly a typo.">
        <DataTable rows={checks.impossible} columns={columns} rowKey={(r) => r.id} initialSort={{ key: 'name', dir: 'asc' }} empty="Nothing is stamped with more than it is worth." />
      </Card>
      <Card title="No amount stamped" subtitle="On offer, from a supplier who has a threshold set, but with no amount stamped. Either you meant it, or a shopper who reaches the threshold will never get that money back.">
        <DataTable rows={checks.missing} columns={columns} rowKey={(r) => r.id} initialSort={{ key: 'name', dir: 'asc' }} empty="Everything on offer from a supplier with a threshold carries an amount." />
      </Card>
    </div>
  )
}
