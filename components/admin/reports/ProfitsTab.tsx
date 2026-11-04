'use client'

import { useMemo, useState } from 'react'
import { bucketOf, bucketsBetween } from '@/modules/shop/lib/reports/period'
import { BarChart, Donut, MarginScatter, RankList, TrendChart, Waterfall, seriesColour } from './charts'
import { Card, DataTable, Kpi, MultiPick, humanise, type Column } from './ui'
import { compactMoney, count, money, pct, shortDate, type ProfitRow, type ProfitsReport } from './types'

// Reports > Profits. The rows arrive whole for the period (the API caps them at
// 5,000); everything from here on - search, the cost filters, sorting, the
// charts - is worked in the browser, so turning a filter is instant and the
// charts always describe exactly the rows in the table.

type CostFilter = 'all' | 'costed' | 'missing' | 'ordered' | 'billed'
type ResultFilter = 'all' | 'profit' | 'loss'

const COST_FILTERS: Array<{ key: CostFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'costed', label: 'Costed' },
  { key: 'missing', label: 'No costs' },
  { key: 'ordered', label: 'Estimated' },
  { key: 'billed', label: 'Invoiced' },
]

function basisPill(row: ProfitRow) {
  if (row.basis === 'none') return <span className="rpt-pill is-warn" title="Nothing has told the shop what this order cost">No costs</span>
  if (row.basis === 'billed') return <span className="rpt-pill is-good" title="Every cost is from an approved supplier invoice">Invoiced</span>
  if (row.basis === 'mixed') return <span className="rpt-pill" title="Some costs are invoiced, some are still what was ordered">Part invoiced</span>
  return <span className="rpt-pill" title="What the purchase order asked for - no approved invoice yet">Estimated</span>
}

function MarginBar({ margin }: { margin: number | null }) {
  if (margin == null) return <span style={{ color: 'var(--color-text-muted)' }}>—</span>
  const w = Math.min(Math.abs(margin), 100)
  return (
    <span className="rpt-margin">
      <span className={margin < 0 ? 'rpt-down' : undefined}>{pct(margin)}</span>
      <i aria-hidden="true"><b style={{ width: `${w}%`, background: margin < 0 ? 'var(--rpt-loss)' : 'var(--rpt-gain)' }} /></i>
    </span>
  )
}

