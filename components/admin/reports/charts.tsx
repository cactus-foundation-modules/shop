'use client'

import { useRef, useState, type MouseEvent, type ReactNode } from 'react'

// Reports' charts, drawn by hand so the shop adds no charting library - the
// same approach, and the same look, as the Analytics module's:
//   TrendChart  - one measure over time, the period before dashed behind it
//   BarChart    - one value per bucket, below the line when it is a loss
//   Donut       - a share of a whole, legend beside it
//   Heatmap     - orders by weekday and hour, one hue light to dark
//   RankList    - a top-n with bars
//   Waterfall   - income, less refunds, less costs, leaves profit
//   Sparkline   - the shape of a KPI, no axes
// Plots are SVG stretched to their box with non-scaling strokes; everything
// that must not stretch - dots, crosshair, labels, tooltips - is HTML laid over
// by percentage. One axis per chart, always.

const SERIES = ['--rpt-s1', '--rpt-s2', '--rpt-s3', '--rpt-s4', '--rpt-s5', '--rpt-s6', '--rpt-s7', '--rpt-s8']

/** The colour for a series slot. Past the eighth, everything is the grey of "the rest". */
export function seriesColour(slot: number): string {
  return slot >= 0 && slot < SERIES.length ? `var(${SERIES[slot]})` : 'var(--rpt-rest)'
}

export function niceMax(value: number): number {
  if (value <= 0) return 1
  const exp = Math.pow(10, Math.floor(Math.log10(value)))
  const f = value / exp
  const step = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10
  return step * exp
}

export type Grouping = 'day' | 'week' | 'month'

export function bucketLabel(bucket: string, grouping: Grouping, long = false): string {
  const d = new Date(`${bucket}T00:00:00Z`)
  if (grouping === 'month') return d.toLocaleDateString('en-GB', { month: long ? 'long' : 'short', year: 'numeric', timeZone: 'UTC' })
  const day = d.toLocaleDateString('en-GB', long
    ? { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }
    : { day: 'numeric', month: 'short', timeZone: 'UTC' })
  return grouping === 'week' && long ? `Week of ${day}` : day
}

function Axes({ max, min = 0, format }: { max: number; min?: number; format: (v: number) => string }) {
  const range = max - min || 1
  const ticks = min < 0 ? [min, 0, max] : [0, max / 2, max]
  return (
    <>
      {ticks.map((t) => (
        <div key={t} className={`rpt-gridline${t === 0 && min < 0 ? ' is-zero' : ''}`} style={{ top: `${((max - t) / range) * 100}%` }}>
          <span className="rpt-ytick" style={{ top: 0 }}>{format(t)}</span>
        </div>
      ))}
    </>
  )
}

function XLabels({ buckets, grouping }: { buckets: string[]; grouping: Grouping }) {
  if (buckets.length === 0) return null
  const picks = buckets.length <= 3
    ? buckets
    : [buckets[0]!, buckets[Math.floor((buckets.length - 1) / 3)]!, buckets[Math.floor(((buckets.length - 1) * 2) / 3)]!, buckets[buckets.length - 1]!]
  return (
    <div className="rpt-x" aria-hidden="true">
      {picks.map((b, i) => <span key={`${b}-${i}`}>{bucketLabel(b, grouping)}</span>)}
    </div>
  )
}

function useHoverIndex(count: number, centred: boolean) {
  const ref = useRef<HTMLDivElement>(null)
  const [index, setIndex] = useState<number | null>(null)
  const onMove = (e: MouseEvent<HTMLDivElement>) => {
    const box = ref.current?.getBoundingClientRect()
    if (!box || count === 0) return
    const x = Math.min(Math.max(e.clientX - box.left, 0), box.width - 0.001)
    if (centred) setIndex(Math.floor((x / box.width) * count))
    else setIndex(count === 1 ? 0 : Math.round((x / box.width) * (count - 1)))
  }
  return { ref, index, onMove, onLeave: () => setIndex(null) }
}

