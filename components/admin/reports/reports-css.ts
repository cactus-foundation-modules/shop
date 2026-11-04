// Reports' own styles, scoped under .rpt-app. Chrome wears the admin's semantic
// tokens; only the chart series carry their own colours, declared once per
// theme (light, then dark under both the admin's data-theme switch and the OS
// setting) so no component holds a hex.
//
// The series order is the one the Analytics module validated for colour-blind
// separation between neighbours - blue, orange, aqua, yellow, magenta, green,
// violet, red - so a shop with both open sees one palette. A ninth thing is
// never a new colour: it folds into "Everything else", in grey. Profit and loss
// wear the admin's own success and danger tokens, always with a sign beside them.
export const reportsCss = `
.rpt-app{
  --rpt-s1:#2a78d6;--rpt-s2:#eb6834;--rpt-s3:#1baf7a;--rpt-s4:#eda100;
  --rpt-s5:#e87ba4;--rpt-s6:#008300;--rpt-s7:#6250d6;--rpt-s8:#e34948;
  --rpt-rest:color-mix(in srgb,var(--color-text) 28%,transparent);
  --rpt-grid:color-mix(in srgb,var(--color-text) 9%,transparent);
  --rpt-gain:var(--color-success,#1a7f4b);--rpt-loss:var(--color-danger,#c8322f);
  --rpt-heat:var(--rpt-s1);
  min-width:0
}
[data-theme="dark"] .rpt-app{
  --rpt-s1:#3987e5;--rpt-s2:#d95926;--rpt-s3:#199e70;--rpt-s4:#c98500;
  --rpt-s5:#d55181;--rpt-s6:#008300;--rpt-s7:#9085e9;--rpt-s8:#e66767
}
@media (prefers-color-scheme:dark){
  :root:not([data-theme="light"]) .rpt-app{
    --rpt-s1:#3987e5;--rpt-s2:#d95926;--rpt-s3:#199e70;--rpt-s4:#c98500;
    --rpt-s5:#d55181;--rpt-s6:#008300;--rpt-s7:#9085e9;--rpt-s8:#e66767
  }
}
.rpt-app :is(button,a,select,input):focus-visible{outline:2px solid var(--color-border-focus);outline-offset:2px}

/* Toolbar: the period and the filters, one row above everything they drive */
.rpt-toolbar{position:sticky;top:0;z-index:5;display:flex;flex-wrap:wrap;align-items:center;gap:0.5rem;margin:1rem 0;padding:0.625rem 0.75rem;background:color-mix(in srgb,var(--color-surface) 88%,transparent);backdrop-filter:blur(8px);border:1px solid var(--color-border);border-radius:var(--radius-lg,0.75rem)}
.rpt-toolbar select,.rpt-toolbar input[type=date],.rpt-toolbar input[type=search]{width:auto;min-width:0;padding:0.3rem 0.5rem;border-radius:0.5rem;border:1px solid var(--color-border);background:var(--color-surface);color:var(--color-text);font:inherit;font-size:var(--text-sm)}
.rpt-toolbar .rpt-spacer{flex:1}
.rpt-toolbar .rpt-note{color:var(--color-text-secondary);font-size:var(--text-sm);font-variant-numeric:tabular-nums}
.rpt-seg{display:inline-flex;border:1px solid var(--color-border);border-radius:0.5rem;overflow:hidden;flex-wrap:wrap}
.rpt-seg button{border:0;background:var(--color-surface);color:var(--color-text-secondary);padding:0.3rem 0.625rem;font:inherit;font-size:var(--text-sm);cursor:pointer}
.rpt-seg button+button{border-left:1px solid var(--color-border)}
.rpt-seg button[aria-pressed=true]{background:var(--color-primary-subtle);color:var(--color-text);font-weight:600}
.rpt-check{display:inline-flex;align-items:center;gap:0.375rem;font-size:var(--text-sm);color:var(--color-text-secondary);cursor:pointer}
.rpt-menu{position:relative}
.rpt-menu>button{display:inline-flex;align-items:center;gap:0.375rem;border:1px solid var(--color-border);background:var(--color-surface);color:var(--color-text);border-radius:0.5rem;padding:0.3rem 0.625rem;font:inherit;font-size:var(--text-sm);cursor:pointer}
.rpt-menu>button .rpt-count{background:var(--color-primary);color:var(--color-text-inverse,#fff);border-radius:999px;font-size:0.6875rem;padding:0 0.4rem;font-weight:600}
.rpt-menu-pop{position:absolute;top:calc(100% + 0.375rem);left:0;z-index:20;min-width:14rem;max-height:20rem;overflow:auto;background:var(--color-surface-raised,var(--color-surface));border:1px solid var(--color-border);border-radius:0.625rem;padding:0.375rem;box-shadow:0 10px 30px color-mix(in srgb,var(--color-text) 16%,transparent)}
.rpt-menu-pop label{display:flex;align-items:center;gap:0.5rem;padding:0.35rem 0.5rem;border-radius:0.375rem;font-size:var(--text-sm);cursor:pointer}
.rpt-menu-pop label:hover{background:var(--color-bg-subtle)}
.rpt-menu-pop .rpt-menu-foot{display:flex;justify-content:space-between;border-top:1px solid var(--color-border);margin-top:0.25rem;padding:0.375rem 0.25rem 0.125rem}
.rpt-linkbtn{border:0;background:transparent;color:var(--color-link);cursor:pointer;padding:0;font:inherit;font-size:var(--text-sm)}
.rpt-linkbtn:hover{text-decoration:underline}

/* KPI tiles */
.rpt-kpis{display:grid;grid-template-columns:repeat(auto-fill,minmax(11rem,1fr));gap:0.75rem;margin-bottom:1rem}
.rpt-kpi{position:relative;overflow:hidden;background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-lg,0.75rem);padding:0.875rem 1rem 0.75rem;min-width:0}
.rpt-kpi.is-hero{background:linear-gradient(135deg,color-mix(in srgb,var(--rpt-s1) 14%,var(--color-surface)),var(--color-surface) 70%);border-color:color-mix(in srgb,var(--rpt-s1) 35%,var(--color-border))}
.rpt-kpi-label{color:var(--color-text-secondary);font-size:var(--text-sm)}
.rpt-kpi-value{display:block;font-size:1.5rem;font-weight:700;letter-spacing:-0.02em;margin-top:0.25rem;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
.rpt-kpi-delta{display:inline-flex;align-items:center;gap:0.25rem;font-size:0.75rem;margin-top:0.25rem;color:var(--color-text-secondary);font-variant-numeric:tabular-nums}
.rpt-kpi-delta b{font-weight:600}
.rpt-kpi-spark{display:block;height:1.75rem;margin-top:0.375rem}
.rpt-up{color:var(--rpt-gain)}
.rpt-down{color:var(--rpt-loss)}

/* Cards and grids */
.rpt-grid2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1rem;margin-bottom:1rem}
.rpt-grid3{display:grid;grid-template-columns:2fr 1fr;gap:1rem;margin-bottom:1rem}
@media(max-width:900px){.rpt-grid2,.rpt-grid3{grid-template-columns:minmax(0,1fr)}}
.rpt-card{background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-lg,0.75rem);padding:1rem;min-width:0;margin-bottom:1rem}
.rpt-grid2>.rpt-card,.rpt-grid3>.rpt-card{margin-bottom:0}
.rpt-card-head{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:0.5rem;margin-bottom:0.75rem}
.rpt-card-head h2{font-size:0.9375rem;font-weight:600;margin:0;letter-spacing:-0.01em}
.rpt-card-head p{margin:0.125rem 0 0;font-size:0.75rem;color:var(--color-text-secondary)}
.rpt-banner{display:flex;gap:0.625rem;align-items:flex-start;padding:0.75rem 1rem;border-radius:0.625rem;border:1px solid var(--color-border);background:var(--color-bg-subtle);font-size:var(--text-sm);margin-bottom:1rem}
.rpt-banner.is-warn{border-color:color-mix(in srgb,var(--color-warning,#b7791f) 45%,var(--color-border));background:color-mix(in srgb,var(--color-warning,#b7791f) 9%,var(--color-surface))}
.rpt-empty{padding:2rem 1rem;text-align:center;color:var(--color-text-secondary);font-size:var(--text-sm)}
.rpt-skel{height:13rem;border-radius:0.5rem;background:linear-gradient(90deg,var(--color-bg-subtle),color-mix(in srgb,var(--color-bg-subtle) 40%,var(--color-surface)),var(--color-bg-subtle));background-size:200% 100%;animation:rpt-shimmer 1.4s ease-in-out infinite}
@keyframes rpt-shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
@media (prefers-reduced-motion:reduce){.rpt-skel{animation:none}}

/* Charts */
.rpt-chart{position:relative;user-select:none}
.rpt-plot{position:relative;height:14rem;margin-left:3.25rem}
.rpt-plot.is-short{height:10rem}
.rpt-plot svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
.rpt-gridline{position:absolute;left:0;right:0;border-top:1px solid var(--rpt-grid)}
.rpt-gridline.is-zero{border-top-color:var(--color-border-strong)}
.rpt-ytick{position:absolute;right:calc(100% + 0.5rem);transform:translateY(-50%);font-size:0.6875rem;color:var(--color-text-muted);white-space:nowrap;font-variant-numeric:tabular-nums}
.rpt-x{display:flex;justify-content:space-between;margin:0.375rem 0 0 3.25rem;font-size:0.6875rem;color:var(--color-text-muted)}
.rpt-cross{position:absolute;top:0;bottom:0;width:0;border-left:1px solid var(--color-border-strong);pointer-events:none}
.rpt-dot{position:absolute;width:10px;height:10px;margin:-5px 0 0 -5px;border-radius:999px;background:var(--rpt-s1);box-shadow:0 0 0 2px var(--color-surface);pointer-events:none}
.rpt-tip{position:absolute;top:0;z-index:3;pointer-events:none;background:var(--color-surface-raised,var(--color-surface));border:1px solid var(--color-border);border-radius:0.5rem;padding:0.45rem 0.65rem;font-size:0.75rem;box-shadow:0 6px 20px color-mix(in srgb,var(--color-text) 14%,transparent);white-space:nowrap;color:var(--color-text)}
.rpt-tip b{font-weight:600}
.rpt-tip-row{display:flex;align-items:center;gap:0.375rem;font-variant-numeric:tabular-nums}
.rpt-tip-row span:last-child{margin-left:auto;padding-left:0.75rem}
.rpt-swatch{display:inline-block;width:0.625rem;height:0.625rem;border-radius:3px;flex:none}
.rpt-swatch.is-dash{height:0;border-top:2px dashed var(--rpt-rest);border-radius:0}
.rpt-legend{display:flex;flex-wrap:wrap;gap:0.375rem 0.875rem;font-size:0.75rem;color:var(--color-text-secondary);margin-bottom:0.5rem}
.rpt-legend>span{display:inline-flex;align-items:center;gap:0.375rem}
.rpt-bars{position:absolute;inset:0;display:flex;align-items:stretch;gap:2px}
.rpt-bars>div{flex:1;position:relative;min-width:0}
.rpt-bars>div>span{position:absolute;left:12%;right:12%;transition:opacity .15s}
.rpt-bars>div>span.is-pos{border-radius:4px 4px 0 0}
.rpt-bars>div>span.is-neg{border-radius:0 0 4px 4px}
.rpt-bars.is-hovering>div:not(.is-hover)>span{opacity:.45}

.rpt-donut{display:flex;align-items:center;gap:1.25rem;flex-wrap:wrap}
.rpt-donut svg{width:9.5rem;height:9.5rem;flex:none}
.rpt-donut path{transition:opacity .15s;cursor:default}
.rpt-donut-legend{flex:1;min-width:10rem;display:grid;gap:0.25rem;font-size:var(--text-sm)}
.rpt-donut-legend>div{display:flex;align-items:center;gap:0.5rem;padding:0.2rem 0.375rem;border-radius:0.375rem}
.rpt-donut-legend>div.is-hover{background:var(--color-bg-subtle)}
.rpt-donut-legend .rpt-num{margin-left:auto;font-variant-numeric:tabular-nums;color:var(--color-text-secondary)}
.rpt-donut-centre{font-size:1.125rem;font-weight:700;fill:var(--color-text)}
.rpt-donut-sub{font-size:0.5625rem;fill:var(--color-text-muted)}

.rpt-heat{display:grid;grid-template-columns:2.25rem repeat(24,minmax(0,1fr));gap:2px;font-size:0.625rem;color:var(--color-text-muted);position:relative}
.rpt-heat>span{display:flex;align-items:center}
.rpt-heat>i{display:block;aspect-ratio:1;border-radius:3px;background:var(--rpt-grid);min-height:0.625rem}
.rpt-heat-scale{display:flex;align-items:center;gap:0.375rem;font-size:0.6875rem;color:var(--color-text-muted);margin-top:0.5rem;justify-content:flex-end}
.rpt-heat-scale i{display:inline-block;width:0.75rem;height:0.75rem;border-radius:3px}

.rpt-rank{display:grid;gap:0.5rem}
.rpt-rank-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:0.25rem 0.75rem;font-size:var(--text-sm)}
.rpt-rank-row .rpt-rank-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rpt-rank-row .rpt-num{font-variant-numeric:tabular-nums;font-weight:600}
.rpt-rank-bar{grid-column:1/-1;height:6px;border-radius:999px;background:var(--rpt-grid);overflow:hidden}
.rpt-rank-bar>span{display:block;height:100%;border-radius:999px;background:var(--rpt-s1)}

.rpt-fall{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:2px;height:12rem;position:relative;margin-top:0.5rem}
.rpt-fall>div{position:relative}
.rpt-fall>div>span{position:absolute;left:14%;right:14%;border-radius:4px}
.rpt-fall-labels{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:2px;margin-top:0.5rem;text-align:center;font-size:0.75rem}
.rpt-fall-labels b{display:block;font-variant-numeric:tabular-nums;font-size:0.875rem}
.rpt-fall-labels span{color:var(--color-text-secondary)}

/* Tables */
.rpt-table-wrap{overflow-x:auto;margin:0 -1rem;padding:0 1rem}
.rpt-table{width:100%;border-collapse:collapse;font-size:var(--text-sm)}
.rpt-table th{position:sticky;top:0;text-align:left;font-weight:600;font-size:0.75rem;color:var(--color-text-secondary);padding:0.5rem;border-bottom:1px solid var(--color-border);white-space:nowrap;background:var(--color-surface)}
.rpt-table th.is-num,.rpt-table td.is-num{text-align:right;font-variant-numeric:tabular-nums}
.rpt-table th button{border:0;background:transparent;color:inherit;font:inherit;cursor:pointer;padding:0;display:inline-flex;align-items:center;gap:0.25rem}
.rpt-table th button:hover{color:var(--color-text)}
.rpt-table th[aria-sort] button{color:var(--color-text)}
.rpt-table td{padding:0.55rem 0.5rem;border-bottom:1px solid var(--color-border);vertical-align:top}
.rpt-table tbody tr:hover td{background:var(--color-bg-subtle)}
.rpt-table tfoot td{font-weight:700;border-top:2px solid var(--color-border-strong);border-bottom:0}
.rpt-table .rpt-sub{display:block;font-size:0.75rem;color:var(--color-text-secondary)}
.rpt-table tr.is-open td{background:var(--color-bg-subtle)}
.rpt-expand{border:0;background:transparent;color:var(--color-text-secondary);cursor:pointer;width:1.5rem;height:1.5rem;border-radius:0.375rem;font-size:0.75rem}
.rpt-expand:hover{background:var(--color-bg-subtle);color:var(--color-text)}
.rpt-costs{display:grid;gap:0.25rem;padding:0.25rem 0 0.25rem 2rem}
.rpt-costs>div{display:grid;grid-template-columns:7rem minmax(0,1fr) 8rem 6rem;gap:0.75rem;font-size:0.8125rem;align-items:center}
.rpt-pill{display:inline-flex;align-items:center;gap:0.25rem;padding:0.05rem 0.5rem;border-radius:999px;font-size:0.6875rem;font-weight:600;border:1px solid var(--color-border);color:var(--color-text-secondary);white-space:nowrap}
.rpt-pill.is-good{color:var(--rpt-gain);border-color:color-mix(in srgb,var(--rpt-gain) 40%,transparent);background:color-mix(in srgb,var(--rpt-gain) 8%,transparent)}
.rpt-pill.is-warn{color:var(--color-warning,#b7791f);border-color:color-mix(in srgb,var(--color-warning,#b7791f) 40%,transparent);background:color-mix(in srgb,var(--color-warning,#b7791f) 8%,transparent)}
.rpt-pill.is-bad{color:var(--rpt-loss);border-color:color-mix(in srgb,var(--rpt-loss) 40%,transparent);background:color-mix(in srgb,var(--rpt-loss) 8%,transparent)}
.rpt-margin{display:inline-flex;align-items:center;gap:0.375rem;justify-content:flex-end}
.rpt-margin i{display:inline-block;width:2.5rem;height:5px;border-radius:999px;background:var(--rpt-grid);position:relative;overflow:hidden}
.rpt-margin i>b{position:absolute;left:0;top:0;bottom:0;border-radius:999px}
.rpt-pager{display:flex;align-items:center;justify-content:space-between;gap:0.5rem;margin-top:0.75rem;font-size:var(--text-sm);color:var(--color-text-secondary);flex-wrap:wrap}
`
