// Stylesheet for the product editor, emitted once by the shell. Class prefix
// `spe-`. Real CSS rather than inline styles so focus rings, hover states and
// the sidebar collapse actually work; colours are tokens only, so the editor
// tracks the admin's light/dark theme with no second palette to keep in step.
export const productEditorCss = `
.spe-layout{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:1.5rem;align-items:start}
@media (max-width:1100px){.spe-layout{grid-template-columns:minmax(0,1fr)}}

/* --- Sidebar ------------------------------------------------------------ */
.spe-side{position:sticky;top:1rem;display:flex;flex-direction:column;gap:0.75rem}
@media (max-width:1100px){.spe-side{position:static;order:-1}}
.spe-card{background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-lg);padding:1rem}
.spe-card-title{margin:0 0 0.75rem;font-size:0.75rem;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:var(--color-text-muted)}
.spe-cover{width:100%;aspect-ratio:1;object-fit:cover;border-radius:var(--radius-md);border:1px solid var(--color-border);display:block;background:var(--color-bg-subtle)}
.spe-cover-empty{width:100%;aspect-ratio:1;border-radius:var(--radius-md);border:1px dashed var(--color-border);display:flex;align-items:center;justify-content:center;color:var(--color-text-muted);font-size:0.8125rem;text-align:center;padding:0.5rem}
.spe-facts{display:grid;gap:0.5rem;margin:0}
.spe-fact{display:flex;justify-content:space-between;align-items:baseline;gap:0.75rem;font-size:0.8125rem}
.spe-fact dt{color:var(--color-text-muted);margin:0}
.spe-fact dd{margin:0;font-weight:600;text-align:right}

/* --- Save bar ----------------------------------------------------------- */
.spe-save{display:flex;flex-direction:column;gap:0.5rem}
.spe-save-btn{width:100%;justify-content:center}
.spe-save-note{margin:0;font-size:0.75rem;color:var(--color-text-muted);text-align:center}
.spe-dirty-list{margin:0;padding:0;list-style:none;display:flex;flex-wrap:wrap;gap:0.25rem;justify-content:center}
.spe-dirty-chip{font-size:0.6875rem;padding:0.0625rem 0.375rem;border-radius:var(--radius-full);background:var(--color-warning-subtle);color:var(--color-warning);border:1px solid var(--color-warning-border)}

/* --- Tabs --------------------------------------------------------------- */
.spe-tab-inner{display:inline-flex;align-items:center;gap:0.375rem}
.spe-tab-badge{font-size:0.6875rem;font-weight:600;line-height:1;padding:0.125rem 0.3125rem;border-radius:var(--radius-full);background:var(--color-bg-subtle);border:1px solid var(--color-border);color:var(--color-text-muted)}
.spe-tab-dot{width:6px;height:6px;border-radius:var(--radius-full);background:var(--color-warning);flex-shrink:0}
.spe-tab-dot-error{background:var(--color-danger)}

/* --- Panels ------------------------------------------------------------- */
.spe-panel{display:grid;gap:1.25rem;margin:0}
/* Grid children default to min-width:auto, so they refuse to shrink below their
   content's intrinsic width. A panel holding something wide (the variants table)
   would then push past the layout's main column and end up under the sidebar.
   Flooring at 0 lets a panel take its column's width, so any overflow:auto
   wrapper inside it can actually scroll. */
.spe-panel>*,.spe-grid>*{min-width:0}
.spe-section{background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-lg);padding:1.25rem}
.spe-section-head{margin:0 0 0.25rem;font-size:0.9375rem;font-weight:600}
.spe-section-blurb{margin:0 0 1rem;font-size:0.8125rem;color:var(--color-text-muted);max-width:60ch}
.spe-grid{display:grid;gap:1rem}
.spe-grid-2{grid-template-columns:repeat(2,minmax(0,1fr))}
.spe-grid-3{grid-template-columns:repeat(3,minmax(0,1fr))}
.spe-grid-4{grid-template-columns:repeat(4,minmax(0,1fr))}
@media (max-width:760px){.spe-grid-2,.spe-grid-3,.spe-grid-4{grid-template-columns:minmax(0,1fr)}}

/* --- Fields ------------------------------------------------------------- */
.spe-field{display:grid;gap:0.3125rem;min-width:0}
.spe-label{font-size:0.8125rem;font-weight:600;color:var(--color-text)}
.spe-optional{font-weight:400;color:var(--color-text-muted)}
.spe-hint{font-size:0.75rem;color:var(--color-text-muted);margin:0;max-width:60ch}
.spe-error{font-size:0.75rem;color:var(--color-danger);margin:0;display:flex;align-items:center;gap:0.25rem}
.spe-control{width:100%;padding:0.5rem 0.625rem;border:1px solid var(--color-border);border-radius:var(--radius-md);background:var(--color-bg);color:var(--color-text);font:inherit;font-size:0.875rem;transition:border-color 120ms,box-shadow 120ms}
.spe-control:hover:not(:disabled):not(:focus){border-color:var(--color-border-strong)}
.spe-control:focus{outline:none;border-color:var(--color-border-focus);box-shadow:0 0 0 3px var(--color-primary-glow)}
.spe-control:disabled{background:var(--color-bg-subtle);color:var(--color-text-disabled);cursor:not-allowed}
.spe-control[aria-invalid="true"]{border-color:var(--color-danger)}
.spe-control[aria-invalid="true"]:focus{box-shadow:0 0 0 3px var(--color-destructive-subtle)}
textarea.spe-control{resize:vertical;min-height:5rem;line-height:1.5}
select.spe-control{cursor:pointer}
.spe-prefixed{display:flex;align-items:stretch}
.spe-prefix{display:flex;align-items:center;padding:0 0.625rem;border:1px solid var(--color-border);border-right:none;border-radius:var(--radius-md) 0 0 var(--radius-md);background:var(--color-bg-subtle);color:var(--color-text-muted);font-size:0.875rem;white-space:nowrap}
.spe-prefixed .spe-control{border-radius:0 var(--radius-md) var(--radius-md) 0}
.spe-suffix{display:flex;align-items:center;padding:0 0.625rem;border:1px solid var(--color-border);border-left:none;border-radius:0 var(--radius-md) var(--radius-md) 0;background:var(--color-bg-subtle);color:var(--color-text-muted);font-size:0.875rem;white-space:nowrap}
.spe-prefixed:has(.spe-suffix) .spe-control{border-radius:0}
.spe-prefixed:has(.spe-suffix):not(:has(.spe-prefix)) .spe-control{border-radius:var(--radius-md) 0 0 var(--radius-md)}
.spe-count{font-size:0.6875rem;color:var(--color-text-muted);text-align:right}
.spe-count-over{color:var(--color-danger)}

/* --- Switch ------------------------------------------------------------- */
.spe-switch{display:flex;align-items:flex-start;gap:0.625rem;cursor:pointer}
.spe-switch input{margin:0.1875rem 0 0;width:1rem;height:1rem;accent-color:var(--color-primary);cursor:pointer;flex-shrink:0}
.spe-switch-text{display:grid;gap:0.125rem}
.spe-switch-label{font-size:0.875rem;font-weight:600}
.spe-switch-hint{font-size:0.75rem;color:var(--color-text-muted)}

/* --- Reveal (conditional block under a switch) -------------------------- */
.spe-reveal{margin-top:1rem;padding-top:1rem;border-top:1px solid var(--color-border)}

/* --- Checkable list (categories/tags/collections) ----------------------- */
.spe-checks{display:grid;gap:0.125rem;max-height:20rem;overflow-y:auto;margin:0;padding:0.25rem;border:1px solid var(--color-border);border-radius:var(--radius-md);background:var(--color-bg)}
.spe-check{display:flex;align-items:center;gap:0.5rem;padding:0.3125rem 0.5rem;border-radius:var(--radius-sm);font-size:0.875rem;cursor:pointer}
.spe-check:hover{background:var(--color-bg-subtle)}
.spe-check input{accent-color:var(--color-primary);cursor:pointer;flex-shrink:0}
.spe-check-empty{padding:0.75rem;font-size:0.8125rem;color:var(--color-text-muted);margin:0}

/* --- Media -------------------------------------------------------------- */
.spe-media{display:grid;grid-template-columns:repeat(auto-fill,minmax(9rem,1fr));gap:0.75rem}
.spe-media-item{position:relative;border:1px solid var(--color-border);border-radius:var(--radius-md);overflow:hidden;background:var(--color-bg-subtle)}
.spe-media-item[data-dragging="true"]{opacity:0.4}
.spe-media-item[data-drop="true"]{outline:2px solid var(--color-primary);outline-offset:1px}
.spe-media-img{width:100%;aspect-ratio:1;object-fit:cover;display:block}
.spe-media-bar{display:flex;align-items:center;justify-content:space-between;gap:0.25rem;padding:0.25rem;background:var(--color-surface);border-top:1px solid var(--color-border)}
.spe-media-cover{position:absolute;top:0.375rem;left:0.375rem;font-size:0.625rem;font-weight:600;padding:0.125rem 0.375rem;border-radius:var(--radius-full);background:var(--color-primary);color:var(--color-on-primary)}
.spe-media-handle{cursor:grab;color:var(--color-text-muted);background:none;border:none;padding:0.125rem 0.25rem;font-size:0.875rem;line-height:1}
.spe-media-handle:active{cursor:grabbing}
.spe-icon-btn{background:none;border:none;cursor:pointer;color:var(--color-text-muted);padding:0.125rem 0.25rem;border-radius:var(--radius-sm);font-size:0.875rem;line-height:1;display:inline-flex;align-items:center}
.spe-icon-btn:hover{background:var(--color-bg-subtle);color:var(--color-text)}
.spe-icon-btn-danger:hover{background:var(--color-destructive-subtle);color:var(--color-destructive)}
.spe-alt{width:100%;border:none;border-top:1px solid var(--color-border);padding:0.25rem 0.375rem;font:inherit;font-size:0.6875rem;background:var(--color-bg);color:var(--color-text)}
.spe-alt:focus{outline:none;background:var(--color-bg-subtle)}
.spe-empty{border:1px dashed var(--color-border);border-radius:var(--radius-md);padding:2rem 1rem;text-align:center;color:var(--color-text-muted);font-size:0.875rem}

/* --- SEO preview -------------------------------------------------------- */
.spe-serp{border:1px solid var(--color-border);border-radius:var(--radius-md);padding:0.875rem;background:var(--color-bg)}
.spe-serp-url{font-size:0.75rem;color:var(--color-success);margin:0 0 0.125rem;word-break:break-all}
.spe-serp-title{font-size:1.0625rem;color:var(--color-link);margin:0 0 0.125rem;line-height:1.3}
.spe-serp-desc{font-size:0.8125rem;color:var(--color-text-muted);margin:0;line-height:1.4}

/* --- Margin readout ----------------------------------------------------- */
.spe-margin{display:flex;flex-wrap:wrap;gap:1.5rem;padding:0.75rem 1rem;border-radius:var(--radius-md);background:var(--color-bg-subtle);border:1px solid var(--color-border)}
.spe-margin-item{display:grid;gap:0.125rem}
.spe-margin-label{font-size:0.6875rem;text-transform:uppercase;letter-spacing:0.04em;color:var(--color-text-muted)}
.spe-margin-value{font-size:1rem;font-weight:600}
.spe-margin-value[data-tone="bad"]{color:var(--color-danger)}
.spe-margin-value[data-tone="good"]{color:var(--color-success)}
`
