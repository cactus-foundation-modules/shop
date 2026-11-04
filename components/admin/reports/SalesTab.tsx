'use client'

import { useState } from 'react'
import { BarChart, Donut, Heatmap, RankList, TrendChart, seriesColour } from './charts'
import { Card, Delta, Kpi } from './ui'
import { humanise } from './ui'
import { compactMoney, count, money, type SalesReport } from './types'

type Measure = 'net' | 'gross' | 'orders' | 'aov'

const MEASURES: Array<{ key: Measure; label: string }> = [
  { key: 'net', label: 'Net sales' },
  { key: 'gross', label: 'Gross sales' },
  { key: 'orders', label: 'Orders' },
  { key: 'aov', label: 'Average order' },
]

export function SalesTab({ data, symbol, compare, adminPath }: { data: SalesReport; symbol: string; compare: boolean; adminPath: string }) {
  const [measure, setMeasure] = useState<Measure>('net')
  const { current: k, previous: p } = data.kpis
  const g = data.period.grouping
  const buckets = data.series.map((s) => s.bucket)
  const m = (v: number) => money(v, symbol)
  const cm = (v: number) => compactMoney(v, symbol)

  const pick = (s: SalesReport['series'][number]): number =>
    measure === 'orders' ? s.orders : measure === 'gross' ? s.gross : measure === 'aov' ? (s.orders ? s.net / s.orders : 0) : s.net
  const pickPrev = (s: SalesReport['series'][number]): number | null => {
    if (s.previousNet == null) return null
    if (measure === 'orders') return s.previousOrders
    if (measure === 'aov') return s.previousOrders ? s.previousNet / s.previousOrders : 0
    // The period before carries net only; gross is compared on net's shape.
    return measure === 'net' ? s.previousNet : null
  }
  const values = data.series.map(pick)
  const previous = compare && measure !== 'gross' ? data.series.map(pickPrev) : undefined
  const measureFormat = measure === 'orders' ? count : m
  const measureAxis = measure === 'orders' ? count : cm

  const methodSlices = data.byMethod.map((r, i) => ({ key: r.key, label: humanise(r.key), value: r.gross, colour: seriesColour(i < 7 ? i : -1), note: `${r.orders} order${r.orders === 1 ? '' : 's'}` }))
  const statusSlices = data.byStatus.map((r, i) => ({ key: r.key, label: humanise(r.key), value: r.orders, colour: seriesColour(i < 7 ? i : -1) }))

  return (
    <div>
      <div className="rpt-kpis">
        <Kpi hero label="Net sales" value={m(k.net)} delta={<Delta now={k.net} before={p.net} show={compare} />} spark={data.series.map((s) => s.net)} hint="What customers paid, less the tax in it. Delivery included." />
        <Kpi label="Gross sales" value={m(k.gross)} delta={<Delta now={k.gross} before={p.gross} show={compare} />} spark={data.series.map((s) => s.gross)} hint="Everything customers paid, tax and delivery included." />
        <Kpi label="Orders" value={count(k.orders)} delta={<Delta now={k.orders} before={p.orders} show={compare} />} spark={data.series.map((s) => s.orders)} sparkColour="var(--rpt-s3)" />
        <Kpi label="Average order (net)" value={m(k.aov)} delta={<Delta now={k.aov} before={p.aov} show={compare} />} />
        <Kpi label="Items sold" value={count(k.units)} delta={<Delta now={k.units} before={p.units} show={compare} />} />
        <Kpi label="Customers" value={count(k.customers)} delta={<Delta now={k.customers} before={p.customers} show={compare} />} hint={`${k.newCustomers ?? 0} new, ${k.returningCustomers ?? 0} returning`} />
        <Kpi label="Refunds" value={m(k.refunds)} delta={<Delta now={k.refunds} before={p.refunds} goodWhenDown show={compare} />} spark={data.series.map((s) => s.refunds)} sparkColour="var(--rpt-s2)" hint={`${k.refundCount} refund${k.refundCount === 1 ? '' : 's'}, counted on the day the money went back`} />
        <Kpi label="Tax collected" value={m(k.tax)} delta={<Delta now={k.tax} before={p.tax} show={compare} />} />
      </div>

      <Card
        title="Sales over time"
        subtitle={`${data.period.days} days, by ${g}${compare ? ` · against ${data.period.previousFrom} to ${data.period.previousTo}` : ''}`}
        actions={
          <div className="rpt-seg" role="group" aria-label="Measure">
            {MEASURES.map((x) => <button key={x.key} type="button" aria-pressed={measure === x.key} onClick={() => setMeasure(x.key)}>{x.label}</button>)}
          </div>
        }
      >
        {k.orders === 0 && p.orders === 0
          ? <div className="rpt-empty">No paid orders in this period.</div>
          : <TrendChart buckets={buckets} grouping={g} values={values} previous={previous} label={MEASURES.find((x) => x.key === measure)!.label} format={measureFormat} axisFormat={measureAxis} />}
      </Card>

      <div className="rpt-grid2">
        <Card title="Orders" subtitle={`Paid orders per ${g}`}>
          <BarChart buckets={buckets} grouping={g} values={data.series.map((s) => s.orders)} label="Orders" format={count} colour="var(--rpt-s3)" short />
        </Card>
        <Card title="Refunds" subtitle={`Money handed back per ${g}, tax included`}>
          <BarChart buckets={buckets} grouping={g} values={data.series.map((s) => s.refunds)} label="Refunded" format={m} axisFormat={cm} colour="var(--rpt-s2)" short />
        </Card>
      </div>

      <div className="rpt-grid2">
        <Card title="How customers paid" subtitle="Gross sales by payment method">
          <Donut slices={methodSlices} format={m} centre={cm(k.gross)} centreLabel="gross sales" />
        </Card>
        <Card title="Where the orders are now" subtitle="Orders by status">
          <Donut slices={statusSlices} format={count} centre={count(k.orders)} centreLabel="orders" />
        </Card>
      </div>

      <div className="rpt-grid3">
        <Card title="When people buy" subtitle={`Paid orders by weekday and hour, ${data.period.timezone}`}>
          <Heatmap cells={data.heatmap} format={m} />
        </Card>
        <Card title="Where the money came from" subtitle="Net sales, this period">
          <MoneyBreakdown symbol={symbol} k={k} />
        </Card>
      </div>

      <div className="rpt-grid2">
        <Card title="Top products" subtitle="By net sales">
          <RankList
            format={m}
            empty="Nothing sold in this period."
            rows={data.products.slice(0, 8).map((r) => ({
              key: r.id ?? r.name,
              label: r.id ? <a href={`/${adminPath}/m/shop/products/${r.id}`}>{r.name}</a> : r.name,
              value: r.net,
              note: `${count(r.units)} sold`,
            }))}
          />
        </Card>
        <Card title="Top customers" subtitle="By net sales">
          <RankList
            format={m}
            empty="No customers in this period."
            rows={data.customers.slice(0, 8).map((c) => ({
              key: c.email,
              label: c.organisation || c.name,
              value: c.net,
              note: `${c.orders} order${c.orders === 1 ? '' : 's'}${c.isNew ? ' · new' : ''}`,
            }))}
          />
        </Card>
      </div>
    </div>
  )
}

