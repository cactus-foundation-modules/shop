'use client'

import { useMemo, useState } from 'react'
import { Donut, RankList, seriesColour } from './charts'
import { Card, DataTable, Kpi, downloadCsv, type Column } from './ui'
import { count, money, pct, shortDate, type SalesReport } from './types'

// Reports > Products and Reports > Customers. Both read the rows the Sales
// request already brought back for the period, so switching to them costs no
// further round trip.

type Product = SalesReport['products'][number]
type Customer = SalesReport['customers'][number]

function Change({ now, before }: { now: number; before: number }) {
  if (before === 0) return now > 0 ? <span className="rpt-pill is-good">New</span> : <span>—</span>
  const p = ((now - before) / Math.abs(before)) * 100
  return <span className={p >= 0 ? 'rpt-up' : 'rpt-down'}>{p >= 0 ? '▲ +' : '▼ −'}{Math.abs(p).toFixed(0)}%</span>
}

const searchBox = (value: string, set: (v: string) => void, placeholder: string) => (
  <input
    type="search"
    value={value}
    onChange={(e) => set(e.target.value)}
    placeholder={placeholder}
    aria-label={placeholder}
    style={{ minWidth: '14rem', padding: '0.35rem 0.6rem', borderRadius: '0.5rem', border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)', font: 'inherit', fontSize: 'var(--text-sm)' }}
  />
)

export function ProductsTab({ data, symbol, adminPath }: { data: SalesReport; symbol: string; adminPath: string }) {
  const [q, setQ] = useState('')
  const m = (v: number) => money(v, symbol)
  const total = data.products.reduce((s, p) => s + p.net, 0)
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase()
    return s ? data.products.filter((p) => `${p.name} ${p.sku ?? ''}`.toLowerCase().includes(s)) : data.products
  }, [data.products, q])

  const top = data.products.slice(0, 6)
  const rest = total - top.reduce((s, p) => s + p.net, 0)
  const slices = [
    ...top.map((p, i) => ({ key: p.id ?? p.name, label: p.name, value: p.net, colour: seriesColour(i) })),
    ...(rest > 0.005 ? [{ key: 'rest', label: 'Everything else', value: rest, colour: seriesColour(-1) }] : []),
  ]
  // Pareto: how few products make 80% of sales.
  let eighty = 0
  for (let i = 0, running = 0; i < data.products.length; i++) {
    running += data.products[i]!.net
    if (running >= total * 0.8) { eighty = i + 1; break }
  }
  const risers = [...data.products].filter((p) => p.previousNet > 0 || p.net > 0).sort((a, b) => (b.net - b.previousNet) - (a.net - a.previousNet))

  const columns: Column<Product>[] = [
    {
      key: 'name', label: 'Product', sort: (r) => r.name.toLowerCase(),
      render: (r) => <>{r.id ? <a href={`/${adminPath}/m/shop/products/${r.id}`}>{r.name}</a> : r.name}{r.sku && <span className="rpt-sub">{r.sku}</span>}</>,
      footer: `${count(rows.length)} product${rows.length === 1 ? '' : 's'}`,
    },
    { key: 'units', label: 'Sold', numeric: true, sort: (r) => r.units, render: (r) => count(r.units), footer: count(rows.reduce((s, r) => s + r.units, 0)) },
    { key: 'orders', label: 'Orders', numeric: true, sort: (r) => r.orders, render: (r) => count(r.orders) },
    { key: 'avg', label: 'Avg price (net)', numeric: true, sort: (r) => (r.units ? r.net / r.units : 0), render: (r) => m(r.units ? r.net / r.units : 0) },
    { key: 'net', label: 'Net sales', numeric: true, sort: (r) => r.net, render: (r) => <b>{m(r.net)}</b>, footer: m(rows.reduce((s, r) => s + r.net, 0)) },
    { key: 'share', label: 'Share', numeric: true, sort: (r) => r.net, render: (r) => pct(total ? (r.net / total) * 100 : 0) },
    { key: 'change', label: 'vs before', numeric: true, sort: (r) => r.net - r.previousNet, render: (r) => <Change now={r.net} before={r.previousNet} /> },
  ]

  return (
    <div>
      <div className="rpt-kpis">
        <Kpi hero label="Products sold" value={count(data.products.length)} />
        <Kpi label="Items sold" value={count(data.kpis.current.units)} />
        <Kpi label="Goods sales (net)" value={m(total)} hint="Line values after each order's discount, before delivery" />
        <Kpi label="80% of sales from" value={`${count(eighty)} product${eighty === 1 ? '' : 's'}`} hint="The fewest products that together make four fifths of goods sales" />
      </div>
      <div className="rpt-grid2">
        <Card title="Share of goods sales" subtitle="The top six, and everything else">
          <Donut slices={slices} format={m} centre={count(data.products.length)} centreLabel="products" />
        </Card>
        <Card title="Biggest movers" subtitle="Change in net sales on the period before">
          <RankList
            format={(v) => (v < 0 ? `−${m(-v)}` : `+${m(v)}`)}
            empty="Nothing to compare."
            rows={risers.slice(0, 7).filter((p) => p.net - p.previousNet > 0).map((p) => ({ key: p.id ?? p.name, label: p.name, value: p.net - p.previousNet, note: `${m(p.previousNet)} → ${m(p.net)}` }))}
          />
        </Card>
      </div>
      <Card
        title="Every product sold"
        actions={
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {searchBox(q, setQ, 'Search products')}
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => downloadCsv(`products-${data.period.from}-to-${data.period.to}.csv`,
              ['product', 'sku', 'units', 'orders', 'net', 'previous_net'],
              rows.map((r) => [r.name, r.sku, r.units, r.orders, r.net.toFixed(2), r.previousNet.toFixed(2)]))}>Export CSV</button>
          </div>
        }
      >
        <DataTable rows={rows} columns={columns} rowKey={(r) => r.id ?? r.name} initialSort={{ key: 'net', dir: 'desc' }} empty="Nothing sold in this period." footer />
      </Card>
    </div>
  )
}

