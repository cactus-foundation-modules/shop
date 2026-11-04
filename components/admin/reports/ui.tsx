'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Sparkline } from './charts'

// The pieces every Reports tab is built from: the period toolbar, a multi-pick
// filter menu, KPI tiles with their change on the period before, cards, and a
// sortable table. Kept apart from the tabs so a new tab is mostly arithmetic.

export type Grouping = 'day' | 'week' | 'month'
export type PeriodState = { from: string; to: string; preset: string; group: Grouping | 'auto'; compare: boolean }

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const shift = (d: Date, days: number) => { const c = new Date(d); c.setDate(c.getDate() + days); return c }

/** The presets, worked out on the viewer's own calendar. */
export const PRESETS: Array<{ key: string; label: string; range: () => [string, string] }> = [
  { key: '7d', label: 'Last 7 days', range: () => { const t = new Date(); return [iso(shift(t, -6)), iso(t)] } },
  { key: '30d', label: 'Last 30 days', range: () => { const t = new Date(); return [iso(shift(t, -29)), iso(t)] } },
  { key: '90d', label: 'Last 90 days', range: () => { const t = new Date(); return [iso(shift(t, -89)), iso(t)] } },
  { key: 'mtd', label: 'This month', range: () => { const t = new Date(); return [iso(new Date(t.getFullYear(), t.getMonth(), 1)), iso(t)] } },
  { key: 'lm', label: 'Last month', range: () => { const t = new Date(); return [iso(new Date(t.getFullYear(), t.getMonth() - 1, 1)), iso(new Date(t.getFullYear(), t.getMonth(), 0))] } },
  { key: 'qtd', label: 'This quarter', range: () => { const t = new Date(); return [iso(new Date(t.getFullYear(), Math.floor(t.getMonth() / 3) * 3, 1)), iso(t)] } },
  { key: 'lq', label: 'Last quarter', range: () => { const t = new Date(); const q = Math.floor(t.getMonth() / 3) * 3; return [iso(new Date(t.getFullYear(), q - 3, 1)), iso(new Date(t.getFullYear(), q, 0))] } },
  { key: 'ytd', label: 'Year to date', range: () => { const t = new Date(); return [iso(new Date(t.getFullYear(), 0, 1)), iso(t)] } },
  { key: '12m', label: 'Last 12 months', range: () => { const t = new Date(); return [iso(new Date(t.getFullYear() - 1, t.getMonth(), t.getDate() + 1)), iso(t)] } },
  // Ten years, which is as far back as the reports will look in one go.
  { key: 'all', label: 'All time', range: () => { const t = new Date(); return [iso(new Date(t.getFullYear() - 10, t.getMonth(), t.getDate() + 1)), iso(t)] } },
]

