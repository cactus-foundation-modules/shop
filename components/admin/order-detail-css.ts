/** Order workspace only. Uses the inbox's surface/background pairing in both themes. */
export const orderDetailCss = `
.sod-app{min-width:0;background:var(--color-bg);color:var(--color-text);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
.sod-app>.sox-orderhead{padding:0;margin:1rem 0 1.25rem}
.sod-app .sox-orderhead-title{display:flex;flex-wrap:wrap;align-items:baseline;column-gap:0.875rem;row-gap:0.125rem}
.sod-app .sox-orderhead-title .sox-orderhead-meta{margin:0}
.sod-app .sox-orderhead-title .sox-badges{align-self:center}
.sod-app .sox-orderhead h1{font-size:1.5rem;letter-spacing:-0.035em;font-weight:650}
.sod-app .btn,.sod-app .sox-select,.sod-app .sox-input{border-radius:0.65rem}
.sod-app .badge{border-radius:999px}
.sod-summary{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));margin:0 0 1.25rem;background:var(--color-surface);border:1px solid var(--color-border);border-radius:1rem;overflow:hidden}
.sod-summary>div{padding:1rem;min-width:0;border-left:1px solid var(--color-border)}
.sod-summary>div:first-child{border-left:0}
.sod-summary dt{font-size:0.75rem;color:var(--color-text-secondary);margin-bottom:0.4rem}
.sod-summary dd{margin:0;font-size:1.0625rem;font-weight:600;letter-spacing:-0.025em;overflow-wrap:anywhere}
.sod-summary>div:first-child dd{font-size:1.75rem;font-variant-numeric:tabular-nums}
.sod-summary-status .sox-select{width:100%;font-size:0.875rem;font-weight:500;letter-spacing:0}
.sod-summary-check{display:flex;gap:0.5rem;align-items:center;margin-top:0.45rem;color:var(--color-text-secondary);font-size:0.75rem;font-weight:400;letter-spacing:0}
.sod-summary small{display:block;margin-top:0.35rem;color:var(--color-text-secondary);font-size:0.75rem;font-weight:400;letter-spacing:0;overflow-wrap:anywhere}
.sod-app>.sox-notice{margin:0 0 1rem}
.sod-navigation{margin:0 0 1rem}
/* Auto margins centre the tabs when they all fit and collapse to nothing when they overflow, so the strip still scrolls from its left edge. */
.sod-navigation .no-scrollbar>:first-child{margin-left:auto}
.sod-navigation .no-scrollbar>:last-child{margin-right:auto}
.sod-app :is(button,a,summary,select,textarea,input):focus-visible{outline:2px solid var(--color-border-focus);outline-offset:3px}
.sod-workspace{display:grid;grid-template-columns:minmax(0,1fr) 300px}
.sod-main{min-width:0;padding:0.125rem 0 1.25rem}
.sod-inspector{min-width:0;padding:0.125rem 0 1.25rem 1.25rem}
.sod-app .sox-card{border-radius:0.875rem}
.sod-app .sox-card-head{background:transparent;padding:0.875rem 1rem}
.sod-app .sox-card-head h2,.sod-app .sox-card-head h3{font-size:0.9375rem;text-transform:none;letter-spacing:-0.015em;color:var(--color-text);font-weight:600}
.sod-app .sox-detail-row dt{text-transform:none;letter-spacing:0;font-weight:500}
.sod-panel>.sox-card,.sod-panel>.sox-notice{margin-bottom:1rem}
.sod-panel>.sox-card:last-child{margin-bottom:0}
.sod-panel[hidden]{display:none}
.sod-app .sod-pair{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1rem;align-items:stretch;margin-bottom:1rem}
.sod-app .sod-pair>.sox-card,.sod-app .sod-pair>.sox-notice,.sod-app .sod-panels>.sox-card{margin:0}
.sod-solo{margin-bottom:1rem}
.sod-panels{display:flex;flex-direction:column;gap:1rem;min-width:0}
.sod-panels>.sox-card:last-child{flex:1}
.sod-panels:empty{display:none}
.sod-pair:has(>.sod-panels:empty){grid-template-columns:minmax(0,1fr)}
@media(max-width:800px){.sod-app .sod-pair{grid-template-columns:minmax(0,1fr)}}
.sod-app .sox-card-body.is-flush{overflow-x:auto}
.sod-app .sox-items{min-width:450px}
.sod-app .sox-items .sox-num{text-align:right}
/* A line's delivery row sits under it as part of the same line: no rule between them, quieter type, indented a touch. */
.sod-app .sox-items tr.sod-has-charges>td,.sod-app .sox-items tr.sod-charge-row:not(.is-last)>td{border-bottom:0}
.sod-app .sox-items tr.sod-has-charges>td{padding-bottom:0.375rem}
.sod-app .sox-items tr.sod-charge-row>td{padding-top:0.25rem;font-size:0.8125rem;color:var(--color-text-secondary)}
.sod-app .sox-items tr.sod-charge-row:not(.is-last)>td{padding-bottom:0.25rem}
.sod-app .sox-items tr.sod-charge-row>td:first-child{padding-left:1.75rem}
.sod-app .sox-items tr.sod-charge-row b{font-weight:500}
/* The action row, drawn the way the inbox draws a conversation's: glass capsules of icons with a hairline between neighbours. The washes are the text colour mixed thin, the one token that stands off both grounds in both themes. */
.sod-app{--sod-fill:color-mix(in srgb,var(--color-text) 7%,transparent);--sod-fill-hover:color-mix(in srgb,var(--color-text) 12%,transparent);--sod-edge:color-mix(in srgb,var(--color-text) 10%,transparent);--sod-shine:inset 0 1px 0 color-mix(in srgb,var(--color-surface-raised) 70%,transparent)}
.sod-action-group{position:relative;display:inline-flex;align-items:center;height:2rem;padding:0 0.15rem;border-radius:9999px;background:var(--sod-fill);box-shadow:var(--sod-shine)}
.sod-action-group>*{position:relative;display:inline-flex}
.sod-action-group>*+*::before{content:"";position:absolute;left:0;top:0.4rem;bottom:0.4rem;width:1px;background:var(--sod-edge);pointer-events:none}
.sod-icon-btn{flex:none;display:inline-flex;align-items:center;justify-content:center;width:2.3rem;height:1.75rem;padding:0;border:0;border-radius:9999px;background:transparent;color:var(--color-text-secondary);cursor:pointer;transition:background 0.15s ease-out,color 0.15s ease-out}
.sod-icon-btn svg{display:block;width:17px;height:17px}
.sod-icon-btn:hover:not(:disabled),.sod-icon-btn[aria-expanded="true"]{background:var(--sod-fill-hover);color:var(--color-text)}
.sod-icon-btn:disabled{color:var(--color-text-disabled);cursor:default}
/* A single one is a circle, not a pill with nothing beside it. */
.sod-action-group:has(>:only-child) .sod-icon-btn{width:1.7rem}
/* In a card's head: no glass until it is wanted, so two of them read as marks beside the title rather than a toolbar. */
.sod-head-icons{display:flex;gap:0.125rem}
/* A value with its icons straight after it, centred on the text. */
.sod-value-row{display:inline-flex;align-items:center;gap:0.25rem;flex-wrap:wrap;min-width:0;max-width:100%}
.sod-value-row>:first-child{min-width:0;overflow-wrap:anywhere}
/* A row of capsules under a document or a parcel. */
.sod-actions{display:flex;flex-wrap:wrap;gap:0.5rem;align-items:center}
.sod-action-group a.sod-icon-btn{text-decoration:none}
.sod-icon-btn-quiet{width:1.75rem;height:1.75rem;border-radius:var(--radius,0.375rem)}
.sod-icon-btn-quiet svg{width:16px;height:16px}
.sod-more{position:relative}
/* The more menu, in the inbox's glass: see .uin-menu in unified-inbox. Plain rows, a hairline between groups, the system face. */
.sod-menu{position:absolute;right:0;top:calc(100% + 0.4rem);z-index:20;width:230px;max-width:calc(100vw - 1rem);display:flex;flex-direction:column;gap:0.1rem;padding:0.35rem;border:1px solid var(--sod-edge);border-radius:var(--radius-lg,12px);background:color-mix(in srgb,var(--color-surface) 84%,transparent);-webkit-backdrop-filter:blur(24px) saturate(180%);backdrop-filter:blur(24px) saturate(180%);box-shadow:var(--shadow-xl),var(--sod-shine);font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text",system-ui,var(--font-sans,sans-serif)}
.sod-menu-item{display:flex;align-items:center;width:100%;padding:0.45rem 0.5rem;border:0;border-radius:var(--radius-md,8px);background:none;color:var(--color-text);font:inherit;font-size:0.8125rem;text-align:left;cursor:pointer}
.sod-menu-item:hover,.sod-menu-item:focus-visible{background:var(--sod-fill-hover);outline:none}
.sod-menu-sep{height:1px;margin:0.2rem 0.25rem;background:var(--color-border)}
/* On a phone, a sheet along the bottom, as the inbox's menus are. */
@media(max-width:599px){.sod-menu{position:fixed;top:auto;left:0;right:0;bottom:0;width:auto;max-width:none;max-height:70dvh;overflow-y:auto;z-index:10000;padding:0.5rem 0.5rem calc(0.5rem + env(safe-area-inset-bottom,0));border-left:0;border-right:0;border-bottom:0;border-radius:var(--radius-lg,0.75rem) var(--radius-lg,0.75rem) 0 0}.sod-menu-item{min-height:2.75rem}}
.sod-back{flex:none;align-self:center;display:inline-flex;align-items:center;justify-content:center;width:2rem;height:2rem;padding:0;margin-left:-0.25rem;border-radius:9999px;background:var(--sod-fill);box-shadow:var(--sod-shine);color:var(--color-text-secondary);font-size:0.8125rem;text-decoration:none;transition:background 0.15s ease-out,color 0.15s ease-out}
.sod-back:hover{background:var(--sod-fill-hover);color:var(--color-text);text-decoration:none}
.sod-back svg{display:block}
@media(pointer:coarse){.sod-back{width:2.5rem;height:2.5rem}}
.sod-head-link{display:inline-flex;align-items:center;gap:0.3rem;font-size:0.8125rem;color:var(--color-primary);text-decoration:none}
.sod-head-link:hover{text-decoration:underline}
.sod-head-note{font-size:0.8125rem;color:var(--color-text-secondary)}
.sod-app .sod-consent{display:flex;align-items:center;gap:0.35rem}
.sod-consent-yes,.sod-consent-no{display:inline-flex}
.sod-consent-yes{color:var(--color-success)}
.sod-consent-no{color:var(--color-danger)}
@media(max-width:1100px){.sod-summary{grid-template-columns:repeat(2,minmax(0,1fr))}.sod-summary>div:nth-child(3),.sod-summary>div:nth-child(5){border-left:0}.sod-summary>div:nth-child(5){grid-column:1/-1}.sod-summary>div:nth-child(n+3){border-top:1px solid var(--color-border)}.sod-workspace{grid-template-columns:minmax(0,1fr) 270px}}
@media(max-width:800px){.sod-workspace{grid-template-columns:minmax(0,1fr)}.sod-inspector{border-left:0;border-top:1px solid var(--color-border)}.sod-main{border-radius:0}.sod-app .sox-orderhead-actions{width:100%}.sod-main,.sod-inspector{padding:0.75rem 0}}
@media(pointer:coarse){.sod-app .btn,.sod-app .sox-copy{min-height:44px}.sod-app .sox-copy{padding:0.5rem}.sod-action-group{height:2.75rem}.sod-action-group .sod-icon-btn{width:2.6rem;height:2.5rem}.sod-icon-btn-quiet{width:2.5rem;height:2.5rem}}
@media print{.sod-app{border:0;background:var(--color-surface)}.sod-workspace{display:block}.sod-panel[hidden]{display:block}.sod-inspector{border-left:0}.sod-summary{grid-template-columns:repeat(4,minmax(0,1fr))}.sod-summary>div{border:0}.sod-app .sox-items{min-width:0}.sod-app .sox-card-body.is-flush{overflow:visible}}
`