/** Gross, broken into what it is made of: goods, delivery, tax, less discounts. */
function MoneyBreakdown({ symbol, k }: { symbol: string; k: SalesReport['kpis']['current'] }) {
  const goods = k.net - k.shipping
  const rows = [
    { key: 'goods', label: 'Goods (net)', value: goods, colour: seriesColour(0) },
    { key: 'delivery', label: 'Delivery (net)', value: k.shipping, colour: seriesColour(2) },
    { key: 'tax', label: 'Tax', value: k.tax, colour: seriesColour(3) },
  ]
  const total = rows.reduce((s, r) => s + Math.max(r.value, 0), 0) || 1
  return (
    <div>
      <div style={{ display: 'flex', height: 14, borderRadius: 999, overflow: 'hidden', gap: 2, marginBottom: '0.875rem' }} role="img" aria-label={rows.map((r) => `${r.label} ${money(r.value, symbol)}`).join(', ')}>
        {rows.map((r) => r.value > 0 && <span key={r.key} style={{ width: `${(r.value / total) * 100}%`, background: r.colour }} />)}
      </div>
      <div className="rpt-donut-legend">
        {rows.map((r) => (
          <div key={r.key}><span className="rpt-swatch" style={{ background: r.colour }} /><span>{r.label}</span><span className="rpt-num">{money(r.value, symbol)}</span></div>
        ))}
        <div style={{ borderTop: '1px solid var(--color-border)', borderRadius: 0, paddingTop: '0.5rem', marginTop: '0.25rem' }}>
          <span>Gross sales</span><span className="rpt-num" style={{ color: 'var(--color-text)', fontWeight: 600 }}>{money(k.gross, symbol)}</span>
        </div>
        {k.discount > 0 && (
          <div><span style={{ color: 'var(--color-text-secondary)' }}>Discounts given</span><span className="rpt-num">−{money(k.discount, symbol)}</span></div>
        )}
      </div>
    </div>
  )
}
