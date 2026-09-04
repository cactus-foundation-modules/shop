// Styling for the order tracker (app/public/shop/track-order) and for the
// postcode gate the same form draws in place on an order page nobody has proved
// themselves against yet.
//
// Injected <style> string inside the module, never a core globals.css edit -
// same discipline as order-detail-css.ts and order-confirmation-css.ts. Class
// prefix `sot-*` = shop order tracking, deliberately alongside `sod-*` (order
// detail) and `soc-*` (order confirmation): three views of one order, and the
// customer should not be able to tell they were built at different times.
//
// Every colour is a token. One breakpoint, physical rather than tied to the
// site's configurable mobile breakpoint: the two boxes stop sitting side by
// side somewhere around 520px whatever the theme thinks a phone is.
export const TRACK_ORDER_CSS = `
.sot{display:grid;gap:1.25rem}
.sot-head{display:grid;gap:0.5rem}
.sot-title{margin:0;font-size:1.75rem;line-height:1.2;color:var(--color-text)}
.sot-lede{margin:0;color:var(--color-text-muted);font-size:0.9375rem;line-height:1.5}

.sot-card{border:1px solid var(--color-border);border-radius:var(--radius-lg);
  background:var(--color-surface);padding:1.25rem}

.sot-form{display:grid;gap:0.875rem}
.sot-fields{display:grid;gap:0.875rem;grid-template-columns:1fr 1fr}
/* One box on its own should not stretch across a desktop pretending to want
   thirty characters - a postcode is eight. */
.sot-fields.sot-one{grid-template-columns:minmax(0,18rem)}
.sot-field{display:grid;gap:0.3125rem;min-width:0}
.sot-field label{font-size:0.8125rem;font-weight:600;color:var(--color-text)}
.sot-field input{width:100%;box-sizing:border-box;padding:0.5625rem 0.75rem;
  border:1px solid var(--color-border-strong);border-radius:var(--radius-md);
  background:var(--color-bg);color:var(--color-text);font-size:1rem;line-height:1.4}
.sot-field input:focus-visible{outline:2px solid var(--color-border-focus);outline-offset:1px}
.sot-hint{font-size:0.8125rem;color:var(--color-text-muted);line-height:1.4}

.sot-actions{display:flex;flex-wrap:wrap;gap:0.625rem;align-items:center}
.sot-btn{display:inline-flex;align-items:center;justify-content:center;gap:0.5rem;
  padding:0.5625rem 1.125rem;border-radius:var(--radius-md);font-size:0.9375rem;
  font-weight:600;text-decoration:none;border:1px solid transparent;cursor:pointer;line-height:1.2}
.sot-btn-primary{background:var(--color-primary);color:var(--color-on-primary)}
.sot-btn-primary:hover:not(:disabled){filter:brightness(1.06)}
.sot-btn-ghost{background:var(--color-surface);color:var(--color-text);
  border-color:var(--color-border-strong)}
.sot-btn-ghost:hover{background:var(--color-bg-subtle)}
.sot-btn:disabled{opacity:0.6;cursor:default}
.sot-btn:focus-visible{outline:2px solid var(--color-border-focus);outline-offset:2px}

/* Tinted rather than plain red text: this is the one thing on the page somebody
   has to read twice, and a sentence the same size as the label above it does
   not get read once. */
.sot-error{margin:0;padding:0.75rem 0.875rem;border-radius:var(--radius-md);
  border:1px solid var(--color-destructive-border);background:var(--color-error-bg);
  color:var(--color-danger);font-size:0.875rem;line-height:1.45}

.sot-account{border:1px solid var(--color-border);border-radius:var(--radius-lg);
  background:var(--color-bg-subtle);padding:1.25rem;display:grid;gap:0.75rem}
.sot-account h2{margin:0;font-size:1.125rem;color:var(--color-text)}
.sot-account p{margin:0;color:var(--color-text-muted);font-size:0.9375rem;line-height:1.5}
.sot-account ul{margin:0;padding-left:1.125rem;color:var(--color-text-muted);
  font-size:0.9375rem;line-height:1.6}

@media (max-width:520px){
  .sot-fields{grid-template-columns:1fr}
  .sot-title{font-size:1.5rem}
}
`
