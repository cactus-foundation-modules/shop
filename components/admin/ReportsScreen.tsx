'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { TabStrip } from '@/components/admin/TabStrip'
import { useTabParam } from '@/modules/shop/lib/admin/tab-url'
import { formatMoney } from '@/modules/shop/lib/money'
import { useCurrencySymbol } from '@/modules/shop/components/admin/use-currency-symbol'

type RevenueDay = { day: string; revenue: string; orderCount: number }
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

export function ReportsScreen() {
  const currencySymbol = useCurrencySymbol()
  const [tab, setTab] = useTabParam('tab', 'revenue', ['revenue', 'tax', 'deduction'] as const)
  const [revenue, setRevenue] = useState<RevenueDay[]>([])
  const [tax, setTax] = useState<TaxRow[]>([])
  // The period the tax figures cover, as the days an accountant asks for. Blank
  // is the whole history, which is what the tab has always shown.
  const [taxFrom, setTaxFrom] = useState('')
  const [taxTo, setTaxTo] = useState('')
  const taxQuery = new URLSearchParams({ ...(taxFrom ? { from: taxFrom } : {}), ...(taxTo ? { to: taxTo } : {}) }).toString()
  const [deduction, setDeduction] = useState<DeductionChecks>({ enabled: false, impossible: [], missing: [] })

  useEffect(() => {
    fetch('/api/m/shop/admin/reports/revenue').then(async (r) => { if (r.ok) setRevenue((await r.json()).days) })
    fetch('/api/m/shop/admin/reports/order-size-deduction').then(async (r) => { if (r.ok) setDeduction(await r.json()) })
  }, [])

  useEffect(() => {
    let cancelled = false
    fetch(`/api/m/shop/admin/reports/tax${taxQuery ? `?${taxQuery}` : ''}`)
      .then(async (r) => { if (r.ok && !cancelled) setTax((await r.json()).report) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [taxQuery])

  const taxTotals = tax.reduce(
    (sum, t) => ({
      collected: sum.collected + Number(t.taxCollected ?? 0),
      refunded: sum.refunded + Number(t.taxRefunded ?? 0),
      net: sum.net + Number(t.taxNet ?? t.taxCollected ?? 0),
    }),
    { collected: 0, refunded: 0, net: 0 },
  )

  // The tab only appears on a shop that runs the deduction. A tab that was
  // always there and always empty would read as a feature that had broken.
  const deductionRows = (rows: DeductionRow[], blurb: string, empty: string) => (
    <div style={{ marginBottom: '2rem' }}>
      <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', margin: '0 0 0.5rem' }}>{blurb}</p>
      {rows.length === 0 ? (
        <p style={{ fontSize: '0.875rem', margin: 0 }}>{empty}</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--color-border)' }}>
              <th style={{ padding: '0.5rem' }}>Product</th><th>Code</th><th>Supplier</th><th>Charged</th><th>Amount inside it</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                <td style={{ padding: '0.5rem' }}><Link href={`/cactus-admin/shop/products/${r.id}`}>{r.name}</Link></td>
                <td>{r.sku ?? '—'}</td>
                <td>{r.supplier || '—'}</td>
                <td>{formatMoney(r.salePrice ?? r.price, currencySymbol)}</td>
                <td>{r.orderSizeDeduction == null ? '—' : formatMoney(r.orderSizeDeduction, currencySymbol)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )

  const totalRevenue = revenue.reduce((sum, d) => sum + Number(d.revenue), 0)
  const totalOrders = revenue.reduce((sum, d) => sum + d.orderCount, 0)

  return (
    <div>
      <div className="page-header"><h1 className="page-title">Reports</h1></div>
      <TabStrip
        items={[
          { key: 'revenue', label: 'Revenue', active: tab === 'revenue', onClick: () => setTab('revenue') },
          { key: 'tax', label: 'Tax', active: tab === 'tax', onClick: () => setTab('tax') },
          ...(deduction.enabled ? [{ key: 'deduction', label: 'Order-size deduction', active: tab === 'deduction', onClick: () => setTab('deduction') }] : []),
        ]}
      />

      {tab === 'revenue' && (
        <div>
          <div style={{ display: 'flex', gap: '2rem', marginBottom: '1rem' }}>
            <div><div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{formatMoney(totalRevenue, currencySymbol)}</div><div style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>Revenue (90d)</div></div>
            <div><div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{totalOrders}</div><div style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>Orders (90d)</div></div>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ textAlign: 'left', borderBottom: '1px solid var(--color-border)' }}><th style={{ padding: '0.5rem' }}>Day</th><th>Revenue</th><th>Orders</th></tr></thead>
            <tbody>{revenue.map((d) => <tr key={d.day} style={{ borderBottom: '1px solid var(--color-border)' }}><td style={{ padding: '0.5rem' }}>{new Date(d.day).toLocaleDateString('en-GB')}</td><td>{formatMoney(d.revenue, currencySymbol)}</td><td>{d.orderCount}</td></tr>)}</tbody>
          </table>
        </div>
      )}

      {tab === 'deduction' && deduction.enabled && (
        <div>
          {deductionRows(
            deduction.impossible,
            'The amount inside the price is the whole price or more. These would sell for nothing once a basket qualified, so the amount is almost certainly a typo.',
            'Nothing is stamped with more than it is worth.',
          )}
          {deductionRows(
            deduction.missing,
            'On offer, from a supplier who has a threshold set, but with no amount stamped. Either you meant it, or a shopper who reaches the threshold will never get that money back.',
            'Everything on offer from a supplier with a threshold carries an amount.',
          )}
        </div>
      )}

      {tab === 'tax' && (
        <div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end', marginBottom: '0.75rem' }}>
            <label style={{ display: 'grid', gap: '0.25rem', fontSize: '0.8125rem' }}>
              From
              <input type="date" value={taxFrom} onChange={(e) => setTaxFrom(e.target.value)} style={{ padding: '0.375rem 0.5rem', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)' }} />
            </label>
            <label style={{ display: 'grid', gap: '0.25rem', fontSize: '0.8125rem' }}>
              To (inclusive)
              <input type="date" value={taxTo} onChange={(e) => setTaxTo(e.target.value)} style={{ padding: '0.375rem 0.5rem', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)' }} />
            </label>
            {(taxFrom || taxTo) && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setTaxFrom(''); setTaxTo('') }}>All time</button>
            )}
            <Link href={`/api/m/shop/admin/reports/tax?format=csv${taxQuery ? `&${taxQuery}` : ''}`} className="btn btn-secondary" style={{ display: 'inline-block' }}>Export CSV</Link>
          </div>
          <p className="field-hint" style={{ margin: '0 0 0.75rem' }}>
            Tax collected counts on the day each order was paid for, delivery included; tax refunded counts on the day the
            refund was made. Days start at midnight in your site&apos;s timezone.
          </p>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ textAlign: 'left', borderBottom: '1px solid var(--color-border)' }}><th style={{ padding: '0.5rem' }}>Tax rate</th><th>Orders</th><th>Tax collected</th><th>Tax refunded</th><th>Tax owed</th></tr></thead>
            <tbody>
              {tax.map((t) => (
                <tr key={t.taxRate} style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <td style={{ padding: '0.5rem' }}>{(Number(t.taxRate) * 100).toFixed(1)}%</td>
                  <td>{t.orderCount}</td>
                  <td>{formatMoney(t.taxCollected, currencySymbol)}</td>
                  <td>{formatMoney(t.taxRefunded ?? 0, currencySymbol)}</td>
                  <td>{formatMoney(t.taxNet ?? t.taxCollected, currencySymbol)}</td>
                </tr>
              ))}
              {tax.length > 1 && (
                <tr style={{ fontWeight: 600 }}>
                  <td style={{ padding: '0.5rem' }}>Total</td>
                  <td />
                  <td>{formatMoney(taxTotals.collected, currencySymbol)}</td>
                  <td>{formatMoney(taxTotals.refunded, currencySymbol)}</td>
                  <td>{formatMoney(taxTotals.net, currencySymbol)}</td>
                </tr>
              )}
              {tax.length === 0 && (
                <tr><td colSpan={5} style={{ padding: '0.5rem', color: 'var(--color-text-secondary)' }}>No tax in this period.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