export function CustomersTab({ data, symbol }: { data: SalesReport; symbol: string }) {
  const [q, setQ] = useState('')
  const [kind, setKind] = useState<'all' | 'new' | 'returning'>('all')
  const m = (v: number) => money(v, symbol)
  const k = data.kpis.current
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase()
    return data.customers.filter((c) => {
      if (kind === 'new' && !c.isNew) return false
      if (kind === 'returning' && c.isNew) return false
      return !s || `${c.name} ${c.organisation ?? ''} ${c.email}`.toLowerCase().includes(s)
    })
  }, [data.customers, q, kind])
  const repeat = data.customers.filter((c) => c.orders > 1).length
  const newNet = data.customers.filter((c) => c.isNew).reduce((s, c) => s + c.net, 0)
  const retNet = data.customers.filter((c) => !c.isNew).reduce((s, c) => s + c.net, 0)

  const columns: Column<Customer>[] = [
    {
      key: 'name', label: 'Customer', sort: (r) => (r.organisation || r.name).toLowerCase(),
      render: (r) => <>{r.organisation || r.name}<span className="rpt-sub">{r.organisation ? `${r.name} · ` : ''}{r.email}</span></>,
      footer: `${count(rows.length)} customer${rows.length === 1 ? '' : 's'}`,
    },
    {
      key: 'kind', label: 'Type', sort: (r) => (r.isNew ? 0 : 1),
      render: (r) => <>{r.isNew ? <span className="rpt-pill is-good">New</span> : <span className="rpt-pill">Returning</span>}{r.member && <span className="rpt-sub">Has an account</span>}</>,
    },
    { key: 'orders', label: 'Orders', numeric: true, sort: (r) => r.orders, render: (r) => count(r.orders), footer: count(rows.reduce((s, r) => s + r.orders, 0)) },
    { key: 'aov', label: 'Avg order (net)', numeric: true, sort: (r) => r.net / Math.max(r.orders, 1), render: (r) => m(r.net / Math.max(r.orders, 1)) },
    { key: 'net', label: 'Net sales', numeric: true, sort: (r) => r.net, render: (r) => <b>{m(r.net)}</b>, footer: m(rows.reduce((s, r) => s + r.net, 0)) },
    { key: 'last', label: 'Last order', sort: (r) => r.lastAt, render: (r) => shortDate(r.lastAt) },
  ]

  return (
    <div>
      <div className="rpt-kpis">
        <Kpi hero label="Customers" value={count(k.customers)} />
        <Kpi label="New" value={count(k.newCustomers ?? 0)} hint="First paid order ever falls in this period" />
        <Kpi label="Returning" value={count(k.returningCustomers ?? 0)} />
        <Kpi label="Ordered more than once" value={count(repeat)} hint="Within this period" />
        <Kpi label="Net sales per customer" value={m(k.customers ? k.net / k.customers : 0)} />
      </div>
      <div className="rpt-grid2">
        <Card title="New and returning" subtitle="Net sales from each">
          <Donut
            format={m}
            centre={count(k.customers)}
            centreLabel="customers"
            slices={[
              { key: 'new', label: 'New customers', value: newNet, colour: seriesColour(0), note: `${k.newCustomers ?? 0}` },
              { key: 'ret', label: 'Returning customers', value: retNet, colour: seriesColour(2), note: `${k.returningCustomers ?? 0}` },
            ]}
          />
        </Card>
        <Card title="Top customers" subtitle="By net sales">
          <RankList format={m} empty="No customers in this period." rows={data.customers.slice(0, 7).map((c) => ({ key: c.email, label: c.organisation || c.name, value: c.net, note: `${c.orders} order${c.orders === 1 ? '' : 's'}` }))} />
        </Card>
      </div>
      <Card
        title="Every customer"
        actions={
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
            {searchBox(q, setQ, 'Search customers')}
            <div className="rpt-seg" role="group" aria-label="Customer type">
              {(['all', 'new', 'returning'] as const).map((x) => <button key={x} type="button" aria-pressed={kind === x} onClick={() => setKind(x)}>{x === 'all' ? 'All' : x === 'new' ? 'New' : 'Returning'}</button>)}
            </div>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => downloadCsv(`customers-${data.period.from}-to-${data.period.to}.csv`,
              ['customer', 'organisation', 'email', 'new', 'orders', 'net', 'last_order'],
              rows.map((r) => [r.name, r.organisation, r.email, r.isNew ? 'yes' : 'no', r.orders, r.net.toFixed(2), r.lastAt.slice(0, 10)]))}>Export CSV</button>
          </div>
        }
      >
        <DataTable rows={rows} columns={columns} rowKey={(r) => r.email} initialSort={{ key: 'net', dir: 'desc' }} empty="No customers match." footer />
      </Card>
    </div>
  )
}