export function PeriodToolbar({
  value, onChange, children, note,
}: {
  value: PeriodState
  onChange: (next: PeriodState) => void
  /** The tab's own filters, after the period. */
  children?: ReactNode
  note?: ReactNode
}) {
  return (
    <div className="rpt-toolbar" role="toolbar" aria-label="Report period and filters">
      <select
        aria-label="Period"
        value={value.preset}
        onChange={(e) => {
          const p = PRESETS.find((x) => x.key === e.target.value)
          if (p) { const [from, to] = p.range(); onChange({ ...value, preset: p.key, from, to }) }
          else onChange({ ...value, preset: 'custom' })
        }}
      >
        {PRESETS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
        <option value="custom">Custom dates</option>
      </select>
      <input type="date" aria-label="From" value={value.from} max={value.to} onChange={(e) => e.target.value && onChange({ ...value, preset: 'custom', from: e.target.value })} />
      <span className="rpt-note">to</span>
      <input type="date" aria-label="To (inclusive)" value={value.to} min={value.from} onChange={(e) => e.target.value && onChange({ ...value, preset: 'custom', to: e.target.value })} />
      <div className="rpt-seg" role="group" aria-label="Group by">
        {(['auto', 'day', 'week', 'month'] as const).map((g) => (
          <button key={g} type="button" aria-pressed={value.group === g} onClick={() => onChange({ ...value, group: g })}>
            {g === 'auto' ? 'Auto' : g[0]!.toUpperCase() + g.slice(1)}
          </button>
        ))}
      </div>
      <label className="rpt-check">
        <input type="checkbox" checked={value.compare} onChange={(e) => onChange({ ...value, compare: e.target.checked })} />
        Compare with period before
      </label>
      {children}
      <span className="rpt-spacer" />
      {note && <span className="rpt-note">{note}</span>}
    </div>
  )
}

/** A button that opens a list of ticks. Nothing ticked means everything. */
export function MultiPick({ label, options, value, onChange }: {
  label: string
  options: Array<{ key: string; label: string }>
  value: string[]
  onChange: (next: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: Event) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc) }
  }, [open])
  return (
    <div className="rpt-menu" ref={ref}>
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {label}{value.length > 0 && <span className="rpt-count">{value.length}</span>} <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="rpt-menu-pop" role="dialog" aria-label={label}>
          {options.length === 0 && <div className="rpt-empty" style={{ padding: '0.75rem' }}>Nothing to pick from yet.</div>}
          {options.map((o) => (
            <label key={o.key}>
              <input
                type="checkbox"
                checked={value.includes(o.key)}
                onChange={(e) => onChange(e.target.checked ? [...value, o.key] : value.filter((v) => v !== o.key))}
              />
              {o.label}
            </label>
          ))}
          <div className="rpt-menu-foot">
            <button type="button" className="rpt-linkbtn" onClick={() => onChange([])}>Everything</button>
            <button type="button" className="rpt-linkbtn" onClick={() => setOpen(false)}>Done</button>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * The change on the period before, as a signed percentage with an arrow -
 * never colour alone. `goodWhenDown` for figures where less is better (refunds).
 */
export function Delta({ now, before, goodWhenDown = false, show = true }: { now: number; before: number; goodWhenDown?: boolean; show?: boolean }) {
  if (!show) return null
  if (before === 0 && now === 0) return <span className="rpt-kpi-delta">No change</span>
  if (before === 0) return <span className="rpt-kpi-delta">New this period</span>
  const pct = ((now - before) / Math.abs(before)) * 100
  const up = pct >= 0
  const good = goodWhenDown ? !up : up
  return (
    <span className={`rpt-kpi-delta ${Math.abs(pct) < 0.05 ? '' : good ? 'rpt-up' : 'rpt-down'}`}>
      <span aria-hidden="true">{up ? '▲' : '▼'}</span>
      <b>{up ? '+' : '−'}{Math.abs(pct) >= 1000 ? '999+' : Math.abs(pct).toFixed(1)}%</b>
      <span style={{ color: 'var(--color-text-secondary)' }}>vs period before</span>
    </span>
  )
}

export function Kpi({ label, value, hero, delta, spark, sparkColour, hint }: {
  label: string
  value: ReactNode
  hero?: boolean
  delta?: ReactNode
  spark?: number[]
  sparkColour?: string
  hint?: string
}) {
  return (
    <div className={`rpt-kpi${hero ? ' is-hero' : ''}`} title={hint}>
      <div className="rpt-kpi-label">{label}</div>
      <span className="rpt-kpi-value">{value}</span>
      {delta}
      {spark && <Sparkline values={spark} colour={sparkColour} />}
    </div>
  )
}

export function Card({ title, subtitle, actions, children }: { title: string; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="rpt-card">
      <div className="rpt-card-head">
        <div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
        {actions}
      </div>
      {children}
    </section>
  )
}

export function Skeleton({ height = '13rem' }: { height?: string }) {
  return <div className="rpt-skel" style={{ height }} aria-hidden="true" />
}

// ---- sortable, searchable, paged tables -----------------------------------

export type Column<T> = {
  key: string
  label: string
  numeric?: boolean
  /** What the column sorts on. Leave out for a column that does not sort. */
  sort?: (row: T) => number | string | null
  render: (row: T) => ReactNode
  footer?: ReactNode
}

export function useSorted<T>(rows: T[], columns: Column<T>[], initial: { key: string; dir: 'asc' | 'desc' }) {
  const [sort, setSort] = useState(initial)
  const sorted = useMemo(() => {
    const col = columns.find((c) => c.key === sort.key)
    if (!col?.sort) return rows
    const get = col.sort
    const mul = sort.dir === 'asc' ? 1 : -1
    return [...rows].sort((a, b) => {
      const x = get(a), y = get(b)
      if (x == null && y == null) return 0
      if (x == null) return 1
      if (y == null) return -1
      return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))) * mul
    })
  }, [rows, columns, sort])
  const toggle = (key: string) => setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: columns.find((c) => c.key === key)?.numeric ? 'desc' : 'asc' }))
  return { sorted, sort, toggle }
}