export function ProfitsTab({
  data, symbol, adminPath, csvHref, grouping,
}: {
  data: ProfitsReport
  symbol: string
  adminPath: string
  csvHref: string
  grouping: 'day' | 'week' | 'month'
}) {
  const [search, setSearch] = useState('')
  const [costFilter, setCostFilter] = useState<CostFilter>('all')
  const [result, setResult] = useState<ResultFilter>('all')
  const [suppliers, setSuppliers] = useState<string[]>([])
  const m = (v: number) => money(v, symbol)
  const cm = (v: number) => compactMoney(v, symbol)

  const supplierOptions = useMemo(() => {
    const names = new Set<string>()
    for (const o of data.orders) for (const c of o.costs) if (c.label) names.add(c.label)
    return [...names].sort().map((n) => ({ key: n, label: n }))
  }, [data.orders])

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return data.orders.filter((o) => {
      if (costFilter === 'costed' && o.basis === 'none') return false
      if (costFilter === 'missing' && o.basis !== 'none') return false
      if (costFilter === 'ordered' && !(o.basis === 'ordered' || o.basis === 'mixed')) return false
      if (costFilter === 'billed' && o.basis !== 'billed') return false
      if (result === 'profit' && o.profit < 0) return false
      if (result === 'loss' && o.profit >= 0) return false
      if (suppliers.length && !o.costs.some((c) => c.label && suppliers.includes(c.label))) return false
      if (q) {
        const hay = [o.orderNumber, o.customer, o.email, o.organisation ?? '', ...o.costs.flatMap((c) => [c.ref, c.label ?? ''])].join(' ').toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [data.orders, search, costFilter, result, suppliers])

  const t = useMemo(() => {
    const sum = (f: (r: ProfitRow) => number) => rows.reduce((s, r) => s + f(r), 0)
    const income = sum((r) => r.income)
    const refunds = sum((r) => r.refunds)
    const cost = sum((r) => r.cost)
    const profit = income - refunds - cost
    const costed = rows.filter((r) => r.basis !== 'none')
    const costedKept = costed.reduce((s, r) => s + r.income - r.refunds, 0)
    const costedProfit = costed.reduce((s, r) => s + r.profit, 0)
    return {
      income, refunds, cost, profit,
      margin: income - refunds > 0 ? (profit / (income - refunds)) * 100 : null,
      costedMargin: costedKept > 0 ? (costedProfit / costedKept) * 100 : null,
      missing: rows.filter((r) => r.basis === 'none').length,
      missingIncome: rows.filter((r) => r.basis === 'none').reduce((s, r) => s + r.income - r.refunds, 0),
      estimated: rows.filter((r) => r.basis === 'ordered' || r.basis === 'mixed').length,
      losses: rows.filter((r) => r.profit < 0).length,
      perOrder: costed.length ? costedProfit / costed.length : 0,
      billed: rows.reduce((s, r) => s + r.costs.filter((c) => c.basis === 'billed').reduce((a, c) => a + c.amount, 0), 0),
      ordered: rows.reduce((s, r) => s + r.costs.filter((c) => c.basis === 'ordered').reduce((a, c) => a + c.amount, 0), 0),
    }
  }, [rows])

  // Profit by bucket, worked from the rows on screen.
  const buckets = useMemo(() => bucketsBetween(data.period.from, data.period.to, grouping), [data.period.from, data.period.to, grouping])
  const series = useMemo(() => {
    const at = new Map(buckets.map((b) => [b, { profit: 0, income: 0, cost: 0, kept: 0, orders: 0 }]))
    for (const r of rows) {
      const slot = at.get(bucketOf(r.paidAt.slice(0, 10), grouping))
      if (!slot) continue
      slot.profit += r.profit; slot.income += r.income; slot.cost += r.cost; slot.kept += r.income - r.refunds; slot.orders += 1
    }
    return buckets.map((b) => at.get(b)!)
  }, [rows, buckets, grouping])

  const bySupplier = useMemo(() => {
    const acc = new Map<string, { cost: number; orders: Set<string> }>()
    for (const r of rows) for (const c of r.costs) {
      const k = c.label ?? c.source
      const e = acc.get(k) ?? { cost: 0, orders: new Set<string>() }
      e.cost += c.amount; e.orders.add(r.id)
      acc.set(k, e)
    }
    return [...acc.entries()].map(([k, v]) => ({ key: k, cost: v.cost, orders: v.orders.size })).sort((a, b) => b.cost - a.cost)
  }, [rows])

  const columns: Column<ProfitRow>[] = [
    {
      key: 'order', label: 'Order', sort: (r) => r.paidAt,
      render: (r) => (
        <>
          <a href={`/${adminPath}/m/shop/orders/${r.id}`} style={{ fontWeight: 600 }}>{r.orderNumber}</a>
          <span className="rpt-sub">{shortDate(r.paidAt)} · {humanise(r.paymentMethod)}</span>
        </>
      ),
      footer: `${count(rows.length)} order${rows.length === 1 ? '' : 's'}`,
    },
    {
      key: 'customer', label: 'Customer', sort: (r) => (r.organisation || r.customer).toLowerCase(),
      render: (r) => <>{r.organisation || r.customer}{r.organisation && <span className="rpt-sub">{r.customer}</span>}</>,
    },
    { key: 'status', label: 'Status', sort: (r) => r.status, render: (r) => <span className="rpt-pill">{humanise(r.status)}</span> },
    {
      key: 'income', label: 'Income', numeric: true, sort: (r) => r.income,
      render: (r) => <>{m(r.income)}{r.charges > 0 && <span className="rpt-sub">incl. {m(r.charges)} extra</span>}</>,
      footer: m(t.income),
    },
    { key: 'refunds', label: 'Refunds', numeric: true, sort: (r) => r.refunds, render: (r) => (r.refunds ? `−${m(r.refunds)}` : '—'), footer: t.refunds ? `−${m(t.refunds)}` : '—' },
    {
      key: 'cost', label: 'Costs', numeric: true, sort: (r) => r.cost,
      render: (r) => (
        <>
          {r.basis === 'none' ? <span style={{ color: 'var(--color-text-muted)' }}>—</span> : `−${m(r.cost)}`}
          <span className="rpt-sub">{basisPill(r)}{r.costs.length > 1 ? ` ${r.costs.length} POs` : ''}</span>
        </>
      ),
      footer: `−${m(t.cost)}`,
    },
    {
      key: 'profit', label: 'Profit', numeric: true, sort: (r) => r.profit,
      render: (r) => <b className={r.profit < 0 ? 'rpt-down' : undefined}>{m(r.profit)}</b>,
      footer: <span className={t.profit < 0 ? 'rpt-down' : 'rpt-up'}>{m(t.profit)}</span>,
    },
    { key: 'margin', label: 'Margin', numeric: true, sort: (r) => r.margin, render: (r) => <MarginBar margin={r.margin} />, footer: pct(t.margin) },
  ]

  const expand = (r: ProfitRow) => (
    <div className="rpt-costs">
      <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
        <span>Net {m(r.net)}</span>
        <span>Gross {m(r.gross)} · {count(r.units)} item{r.units === 1 ? '' : 's'}{r.discount > 0 ? ` · ${m(r.discount)} off` : ''}</span>
        <span>{r.shipping > 0 ? `Delivery ${m(r.shipping)}` : 'No delivery charge'}</span>
        <span>{r.email}</span>
      </div>
      {r.costs.length === 0 && <div><span /><span style={{ color: 'var(--color-text-secondary)' }}>No purchase order or other cost is recorded against this order, so its profit is the whole of its income.</span></div>}
      {r.costs.map((c) => (
        <div key={`${c.source}-${c.ref}`}>
          <span>{c.path ? <a href={`/${adminPath}/${c.path}`} style={{ fontWeight: 600 }}>{c.ref}</a> : <b>{c.ref}</b>}</span>
          <span>{c.label ?? c.source}{c.status ? <span style={{ color: 'var(--color-text-secondary)' }}> · {c.status}</span> : null}</span>
          <span>{c.basis === 'billed' ? <span className="rpt-pill is-good">Invoiced</span> : <span className="rpt-pill">As ordered</span>}</span>
          <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>−{m(c.amount)}</span>
        </div>
      ))}
    </div>
  )

  if (data.providers.length === 0) {
    return (
      <div className="rpt-card">
        <div className="rpt-empty" style={{ padding: '3rem 1rem' }}>
          <p style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--color-text)', margin: '0 0 0.5rem' }}>Nothing on this site knows what an order costs</p>
          <p style={{ margin: 0 }}>
            Profit needs the other half of the sum. Install a module that records what you pay suppliers - Purchase Orders does,
            from the orders you raise against each sale - and every order&apos;s profit will appear here.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div>
      {data.failed.length > 0 && (
        <div className="rpt-banner is-warn" role="status">
          <span aria-hidden="true">⚠</span>
          <span>Costs from <b>{data.failed.join(', ')}</b> could not be included - either they failed to load or your role cannot see them. Profit below is overstated by whatever those would have been.</span>
        </div>
      )}
      {data.truncated && (
        <div className="rpt-banner is-warn" role="status"><span aria-hidden="true">⚠</span><span>This period holds more than 5,000 orders; only the latest 5,000 are shown. Narrow the dates for the full picture, or export the CSV.</span></div>
      )}

      <div className="rpt-kpis">
        <Kpi hero label="Profit" value={<span className={t.profit < 0 ? 'rpt-down' : undefined}>{m(t.profit)}</span>} spark={series.map((s) => s.profit)} sparkColour="var(--rpt-gain)" hint="Income, less refunds, less costs. All net of tax." />
        <Kpi label="Margin" value={pct(t.margin)} hint="Profit as a share of what the shop kept after refunds" delta={t.missing > 0 ? <span className="rpt-kpi-delta">{pct(t.costedMargin)} on costed orders only</span> : undefined} />
        <Kpi label="Income (net)" value={m(t.income)} spark={series.map((s) => s.income)} hint="What customers paid, less tax, plus extra charges paid later" />
        <Kpi label="Costs (net)" value={m(t.cost)} spark={series.map((s) => s.cost)} sparkColour="var(--rpt-s4)" hint={`${m(t.billed)} invoiced, ${m(t.ordered)} as ordered`} />
        <Kpi label="Profit per costed order" value={m(t.perOrder)} />
        <Kpi label="Orders at a loss" value={<span className={t.losses ? 'rpt-down' : undefined}>{count(t.losses)}</span>} />
        <Kpi label="Orders with no costs" value={<span style={t.missing ? { color: 'var(--color-warning, #b7791f)' } : undefined}>{count(t.missing)}</span>} hint={`${m(t.missingIncome)} of income with nothing against it`} />
        <Kpi label="Still estimated" value={count(t.estimated)} hint="Orders whose costs are what was ordered, with no approved supplier invoice yet" />
      </div>

      {t.missing > 0 && costFilter !== 'missing' && (
        <div className="rpt-banner" role="status">
          <span aria-hidden="true">ℹ</span>
          <span>
            <b>{count(t.missing)} order{t.missing === 1 ? ' has' : 's have'} no costs recorded</b>, so {t.missing === 1 ? 'its' : 'their'} {m(t.missingIncome)} counts as pure profit.{' '}
            <button type="button" className="rpt-linkbtn" onClick={() => setCostFilter('missing')}>Show {t.missing === 1 ? 'it' : 'them'}</button>
          </span>
        </div>
      )}

      <div className="rpt-grid3">
        <Card title="Profit over time" subtitle={`Per ${grouping}, losses below the line`}>
          <BarChart
            buckets={buckets}
            grouping={grouping}
            values={series.map((s) => Math.round(s.profit * 100) / 100)}
            label="Profit"
            format={m}
            axisFormat={cm}
            signed
            tip={(i) => (
              <>
                <div className="rpt-tip-row"><span>Income</span><span>{m(series[i]?.income ?? 0)}</span></div>
                <div className="rpt-tip-row"><span>Costs</span><span>−{m(series[i]?.cost ?? 0)}</span></div>
                <div className="rpt-tip-row"><span>Orders</span><span>{series[i]?.orders ?? 0}</span></div>
              </>
            )}
          />
        </Card>
        <Card title="From income to profit" subtitle="The filtered orders, net of tax">
          <Waterfall income={t.income} refunds={t.refunds} costs={t.cost} format={m} />
        </Card>
      </div>

      <div className="rpt-grid2">
        <Card title="Margin trend" subtitle={`Profit as a share of what was kept, per ${grouping}`}>
          <TrendChart
            buckets={buckets}
            grouping={grouping}
            values={series.map((s) => (s.kept > 0 ? (s.profit / s.kept) * 100 : 0))}
            label="Margin"
            format={(v) => `${v.toFixed(1)}%`}
            colour="var(--rpt-s3)"
          />
        </Card>
        <Card title="Every order, by margin" subtitle="Across by income, up by margin - click a dot to find it below">
          <MarginScatter
            format={m}
            points={rows.filter((r) => r.basis !== 'none' && r.margin != null).map((r) => ({ id: r.id, label: r.orderNumber, sub: r.organisation || r.customer, x: r.income - r.refunds, y: r.margin! }))}
            onPick={(id) => { const r = rows.find((x) => x.id === id); if (r) setSearch(r.orderNumber) }}
          />
        </Card>
      </div>

      <div className="rpt-grid2">
        <Card title="Spend by supplier" subtitle="Costs against these orders, net">
          <RankList
            format={m}
            empty="No costs recorded against these orders."
            rows={bySupplier.slice(0, 8).map((s) => ({ key: s.key, label: s.key, value: s.cost, note: `${s.orders} order${s.orders === 1 ? '' : 's'}` }))}
          />
        </Card>
        <Card title="How firm the costs are" subtitle="Invoiced is final; as ordered can still move">
          <Donut
            format={m}
            centre={cm(t.cost)}
            centreLabel="costs"
            slices={[
              { key: 'billed', label: 'Invoiced', value: t.billed, colour: seriesColour(0) },
              { key: 'ordered', label: 'As ordered', value: t.ordered, colour: seriesColour(3) },
            ]}
          />
        </Card>
      </div>

      <Card
        title="Orders and their purchase orders"
        subtitle="Open a row for the purchase orders behind it"
        actions={<a href={csvHref} className="btn btn-secondary btn-sm">Export CSV</a>}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center', marginBottom: '0.75rem' }} className="rpt-toolbar-inline">
          <input
            type="search"
            placeholder="Order, customer, PO or supplier"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search orders"
            style={{ flex: '1 1 14rem', maxWidth: '22rem', padding: '0.35rem 0.6rem', borderRadius: '0.5rem', border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)', font: 'inherit', fontSize: 'var(--text-sm)' }}
          />
          <div className="rpt-seg" role="group" aria-label="Costs">
            {COST_FILTERS.map((f) => <button key={f.key} type="button" aria-pressed={costFilter === f.key} onClick={() => setCostFilter(f.key)}>{f.label}</button>)}
          </div>
          <div className="rpt-seg" role="group" aria-label="Result">
            {(['all', 'profit', 'loss'] as const).map((f) => <button key={f} type="button" aria-pressed={result === f} onClick={() => setResult(f)}>{f === 'all' ? 'Any result' : f === 'profit' ? 'In profit' : 'At a loss'}</button>)}
          </div>
          {supplierOptions.length > 0 && <MultiPick label="Supplier" options={supplierOptions} value={suppliers} onChange={setSuppliers} />}
          {(search || costFilter !== 'all' || result !== 'all' || suppliers.length > 0) && (
            <button type="button" className="rpt-linkbtn" onClick={() => { setSearch(''); setCostFilter('all'); setResult('all'); setSuppliers([]) }}>Clear filters</button>
          )}
        </div>
        <DataTable rows={rows} columns={columns} rowKey={(r) => r.id} initialSort={{ key: 'order', dir: 'desc' }} empty="No orders match." expand={expand} footer />
      </Card>
    </div>
  )
}
