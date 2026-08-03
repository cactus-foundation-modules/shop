// Stylesheet shared by the admin orders list and the single order screen, each
// emitting it once. Class prefix `sox-`. Real CSS rather than inline styles so
// hover, focus rings, the sticky bulk bar, the responsive collapse and the
// print layout all work; colours are tokens only, so both screens track the
// admin's light/dark theme with no second palette to keep in step.
export const ordersScreenCss = `
/* --- Shared shell ------------------------------------------------------- */
.sox-count{margin:0.25rem 0 0;font-size:0.875rem;color:var(--color-text-muted)}
.sox-muted{color:var(--color-text-muted)}
.sox-mono{font-family:var(--font-mono,monospace)}
.sox-nowrap{white-space:nowrap}

.sox-card{border:1px solid var(--color-border);border-radius:var(--radius-lg);background:var(--color-surface);overflow:hidden}
.sox-card + .sox-card{margin-top:1rem}
.sox-card-head{display:flex;align-items:center;justify-content:space-between;gap:0.75rem;flex-wrap:wrap;padding:0.75rem 1rem;border-bottom:1px solid var(--color-border);background:var(--color-bg-subtle)}
.sox-card-head h2,.sox-card-head h3{margin:0;font-size:0.8125rem;font-weight:600;letter-spacing:0.02em;text-transform:uppercase;color:var(--color-text-muted)}
.sox-card-body{padding:1rem}
.sox-card-body.is-flush{padding:0}

/* --- Overview tiles ----------------------------------------------------- */
.sox-tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:0.75rem;margin-bottom:1rem}
.sox-tile{appearance:none;text-align:left;border:1px solid var(--color-border);background:var(--color-surface);border-radius:var(--radius-lg);padding:0.75rem 0.875rem;cursor:pointer;display:grid;gap:0.125rem}
.sox-tile:hover{border-color:var(--color-border-strong);background:var(--color-bg-subtle)}
.sox-tile:focus-visible{outline:2px solid var(--color-border-focus);outline-offset:1px}
.sox-tile.is-active{border-color:var(--color-primary-border);background:var(--color-primary-subtle)}
.sox-tile.is-static{cursor:default}
.sox-tile.is-static:hover{border-color:var(--color-border);background:var(--color-surface)}
.sox-tile-label{font-size:0.75rem;font-weight:600;letter-spacing:0.02em;text-transform:uppercase;color:var(--color-text-muted)}
.sox-tile-value{font-size:1.375rem;font-weight:600;color:var(--color-text);line-height:1.2}
.sox-tile-note{font-size:0.75rem;color:var(--color-text-muted)}
.sox-tile.is-attention .sox-tile-value{color:var(--color-warning)}

/* --- Toolbar ------------------------------------------------------------ */
.sox-toolbar{display:flex;flex-wrap:wrap;gap:0.5rem;align-items:center;margin-bottom:0.75rem}
.sox-search{flex:1 1 220px;min-width:180px;height:36px;padding:0 0.75rem;border-radius:var(--radius-md);border:1px solid var(--color-border);background:var(--color-surface);color:var(--color-text);font-size:0.875rem}
.sox-search:focus-visible{outline:2px solid var(--color-border-focus);outline-offset:1px}
.sox-select{height:36px;padding:0 2rem 0 0.625rem;border-radius:var(--radius-md);border:1px solid var(--color-border);background:var(--color-surface);color:var(--color-text);font-size:0.8125rem;cursor:pointer}
.sox-select:focus-visible{outline:2px solid var(--color-border-focus);outline-offset:1px}
.sox-date{height:36px;padding:0 0.5rem;border-radius:var(--radius-md);border:1px solid var(--color-border);background:var(--color-surface);color:var(--color-text);font-size:0.8125rem}
.sox-filters{display:flex;flex-wrap:wrap;gap:0.5rem;align-items:center;margin-bottom:1rem}
.sox-filters-label{font-size:0.75rem;font-weight:600;letter-spacing:0.02em;text-transform:uppercase;color:var(--color-text-muted)}

.sox-seg{display:inline-flex;flex-wrap:wrap;border:1px solid var(--color-border);border-radius:var(--radius-md);overflow:hidden;background:var(--color-surface)}
.sox-seg button{appearance:none;border:0;background:transparent;color:var(--color-text-secondary);padding:0 0.75rem;height:34px;font-size:0.8125rem;font-weight:500;cursor:pointer;border-left:1px solid var(--color-border)}
.sox-seg button:first-child{border-left:0}
.sox-seg button:hover:not(.is-active){background:var(--color-bg-subtle)}
.sox-seg button.is-active{background:var(--color-primary);color:var(--color-on-primary)}
.sox-seg button:focus-visible{outline:2px solid var(--color-border-focus);outline-offset:-2px}

/* --- Bulk action bar ---------------------------------------------------- */
.sox-bulkbar{position:sticky;top:0.5rem;z-index:5;display:flex;flex-wrap:wrap;align-items:center;gap:0.5rem;margin-bottom:0.75rem;padding:0.5rem 0.75rem;border:1px solid var(--color-primary-border);background:var(--color-primary-subtle);border-radius:var(--radius-md)}
.sox-bulkbar-count{font-size:0.8125rem;font-weight:600;color:var(--color-primary-dark);margin-right:0.25rem}
.sox-bulkbar-spacer{flex:1}
.sox-bulkbar label{display:inline-flex;align-items:center;gap:0.375rem;font-size:0.8125rem;color:var(--color-text)}

/* --- Table -------------------------------------------------------------- */
.sox-wrap{overflow-x:auto;border:1px solid var(--color-border);border-radius:var(--radius-lg);background:var(--color-surface)}
.sox-table{width:100%;border-collapse:collapse;font-size:0.875rem}
.sox-table th{position:sticky;top:0;z-index:1;text-align:left;padding:0.625rem 0.75rem;background:var(--color-bg-subtle);font-size:0.75rem;font-weight:600;letter-spacing:0.02em;text-transform:uppercase;color:var(--color-text-muted);border-bottom:1px solid var(--color-border);white-space:nowrap}
.sox-table td{padding:0.625rem 0.75rem;border-bottom:1px solid var(--color-border);vertical-align:middle;color:var(--color-text)}
.sox-table tbody tr:last-child td{border-bottom:0}
.sox-table tbody tr:hover{background:var(--color-bg-subtle)}
.sox-table tr.is-selected{background:var(--color-primary-subtle)}
.sox-check{width:36px}
.sox-check input{width:16px;height:16px;cursor:pointer;accent-color:var(--color-primary)}
.sox-num{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}

.sox-ordno{font-weight:600;color:var(--color-text);text-decoration:none}
.sox-ordno:hover{text-decoration:underline;color:var(--color-primary)}
.sox-sub{margin:0.125rem 0 0;font-size:0.75rem;color:var(--color-text-muted)}
.sox-badges{display:flex;flex-wrap:wrap;gap:0.25rem;align-items:center}

/* --- Row actions kebab -------------------------------------------------- */
.sox-actions{width:1%;text-align:right;white-space:nowrap}
.sox-kebab{appearance:none;border:1px solid transparent;background:transparent;color:var(--color-text-secondary);width:30px;height:30px;border-radius:var(--radius-md);cursor:pointer;font-size:1.1rem;line-height:1;display:inline-flex;align-items:center;justify-content:center}
.sox-kebab:hover{background:var(--color-bg-subtle);border-color:var(--color-border)}
.sox-kebab:focus-visible{outline:2px solid var(--color-border-focus);outline-offset:1px}
.sox-menu-overlay{position:fixed;inset:0;z-index:40}
.sox-menu{position:fixed;z-index:41;min-width:200px;background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-md);box-shadow:var(--shadow-lg,0 10px 30px rgba(0,0,0,0.15));padding:0.25rem;transform:translateX(-100%)}
.sox-menu button,.sox-menu a{display:flex;align-items:center;gap:0.5rem;width:100%;text-align:left;appearance:none;border:0;background:transparent;color:var(--color-text);padding:0.5rem 0.625rem;font-size:0.8125rem;border-radius:var(--radius-sm);cursor:pointer;text-decoration:none}
.sox-menu button:hover,.sox-menu a:hover{background:var(--color-bg-subtle)}
.sox-menu-sep{height:1px;background:var(--color-border);margin:0.25rem 0}
.sox-menu-head{padding:0.375rem 0.625rem;font-size:0.6875rem;font-weight:600;letter-spacing:0.02em;text-transform:uppercase;color:var(--color-text-muted)}

/* --- Empty / loading / errors ------------------------------------------- */
.sox-empty{border:1px dashed var(--color-border);border-radius:var(--radius-lg);padding:3rem 1.5rem;text-align:center;color:var(--color-text-muted)}
.sox-empty h3{margin:0 0 0.375rem;font-size:1rem;color:var(--color-text)}
.sox-empty p{margin:0 0 1rem;font-size:0.875rem}
.sox-loading{padding:2.5rem;text-align:center;color:var(--color-text-muted);font-size:0.875rem}
.sox-error{margin:0 0 1rem;padding:0.625rem 0.875rem;border-radius:var(--radius-md);border:1px solid var(--color-error);background:var(--color-error-bg);color:var(--color-error);font-size:0.875rem}
.sox-notice{margin:0;padding:0.75rem 1rem;border-radius:var(--radius-md);border:1px solid var(--color-border);background:var(--color-bg-subtle);color:var(--color-text);font-size:0.875rem}

/* --- Pagination --------------------------------------------------------- */
.sox-pager{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:0.75rem;margin-top:1rem}
.sox-pager-info{font-size:0.8125rem;color:var(--color-text-muted)}
.sox-pager-btns{display:flex;gap:0.375rem;align-items:center}

/* --- Single order: header ------------------------------------------------ */
.sox-back{display:inline-block;margin-bottom:0.5rem;font-size:0.8125rem;color:var(--color-text-muted);text-decoration:none}
.sox-back:hover{color:var(--color-primary);text-decoration:underline}
.sox-orderhead{display:flex;flex-wrap:wrap;align-items:flex-start;justify-content:space-between;gap:0.75rem;margin-bottom:1rem}
.sox-orderhead h1{margin:0;font-size:1.5rem;line-height:1.2}
.sox-orderhead-meta{margin:0.375rem 0 0;font-size:0.8125rem;color:var(--color-text-muted)}
.sox-orderhead-actions{display:flex;flex-wrap:wrap;gap:0.5rem;align-items:center}

/* --- Single order: layout ------------------------------------------------ */
.sox-cols{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:1rem;align-items:start}
.sox-col{min-width:0}
@media (max-width:980px){.sox-cols{grid-template-columns:minmax(0,1fr)}}

/* --- Single order: items -------------------------------------------------- */
.sox-items{width:100%;border-collapse:collapse;font-size:0.875rem}
.sox-items th{text-align:left;padding:0.625rem 1rem;font-size:0.75rem;font-weight:600;letter-spacing:0.02em;text-transform:uppercase;color:var(--color-text-muted);border-bottom:1px solid var(--color-border);white-space:nowrap}
.sox-items td{padding:0.75rem 1rem;border-bottom:1px solid var(--color-border);vertical-align:top}
.sox-items tbody tr:last-child td{border-bottom:1px solid var(--color-border)}
.sox-item-name{font-weight:600;color:var(--color-text);text-decoration:none}
.sox-item-name:hover{color:var(--color-primary);text-decoration:underline}
.sox-meta-list{list-style:none;margin:0.375rem 0 0;padding:0;display:grid;gap:0.125rem}
.sox-meta-list li{font-size:0.8125rem;color:var(--color-text-muted)}
.sox-meta-list b{font-weight:500;color:var(--color-text-secondary)}
.sox-linepills{display:flex;flex-wrap:wrap;gap:0.25rem;margin-top:0.375rem}

/* --- Single order: totals ------------------------------------------------- */
.sox-totals{display:grid;grid-template-columns:1fr auto;gap:0.375rem 1rem;margin:0;font-size:0.875rem}
.sox-totals dt{color:var(--color-text-secondary)}
.sox-totals dd{margin:0;text-align:right;font-variant-numeric:tabular-nums}
.sox-totals .sox-total-row{font-weight:600;font-size:1rem;color:var(--color-text);border-top:1px solid var(--color-border);padding-top:0.5rem;margin-top:0.25rem}

/* --- Single order: sidebar details --------------------------------------- */
.sox-detail{display:grid;gap:0.625rem;margin:0;font-size:0.875rem}
.sox-detail-row{display:grid;gap:0.125rem}
.sox-detail-row dt{font-size:0.75rem;font-weight:600;letter-spacing:0.02em;text-transform:uppercase;color:var(--color-text-muted)}
.sox-detail-row dd{margin:0;color:var(--color-text);word-break:break-word}
.sox-detail-row a{color:var(--color-primary);text-decoration:none}
.sox-detail-row a:hover{text-decoration:underline}
.sox-address{margin:0;font-size:0.875rem;line-height:1.5;font-style:normal;color:var(--color-text)}
.sox-copy{appearance:none;border:1px solid var(--color-border);background:var(--color-surface);color:var(--color-text-secondary);border-radius:var(--radius-sm);font-size:0.6875rem;padding:0.125rem 0.5rem;cursor:pointer}
.sox-copy:hover{background:var(--color-bg-subtle);color:var(--color-text)}

/* --- Single order: timeline ----------------------------------------------- */
.sox-timeline{list-style:none;margin:0;padding:0;display:grid;gap:0.875rem}
.sox-event{display:grid;grid-template-columns:26px minmax(0,1fr);gap:0.625rem;align-items:start}
.sox-event-icon{width:26px;height:26px;border-radius:999px;display:flex;align-items:center;justify-content:center;font-size:0.75rem;background:var(--color-bg-subtle);border:1px solid var(--color-border);color:var(--color-text-secondary)}
.sox-event-body{min-width:0}
.sox-event-title{margin:0;font-size:0.875rem;color:var(--color-text)}
.sox-event-note{margin:0.125rem 0 0;font-size:0.875rem;color:var(--color-text);white-space:pre-wrap;word-break:break-word}
.sox-event-when{margin:0.125rem 0 0;font-size:0.75rem;color:var(--color-text-muted)}
.sox-composer{display:grid;gap:0.5rem;margin-top:1rem;padding-top:1rem;border-top:1px solid var(--color-border)}
.sox-composer textarea{width:100%;min-height:72px;padding:0.5rem 0.625rem;border-radius:var(--radius-md);border:1px solid var(--color-border);background:var(--color-surface);color:var(--color-text);font-size:0.875rem;font-family:inherit;resize:vertical}
.sox-composer textarea:focus-visible{outline:2px solid var(--color-border-focus);outline-offset:1px}
.sox-composer-row{display:flex;align-items:center;justify-content:space-between;gap:0.5rem;flex-wrap:wrap}

/* --- Single order: parcels / refunds / downloads -------------------------- */
.sox-list{list-style:none;margin:0;padding:0;display:grid;gap:0.75rem}
.sox-list li{display:flex;flex-wrap:wrap;gap:0.5rem;align-items:flex-start;justify-content:space-between;font-size:0.875rem}
.sox-list-main{min-width:0;flex:1 1 200px}
.sox-list-title{margin:0;font-weight:600;color:var(--color-text)}
.sox-list-sub{margin:0.125rem 0 0;font-size:0.8125rem;color:var(--color-text-muted)}

/* --- Print: a packing slip, not a screenshot of the admin ---------------- */
@media print{
  .sox-noprint,.admin-sidebar,.admin-header,nav,header,footer,.sox-orderhead-actions,.sox-composer,.sox-back{display:none !important}
  .sox-cols{grid-template-columns:minmax(0,1fr) !important;gap:0.5rem}
  .sox-card{border:1px solid #999;break-inside:avoid}
  .sox-card-head{background:transparent}
  .sox-print-only{display:block !important}
  body{background:#fff}
}
.sox-print-only{display:none}

@media (max-width:640px){
  .sox-toolbar{gap:0.375rem}
  .sox-orderhead h1{font-size:1.25rem}
}
`
