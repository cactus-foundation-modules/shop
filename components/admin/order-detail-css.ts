/** Order workspace only. Uses the inbox's surface/background pairing in both themes. */
export const orderDetailCss = `
.sod-app{min-width:0;border:1px solid var(--color-border);border-radius:1.25rem;background:var(--color-bg);color:var(--color-text);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
.sod-app>.sox-back{margin:1rem 1.25rem 0.75rem}
.sod-app>.sox-orderhead{padding:0 1.25rem;margin-bottom:1.25rem}
.sod-app .sox-orderhead h1{font-size:1.5rem;letter-spacing:-0.035em;font-weight:650}
.sod-app .btn,.sod-app .sox-select,.sod-app .sox-input{border-radius:0.65rem}
.sod-app .badge{border-radius:999px}
.sod-summary{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));margin:0 1.25rem 1.25rem;background:var(--color-surface);border:1px solid var(--color-border);border-radius:1rem;overflow:hidden}
.sod-summary>div{padding:1rem;min-width:0;border-left:1px solid var(--color-border)}
.sod-summary>div:first-child{border-left:0}
.sod-summary dt{font-size:0.75rem;color:var(--color-text-secondary);margin-bottom:0.4rem}
.sod-summary dd{margin:0;font-size:1.0625rem;font-weight:600;letter-spacing:-0.025em;overflow-wrap:anywhere}
.sod-summary>div:first-child dd{font-size:1.75rem;font-variant-numeric:tabular-nums}
.sod-summary-status .sox-select{width:100%;font-size:0.875rem;font-weight:500;letter-spacing:0}
.sod-summary-check{display:flex;gap:0.5rem;align-items:center;margin-top:0.45rem;color:var(--color-text-secondary);font-size:0.75rem;font-weight:400;letter-spacing:0}
.sod-summary small{display:block;margin-top:0.35rem;color:var(--color-text-secondary);font-size:0.75rem;font-weight:400;letter-spacing:0;overflow-wrap:anywhere}
.sod-app>.sox-notice{margin:0 1.25rem 1rem}
.sod-navigation{display:flex;flex-wrap:wrap;gap:0.25rem;padding:0.375rem;margin:0 1.25rem 1rem;border:1px solid var(--color-border);border-radius:0.875rem;width:fit-content;max-width:calc(100% - 2.5rem);background:var(--color-bg)}
.sod-navigation button{appearance:none;border:1px solid transparent;border-radius:0.625rem;padding:0.5rem 0.875rem;background:transparent;color:var(--color-text-secondary);font:inherit;font-size:0.8125rem;font-weight:550;cursor:pointer}
.sod-navigation button:hover{background:var(--color-surface)}
.sod-navigation button[aria-current]{background:var(--color-surface);color:var(--color-text);border-color:var(--color-border);box-shadow:var(--shadow-sm)}
.sod-app :is(button,a,summary,select,textarea,input):focus-visible{outline:2px solid var(--color-border-focus);outline-offset:3px}
.sod-workspace{display:grid;grid-template-columns:minmax(0,1fr) 300px;border-top:1px solid var(--color-border)}
.sod-main{min-width:0;padding:1.25rem;background:var(--color-surface);border-radius:0 0 0 1.25rem}
.sod-inspector{min-width:0;padding:1.25rem;border-left:1px solid var(--color-border)}
.sod-app .sox-card{border-radius:0.875rem}
.sod-app .sox-card-head{background:transparent;padding:0.875rem 1rem}
.sod-app .sox-card-head h2,.sod-app .sox-card-head h3{font-size:0.9375rem;text-transform:none;letter-spacing:-0.015em;color:var(--color-text);font-weight:600}
.sod-app .sox-detail-row dt{text-transform:none;letter-spacing:0;font-weight:500}
.sod-panel>.sox-card,.sod-panel>.sox-notice{margin-bottom:1rem}
.sod-panel>.sox-card:last-child{margin-bottom:0}
.sod-panel[hidden]{display:none}
.sod-app .sox-card-body.is-flush{overflow-x:auto}
.sod-app .sox-items{min-width:450px}
.sod-app .sox-items .sox-num{text-align:right}
.sod-more{position:relative;font-size:0.8125rem}
.sod-more summary{cursor:pointer;border:1px solid var(--color-border);border-radius:0.65rem;background:var(--color-surface);padding:0.45rem 0.75rem;list-style:none}
.sod-more summary::-webkit-details-marker{display:none}
.sod-more summary::after{content:'⌄';margin-left:0.75rem}
.sod-more-menu{position:absolute;right:0;top:calc(100% + 0.5rem);z-index:10;display:grid;gap:0.25rem;min-width:190px;padding:0.375rem;background:var(--color-surface);border:1px solid var(--color-border);border-radius:0.875rem;box-shadow:var(--shadow-lg)}
.sod-more-menu .btn{justify-content:flex-start;text-align:left}
@media(max-width:1100px){.sod-summary{grid-template-columns:repeat(2,minmax(0,1fr))}.sod-summary>div:nth-child(3),.sod-summary>div:nth-child(5){border-left:0}.sod-summary>div:nth-child(5){grid-column:1/-1}.sod-summary>div:nth-child(n+3){border-top:1px solid var(--color-border)}.sod-workspace{grid-template-columns:minmax(0,1fr) 270px}}
@media(max-width:800px){.sod-workspace{grid-template-columns:minmax(0,1fr)}.sod-inspector{border-left:0;border-top:1px solid var(--color-border)}.sod-main{border-radius:0}.sod-app .sox-orderhead-actions{width:100%}.sod-summary,.sod-navigation{margin-left:0.75rem;margin-right:0.75rem}.sod-main,.sod-inspector{padding:0.75rem}.sod-app>.sox-orderhead{padding:0 0.75rem}.sod-navigation button{padding:0.5rem 0.625rem}}
@media(pointer:coarse){.sod-app .btn,.sod-app .sox-copy,.sod-navigation button,.sod-more summary{min-height:44px}.sod-app .sox-copy{padding:0.5rem}}
@media print{.sod-app{border:0;background:var(--color-surface)}.sod-workspace{display:block}.sod-panel[hidden]{display:block}.sod-inspector{border-left:0}.sod-summary{grid-template-columns:repeat(4,minmax(0,1fr))}.sod-summary>div{border:0}.sod-app .sox-items{min-width:0}.sod-app .sox-card-body.is-flush{overflow:visible}}
`