function tipStyle(pct: number): React.CSSProperties {
  // Flip to the left of the crosshair past the middle, so it never runs off the card.
  return pct > 55 ? { right: `calc(${100 - pct}% + 0.75rem)` } : { left: `calc(${pct}% + 0.75rem)` }
}

export function TrendChart({
  buckets, grouping, values, previous, label, format, axisFormat, colour = 'var(--rpt-s1)', extra,
}: {
  buckets: string[]
  grouping: Grouping
  values: number[]
  /** The period before, slot for slot, drawn dashed behind. */
  previous?: Array<number | null>
  label: string
  format: (v: number) => string
  /** The y-axis ticks, when they want shortening: "£12k". */
  axisFormat?: (v: number) => string
  colour?: string
  /** Extra lines for the tooltip, by bucket index. */
  extra?: (index: number) => ReactNode
}) {
  const { ref, index, onMove, onLeave } = useHoverIndex(values.length, false)
  const prev = previous?.map((v) => v ?? 0)
  const max = niceMax(Math.max(0, ...values, ...(prev ?? [])))
  const x = (i: number) => (values.length <= 1 ? 50 : (i / (values.length - 1)) * 100)
  const y = (v: number) => 100 - (v / max) * 100
  // A gently smoothed line (monotone-ish cubic) - straight segments read jagged
  // on daily data, and a full spline overshoots below zero.
  const path = (vals: number[]) => vals.map((v, i) => {
    if (i === 0) return `M${x(0).toFixed(3)},${y(v).toFixed(3)}`
    const x0 = x(i - 1), x1 = x(i), y0 = y(vals[i - 1] ?? 0), y1 = y(v)
    const mx = (x0 + x1) / 2
    return `C${mx.toFixed(3)},${y0.toFixed(3)} ${mx.toFixed(3)},${y1.toFixed(3)} ${x1.toFixed(3)},${y1.toFixed(3)}`
  }).join(' ')
  const area = values.length > 1 ? `${path(values)} L100,100 L0,100 Z` : ''
  const gradId = `rpt-g-${label.replace(/\W+/g, '')}`

  return (
    <div className="rpt-chart">
      {prev && (
        <div className="rpt-legend">
          <span><span className="rpt-swatch" style={{ background: colour }} />This period</span>
          <span><span className="rpt-swatch is-dash" />Period before</span>
        </div>
      )}
      <div ref={ref} className="rpt-plot" role="img" aria-label={`${label}, ${buckets.length} ${grouping}s`} onMouseMove={onMove} onMouseLeave={onLeave}>
        <Axes max={max} format={axisFormat ?? format} />
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={colour} stopOpacity={0.28} />
              <stop offset="100%" stopColor={colour} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          {area && <path d={area} fill={`url(#${gradId})`} />}
          {prev && prev.length > 1 && (
            <path d={path(prev)} fill="none" stroke="var(--rpt-rest)" strokeWidth={1.5} strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
          )}
          {values.length > 1 && (
            <path d={path(values)} fill="none" stroke={colour} strokeWidth={2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          )}
        </svg>
        {values.length === 1 && <span className="rpt-dot" style={{ left: '50%', top: `${y(values[0] ?? 0)}%`, background: colour }} />}
        {index !== null && buckets[index] && (
          <>
            <span className="rpt-cross" style={{ left: `${x(index)}%` }} />
            <span className="rpt-dot" style={{ left: `${x(index)}%`, top: `${y(values[index] ?? 0)}%`, background: colour }} />
            <div className="rpt-tip" style={tipStyle(x(index))}>
              <div><b>{bucketLabel(buckets[index], grouping, true)}</b></div>
              <div className="rpt-tip-row"><span className="rpt-swatch" style={{ background: colour }} /><span>{label}</span><span>{format(values[index] ?? 0)}</span></div>
              {previous && previous[index] != null && (
                <div className="rpt-tip-row"><span className="rpt-swatch is-dash" /><span>Period before</span><span>{format(previous[index] ?? 0)}</span></div>
              )}
              {extra?.(index)}
            </div>
          </>
        )}
      </div>
      <XLabels buckets={buckets} grouping={grouping} />
    </div>
  )
}

/**
 * One bar per bucket. A negative value hangs below a zero line in the loss
 * colour - the sign is in the tooltip too, so it is never colour alone.
 */
export function BarChart({
  buckets, grouping, values, label, format, axisFormat, colour = 'var(--rpt-s1)', signed = false, short = false, tip,
}: {
  buckets: string[]
  grouping: Grouping
  values: number[]
  label: string
  format: (v: number) => string
  axisFormat?: (v: number) => string
  colour?: string
  signed?: boolean
  short?: boolean
  tip?: (index: number) => ReactNode
}) {
  const { ref, index, onMove, onLeave } = useHoverIndex(values.length, true)
  const max = niceMax(Math.max(0, ...values))
  const min = signed && Math.min(0, ...values) < 0 ? -niceMax(-Math.min(...values)) : 0
  const range = max - min || 1
  const zero = (max / range) * 100
  const pct = (i: number) => ((i + 0.5) / Math.max(values.length, 1)) * 100

  return (
    <div className="rpt-chart">
      <div ref={ref} className={`rpt-plot${short ? ' is-short' : ''}`} role="img" aria-label={`${label}, ${buckets.length} ${grouping}s`} onMouseMove={onMove} onMouseLeave={onLeave}>
        <Axes max={max} min={min} format={axisFormat ?? format} />
        <div className={`rpt-bars${index !== null ? ' is-hovering' : ''}`} aria-hidden="true">
          {values.map((v, i) => {
            const h = (Math.abs(v) / range) * 100
            const neg = v < 0
            return (
              <div key={buckets[i] ?? i} className={index === i ? 'is-hover' : undefined}>
                {v !== 0 && (
                  <span
                    className={neg ? 'is-neg' : 'is-pos'}
                    style={{
                      height: `max(${h}%, 2px)`,
                      ...(neg ? { top: `${zero}%` } : { bottom: `${100 - zero}%` }),
                      background: signed ? (neg ? 'var(--rpt-loss)' : 'var(--rpt-gain)') : colour,
                    }}
                  />
                )}
              </div>
            )
          })}
        </div>
        {index !== null && buckets[index] && (
          <div className="rpt-tip" style={tipStyle(pct(index))}>
            <div><b>{bucketLabel(buckets[index], grouping, true)}</b></div>
            <div className="rpt-tip-row">
              <span className="rpt-swatch" style={{ background: signed ? ((values[index] ?? 0) < 0 ? 'var(--rpt-loss)' : 'var(--rpt-gain)') : colour }} />
              <span>{label}</span><span>{format(values[index] ?? 0)}</span>
            </div>
            {tip?.(index)}
          </div>
        )}
      </div>
      <XLabels buckets={buckets} grouping={grouping} />
    </div>
  )
}

export type DonutSlice = { key: string; label: string; value: number; colour: string; note?: string }

export function Donut({ slices, format, centre, centreLabel }: { slices: DonutSlice[]; format: (v: number) => string; centre: string; centreLabel: string }) {
  const [hover, setHover] = useState<string | null>(null)
  const total = slices.reduce((s, x) => s + Math.max(x.value, 0), 0)
  if (total <= 0) return <div className="rpt-empty">Nothing to share out in this period.</div>
  const R = 46, r = 31, cx = 50, cy = 50
  // A 2px-ish surface gap between slices, as an angle at the outer edge.
  const gap = slices.length > 1 ? 0.035 : 0
  const shown = slices.filter((s) => s.value > 0)
  const starts = shown.map((_, i) => shown.slice(0, i).reduce((sum, x) => sum + x.value, 0))
  const arcs = shown.map((s, i) => {
    const sweep = (s.value / total) * Math.PI * 2
    const angle = -Math.PI / 2 + ((starts[i] ?? 0) / total) * Math.PI * 2
    const a0 = angle + gap / 2, a1 = angle + sweep - gap / 2
    const large = a1 - a0 > Math.PI ? 1 : 0
    const p = (rad: number, a: number) => `${(cx + rad * Math.cos(a)).toFixed(3)},${(cy + rad * Math.sin(a)).toFixed(3)}`
    const d = sweep >= Math.PI * 2 - 0.0001
      ? `M${cx},${cy - R} A${R},${R} 0 1 1 ${cx - 0.001},${cy - R} L${cx - 0.001},${cy - r} A${r},${r} 0 1 0 ${cx},${cy - r} Z`
      : `M${p(R, a0)} A${R},${R} 0 ${large} 1 ${p(R, a1)} L${p(r, a1)} A${r},${r} 0 ${large} 0 ${p(r, a0)} Z`
    return { ...s, d }
  })
  const focus = slices.find((s) => s.key === hover)
  return (
    <div className="rpt-donut">
      <svg viewBox="0 0 100 100" role="img" aria-label={slices.map((s) => `${s.label} ${format(s.value)}`).join(', ')}>
        {arcs.map((a) => (
          <path key={a.key} d={a.d} fill={a.colour} opacity={hover && hover !== a.key ? 0.35 : 1}
            onMouseEnter={() => setHover(a.key)} onMouseLeave={() => setHover(null)} />
        ))}
        <text x="50" y="50" textAnchor="middle" className="rpt-donut-centre">{focus ? format(focus.value) : centre}</text>
        <text x="50" y="60" textAnchor="middle" className="rpt-donut-sub">{focus ? `${((focus.value / total) * 100).toFixed(0)}% · ${focus.label}` : centreLabel}</text>
      </svg>
      <div className="rpt-donut-legend">
        {slices.map((s) => (
          <div key={s.key} className={hover === s.key ? 'is-hover' : undefined} onMouseEnter={() => setHover(s.key)} onMouseLeave={() => setHover(null)}>
            <span className="rpt-swatch" style={{ background: s.colour }} />
            <span>{s.label}{s.note ? <span className="rpt-sub" style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem' }}> · {s.note}</span> : null}</span>
            <span className="rpt-num">{format(s.value)} · {((Math.max(s.value, 0) / total) * 100).toFixed(0)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/** Orders by weekday and hour. One hue, light to dark; the count is in the tooltip. */
export function Heatmap({ cells, format }: { cells: Array<{ dow: number; hour: number; orders: number; gross: number }>; format: (v: number) => string }) {
  const [hover, setHover] = useState<{ dow: number; hour: number } | null>(null)
  const grid = new Map(cells.map((c) => [`${c.dow}-${c.hour}`, c]))
  const max = Math.max(1, ...cells.map((c) => c.orders))
  const shade = (n: number) => (n <= 0 ? undefined : `color-mix(in srgb, var(--rpt-heat) ${Math.round(18 + (n / max) * 82)}%, transparent)`)
  const cur = hover ? grid.get(`${hover.dow}-${hover.hour}`) : undefined
  return (
    <div>
      <div className="rpt-heat" onMouseLeave={() => setHover(null)} role="img" aria-label="Orders by day of the week and hour of the day">
        <span />
        {Array.from({ length: 24 }, (_, h) => <span key={`h${h}`} style={{ justifyContent: 'center' }}>{h % 6 === 0 ? `${String(h).padStart(2, '0')}` : ''}</span>)}
        {DOW.map((d, i) => (
          <FragmentRow key={d} label={d}>
            {Array.from({ length: 24 }, (_, h) => {
              const c = grid.get(`${i + 1}-${h}`)
              return <i key={h} style={{ background: shade(c?.orders ?? 0), outline: hover?.dow === i + 1 && hover?.hour === h ? '2px solid var(--color-text)' : undefined }} onMouseEnter={() => setHover({ dow: i + 1, hour: h })} />
            })}
          </FragmentRow>
        ))}
      </div>
      <div className="rpt-heat-scale">
        {hover ? (
          <span style={{ marginRight: 'auto', color: 'var(--color-text)' }}>
            <b>{DOW[hover.dow - 1]} {String(hover.hour).padStart(2, '0')}:00</b> · {cur?.orders ?? 0} order{(cur?.orders ?? 0) === 1 ? '' : 's'}{cur ? ` · ${format(cur.gross)}` : ''}
          </span>
        ) : <span style={{ marginRight: 'auto' }}>Hover a square for the detail</span>}
        Fewer <i style={{ background: 'var(--rpt-grid)' }} /><i style={{ background: shade(max * 0.33) }} /><i style={{ background: shade(max * 0.66) }} /><i style={{ background: shade(max) }} /> More
      </div>
    </div>
  )
}

function FragmentRow({ label, children }: { label: string; children: ReactNode }) {
  return <><span>{label}</span>{children}</>
}

export function RankList({ rows, format, empty }: { rows: Array<{ key: string; label: ReactNode; value: number; note?: ReactNode }>; format: (v: number) => string; empty: string }) {
  if (rows.length === 0) return <div className="rpt-empty">{empty}</div>
  const max = Math.max(...rows.map((r) => r.value), 0) || 1
  return (
    <div className="rpt-rank">
      {rows.map((r, i) => (
        <div key={r.key} className="rpt-rank-row">
          <span className="rpt-rank-name">{r.label}{r.note ? <span style={{ color: 'var(--color-text-muted)' }}> · {r.note}</span> : null}</span>
          <span className="rpt-num">{format(r.value)}</span>
          <span className="rpt-rank-bar"><span style={{ width: `${Math.max((r.value / max) * 100, 1)}%`, opacity: 1 - i * 0.05 }} /></span>
        </div>
      ))}
    </div>
  )
}

/** Income, less refunds, less costs, leaves profit - the bridge as four columns. */
export function Waterfall({ income, refunds, costs, format }: { income: number; refunds: number; costs: number; format: (v: number) => string }) {
  const profit = income - refunds - costs
  const top = niceMax(Math.max(income, 0))
  const lo = Math.min(0, profit)
  const span = top - lo || 1
  const y = (v: number) => ((top - v) / span) * 100
  const cols = [
    { key: 'income', label: 'Income', from: 0, to: income, colour: 'var(--rpt-s1)', shown: income },
    { key: 'refunds', label: 'Refunds', from: income, to: income - refunds, colour: 'var(--rpt-s2)', shown: -refunds },
    { key: 'costs', label: 'Costs', from: income - refunds, to: profit, colour: 'var(--rpt-s4)', shown: -costs },
    { key: 'profit', label: 'Profit', from: 0, to: profit, colour: profit < 0 ? 'var(--rpt-loss)' : 'var(--rpt-gain)', shown: profit },
  ]
  return (
    <div>
      <div className="rpt-fall" role="img" aria-label={cols.map((c) => `${c.label} ${format(c.shown)}`).join(', ')}>
        {lo < 0 && <div className="rpt-gridline is-zero" style={{ top: `${y(0)}%`, position: 'absolute' }} />}
        {cols.map((c) => {
          const a = Math.max(c.from, c.to), b = Math.min(c.from, c.to)
          return (
            <div key={c.key}>
              <span style={{ top: `${y(a)}%`, height: `max(${y(b) - y(a)}%, 2px)`, background: c.colour }} />
            </div>
          )
        })}
      </div>
      <div className="rpt-fall-labels">
        {cols.map((c) => (
          <div key={c.key}><b className={c.key === 'profit' ? (profit < 0 ? 'rpt-down' : 'rpt-up') : undefined}>{c.shown < 0 ? `−${format(-c.shown)}` : format(c.shown)}</b><span>{c.label}</span></div>
        ))}
      </div>
    </div>
  )
}

export function Sparkline({ values, colour = 'var(--rpt-s1)' }: { values: number[]; colour?: string }) {
  if (values.length < 2) return <span className="rpt-kpi-spark" />
  const max = Math.max(...values), min = Math.min(0, ...values)
  const range = max - min || 1
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * 100).toFixed(2)},${(100 - ((v - min) / range) * 100).toFixed(2)}`)
  return (
    <svg className="rpt-kpi-spark" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" style={{ width: '100%' }}>
      <path d={`M${pts.join(' L')} L100,100 L0,100 Z`} fill={colour} opacity={0.1} />
      <path d={`M${pts.join(' L')}`} fill="none" stroke={colour} strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  )
}

/**
 * Each order as a dot: across by what it brought in, up by its margin. The
 * zero-margin line is drawn; a loss sits below it in the loss colour.
 */
export function MarginScatter({
  points, format, onPick,
}: {
  points: Array<{ id: string; label: string; x: number; y: number; sub?: string }>
  format: (v: number) => string
  onPick?: (id: string) => void
}) {
  const [hover, setHover] = useState<string | null>(null)
  if (points.length === 0) return <div className="rpt-empty">No orders with costs to plot.</div>
  const xMax = niceMax(Math.max(...points.map((p) => p.x), 0))
  const yMax = Math.max(10, Math.ceil(Math.max(...points.map((p) => p.y)) / 10) * 10)
  const yMin = Math.min(0, Math.floor(Math.min(...points.map((p) => p.y)) / 10) * 10)
  const span = yMax - yMin || 1
  const px = (v: number) => (v / xMax) * 100
  const py = (v: number) => ((yMax - v) / span) * 100
  const focus = points.find((p) => p.id === hover)
  return (
    <div className="rpt-chart">
      <div className="rpt-plot" role="img" aria-label={`Margin against income for ${points.length} orders`}>
        {[yMin, 0, yMax].filter((v, i, a) => a.indexOf(v) === i).map((t) => (
          <div key={t} className={`rpt-gridline${t === 0 ? ' is-zero' : ''}`} style={{ top: `${py(t)}%` }}>
            <span className="rpt-ytick" style={{ top: 0 }}>{t}%</span>
          </div>
        ))}
        {points.map((p) => (
          <button
            key={p.id}
            type="button"
            aria-label={`${p.label}: ${format(p.x)} at ${p.y.toFixed(1)}%`}
            onMouseEnter={() => setHover(p.id)}
            onMouseLeave={() => setHover(null)}
            onFocus={() => setHover(p.id)}
            onBlur={() => setHover(null)}
            onClick={() => onPick?.(p.id)}
            style={{
              position: 'absolute', left: `${px(p.x)}%`, top: `${py(p.y)}%`, width: 18, height: 18, margin: '-9px 0 0 -9px',
              border: 0, padding: 0, background: 'transparent', cursor: onPick ? 'pointer' : 'default',
            }}
          >
            <span style={{
              display: 'block', width: hover === p.id ? 12 : 9, height: hover === p.id ? 12 : 9, margin: 'auto', borderRadius: 999,
              background: p.y < 0 ? 'var(--rpt-loss)' : 'var(--rpt-s1)', boxShadow: '0 0 0 2px var(--color-surface)',
              opacity: hover && hover !== p.id ? 0.4 : 0.9, transition: 'all .12s',
            }} />
          </button>
        ))}
        {focus && (
          <div className="rpt-tip" style={{ ...tipStyle(px(focus.x)), top: `max(0%, calc(${py(focus.y)}% - 2.5rem))` }}>
            <div><b>{focus.label}</b>{focus.sub ? ` · ${focus.sub}` : ''}</div>
            <div className="rpt-tip-row"><span>Income</span><span>{format(focus.x)}</span></div>
            <div className="rpt-tip-row"><span>Margin</span><span>{focus.y.toFixed(1)}%</span></div>
          </div>
        )}
      </div>
      <div className="rpt-x" aria-hidden="true"><span>{format(0)}</span><span>Income per order</span><span>{format(xMax)}</span></div>
    </div>
  )
}