export function DataTable<T>({
  rows, columns, rowKey, initialSort, pageSize = 25, empty, expand, footer,
}: {
  rows: T[]
  columns: Column<T>[]
  rowKey: (row: T) => string
  initialSort: { key: string; dir: 'asc' | 'desc' }
  pageSize?: number
  empty: string
  /** A row's detail, shown under it when its arrow is pressed. */
  expand?: (row: T) => ReactNode | null
  footer?: boolean
}) {
  const { sorted, sort, toggle } = useSorted(rows, columns, initialSort)
  const [page, setPage] = useState(0)
  const [size, setSize] = useState(pageSize)
  const [open, setOpen] = useState<Set<string>>(new Set())
  const pages = Math.max(1, Math.ceil(sorted.length / size))
  const current = Math.min(page, pages - 1)
  const slice = sorted.slice(current * size, current * size + size)
  const span = columns.length + (expand ? 1 : 0)

  return (
    <div>
      <div className="rpt-table-wrap">
        <table className="rpt-table">
          <thead>
            <tr>
              {expand && <th aria-label="Detail" style={{ width: '2rem' }} />}
              {columns.map((c) => (
                <th key={c.key} className={c.numeric ? 'is-num' : undefined} aria-sort={sort.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
                  {c.sort ? (
                    <button type="button" onClick={() => toggle(c.key)}>
                      {c.label}<span aria-hidden="true" style={{ opacity: sort.key === c.key ? 1 : 0.3 }}>{sort.key === c.key && sort.dir === 'asc' ? '↑' : '↓'}</span>
                    </button>
                  ) : c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {slice.length === 0 && <tr><td colSpan={span}><div className="rpt-empty">{empty}</div></td></tr>}
            {slice.map((row) => {
              const k = rowKey(row)
              const detail = expand && open.has(k) ? expand(row) : null
              return [
                <tr key={k} className={detail ? 'is-open' : undefined}>
                  {expand && (
                    <td>
                      <button
                        type="button"
                        className="rpt-expand"
                        aria-expanded={open.has(k)}
                        aria-label={open.has(k) ? 'Hide detail' : 'Show detail'}
                        onClick={() => setOpen((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n })}
                      >{open.has(k) ? '▾' : '▸'}</button>
                    </td>
                  )}
                  {columns.map((c) => <td key={c.key} className={c.numeric ? 'is-num' : undefined}>{c.render(row)}</td>)}
                </tr>,
                detail ? <tr key={`${k}-detail`} className="is-open"><td colSpan={span}>{detail}</td></tr> : null,
              ]
            })}
          </tbody>
          {footer && rows.length > 0 && (
            <tfoot>
              <tr>
                {expand && <td />}
                {columns.map((c) => <td key={c.key} className={c.numeric ? 'is-num' : undefined}>{c.footer ?? ''}</td>)}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {sorted.length > Math.min(size, 10) && (
        <div className="rpt-pager">
          <span>
            {sorted.length === 0 ? 0 : current * size + 1}–{Math.min(sorted.length, (current + 1) * size)} of {sorted.length}
          </span>
          <span style={{ display: 'inline-flex', gap: '0.5rem', alignItems: 'center' }}>
            <select aria-label="Rows per page" value={size} onChange={(e) => { setSize(Number(e.target.value)); setPage(0) }} style={{ width: 'auto' }}>
              {[10, 25, 50, 100, 250].map((n) => <option key={n} value={n}>{n} a page</option>)}
            </select>
            <button type="button" className="btn btn-ghost btn-sm" disabled={current === 0} onClick={() => setPage(current - 1)}>Previous</button>
            <button type="button" className="btn btn-ghost btn-sm" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>Next</button>
          </span>
        </div>
      )}
    </div>
  )
}

/** A CSV of whatever is on screen, built in the browser, for the tabs whose rows are all here already. */
export function downloadCsv(filename: string, header: string[], rows: Array<Array<string | number | null | undefined>>) {
  const cell = (v: string | number | null | undefined) => {
    const s = v == null ? '' : String(v)
    const safe = /^[=+\-@]/.test(s) && !/^-?\d/.test(s) ? `'${s}` : s
    return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
  }
  const blob = new Blob([[header, ...rows].map((r) => r.map(cell).join(',')).join('\n')], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const METHOD_LABELS: Record<string, string> = {
  SQUARE: 'Card (Square)',
  STRIPE: 'Card (Stripe)',
  PAYPAL: 'PayPal',
  KLARNA: 'Klarna',
  BANK_TRANSFER: 'Bank transfer',
  GOCARDLESS_IBP: 'Instant bank pay',
  ATOA: 'Atoa',
  WORLDFIRST: 'WorldFirst',
  NONE: 'No payment',
}
export function humanise(code: string | null | undefined): string {
  if (!code) return '—'
  if (METHOD_LABELS[code]) return METHOD_LABELS[code]
  const s = code.toLowerCase().replace(/_/g, ' ')
  return s[0]!.toUpperCase() + s.slice(1)
}
