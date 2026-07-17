// Stylesheet for the admin products list, emitted once by the screen. Class
// prefix `sps-`. Real CSS (not inline styles) so hover, focus rings and the
// sticky bulk bar work; colours are tokens only, so it tracks the admin's
// light/dark theme with no second palette to keep in step.
export const productsScreenCss = `
.sps-count{margin:0.25rem 0 0;font-size:0.875rem;color:var(--color-text-muted)}

/* --- Toolbar ------------------------------------------------------------ */
.sps-toolbar{display:flex;flex-wrap:wrap;gap:0.5rem;align-items:center;margin-bottom:1rem}
.sps-search{flex:1 1 220px;min-width:180px;height:36px;padding:0 0.75rem;border-radius:var(--radius-md);border:1px solid var(--color-border);background:var(--color-surface);color:var(--color-text);font-size:0.875rem}
.sps-search:focus-visible{outline:2px solid var(--color-border-focus);outline-offset:1px}
.sps-select{height:36px;padding:0 2rem 0 0.625rem;border-radius:var(--radius-md);border:1px solid var(--color-border);background:var(--color-surface);color:var(--color-text);font-size:0.8125rem;cursor:pointer}
.sps-select:focus-visible{outline:2px solid var(--color-border-focus);outline-offset:1px}

/* Segmented status control */
.sps-seg{display:inline-flex;border:1px solid var(--color-border);border-radius:var(--radius-md);overflow:hidden;background:var(--color-surface)}
.sps-seg button{appearance:none;border:0;background:transparent;color:var(--color-text-secondary);padding:0 0.75rem;height:34px;font-size:0.8125rem;font-weight:500;cursor:pointer;border-left:1px solid var(--color-border)}
.sps-seg button:first-child{border-left:0}
.sps-seg button:hover:not(.is-active){background:var(--color-bg-subtle)}
.sps-seg button.is-active{background:var(--color-primary);color:#fff}

/* --- Bulk action bar ---------------------------------------------------- */
.sps-bulkbar{position:sticky;top:0.5rem;z-index:5;display:flex;flex-wrap:wrap;align-items:center;gap:0.5rem;margin-bottom:0.75rem;padding:0.5rem 0.75rem;border:1px solid var(--color-primary-border);background:var(--color-primary-subtle);border-radius:var(--radius-md)}
.sps-bulkbar-count{font-size:0.8125rem;font-weight:600;color:var(--color-primary-dark);margin-right:0.25rem}
.sps-bulkbar-spacer{flex:1}

/* --- Table -------------------------------------------------------------- */
.sps-wrap{overflow-x:auto;border:1px solid var(--color-border);border-radius:var(--radius-lg);background:var(--color-surface)}
.sps-table{width:100%;border-collapse:collapse;font-size:0.875rem}
.sps-table th{position:sticky;top:0;text-align:left;padding:0.625rem 0.75rem;background:var(--color-bg-subtle);font-size:0.75rem;font-weight:600;letter-spacing:0.02em;text-transform:uppercase;color:var(--color-text-muted);border-bottom:1px solid var(--color-border);white-space:nowrap}
.sps-table td{padding:0.5rem 0.75rem;border-bottom:1px solid var(--color-border);vertical-align:middle;color:var(--color-text)}
.sps-table tbody tr:last-child td{border-bottom:0}
.sps-table tbody tr:hover{background:var(--color-bg-subtle)}
.sps-table tr.is-selected{background:var(--color-primary-subtle)}
.sps-check{width:36px}
.sps-check input{width:16px;height:16px;cursor:pointer;accent-color:var(--color-primary)}

.sps-thumb{width:40px;height:40px;border-radius:var(--radius-md);object-fit:cover;border:1px solid var(--color-border);background:var(--color-bg-subtle);display:block}
.sps-thumb-empty{width:40px;height:40px;border-radius:var(--radius-md);border:1px dashed var(--color-border);display:flex;align-items:center;justify-content:center;color:var(--color-text-muted);font-size:1rem;background:var(--color-bg-subtle)}

.sps-name{font-weight:600;color:var(--color-text);text-decoration:none}
.sps-name:hover{text-decoration:underline;color:var(--color-primary)}
.sps-slug{margin:0.125rem 0 0;font-size:0.75rem;color:var(--color-text-muted);font-family:var(--font-mono,monospace)}
.sps-price-was{margin-left:0.375rem;color:var(--color-text-muted);text-decoration:line-through;font-size:0.8125rem}
.sps-subs{color:var(--color-primary);text-decoration:none;font-weight:500}
.sps-subs:hover{text-decoration:underline}
.sps-muted{color:var(--color-text-muted)}

/* --- Row actions kebab -------------------------------------------------- */
.sps-actions{width:44px;text-align:right}
.sps-kebab{appearance:none;border:1px solid transparent;background:transparent;color:var(--color-text-secondary);width:30px;height:30px;border-radius:var(--radius-md);cursor:pointer;font-size:1.1rem;line-height:1;display:inline-flex;align-items:center;justify-content:center}
.sps-kebab:hover{background:var(--color-bg-subtle);border-color:var(--color-border)}
.sps-kebab:focus-visible{outline:2px solid var(--color-border-focus);outline-offset:1px}
.sps-menu-overlay{position:fixed;inset:0;z-index:40}
.sps-menu{position:fixed;z-index:41;min-width:170px;background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-md);box-shadow:var(--shadow-lg,0 10px 30px rgba(0,0,0,0.15));padding:0.25rem;transform:translateX(-100%)}
.sps-menu button{display:flex;align-items:center;gap:0.5rem;width:100%;text-align:left;appearance:none;border:0;background:transparent;color:var(--color-text);padding:0.5rem 0.625rem;font-size:0.8125rem;border-radius:var(--radius-sm);cursor:pointer}
.sps-menu button:hover{background:var(--color-bg-subtle)}
.sps-menu button.sps-menu-danger{color:var(--color-error)}
.sps-menu button.sps-menu-danger:hover{background:var(--color-error-bg)}
.sps-menu-sep{height:1px;background:var(--color-border);margin:0.25rem 0}

/* --- Empty / loading ---------------------------------------------------- */
.sps-empty{border:1px dashed var(--color-border);border-radius:var(--radius-lg);padding:3rem 1.5rem;text-align:center;color:var(--color-text-muted)}
.sps-empty h3{margin:0 0 0.375rem;font-size:1rem;color:var(--color-text)}
.sps-empty p{margin:0 0 1rem;font-size:0.875rem}
.sps-loading{padding:2.5rem;text-align:center;color:var(--color-text-muted);font-size:0.875rem}

/* --- Pagination --------------------------------------------------------- */
.sps-pager{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:0.75rem;margin-top:1rem}
.sps-pager-info{font-size:0.8125rem;color:var(--color-text-muted)}
.sps-pager-btns{display:flex;gap:0.375rem}

@media (max-width:640px){
  .sps-slug{display:none}
  .sps-toolbar{gap:0.375rem}
}
`
