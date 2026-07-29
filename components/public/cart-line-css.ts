// Shared cart-line styling for the cart page (CartFullClient - the Puck "Shop:
// Cart" block - and the CartPageClient fallback). Kept inside the module as an
// injected <style> string, never a core globals.css edit - same discipline as
// product-card-css.ts.
//
// The problem it solves: a cart line is one flex row of image + name + delivery
// column + quantity + price + remove. The image/qty/price/remove columns alone
// need ~330px of fixed width, so on a phone the row's min-content blows past the
// viewport and the whole page scrolls sideways. We never want a horizontal
// scroll on mobile, so below 640px the row restacks onto three lines.
//
// The 640px breakpoint is deliberately fixed rather than the site's configurable
// mobile breakpoint: this is a hard physical constraint (those fixed columns
// simply don't fit a narrow row), not a design choice like a grid's column
// count, so it shouldn't move with the owner's chosen breakpoints.
//
// Class hooks (`scl-*` = shop cart line): the line container and each of its
// six children carry a class so the mobile grid can place them by area. The
// delivery column (`scl-deliv`, plus its `scl-deliv-probe` sizing helper) sits
// between the name and the price on desktop, and drops to a full-width row of
// its own on mobile; it's simply absent on a line no delivery picker was
// offered for. The classes are inert wherever
// there's no `.scl` grid parent (e.g. the table layout reuses the thumbnail
// renderer), so they're safe to apply everywhere.
//
// The file also carries the cart's chrome: the summary presentation for a
// self-labelled per-line picker (`scl-sum` / `scl-hint`), the quantity stepper
// pill, the remove cross, the sticky checkout bar and the undo toast. All of it
// is token-coloured, so it follows the site's light/dark theme with no hex.

export const CART_LINE_CSS = `
.scl{min-width:0;display:flex;gap:1rem;align-items:center}
.scl-main{min-width:0;overflow-wrap:anywhere}
.scl-main select{max-width:100%}
.scl-main label{min-width:0;flex-wrap:wrap}
.scl-deliv{min-width:0}
.scl-deliv select{max-width:100%}
.scl-deliv label,.scl-deliv legend{min-width:0}
/* An option label that does have to wrap keeps its radio beside its first line.
   With flex-wrap on, an option a single pixel too wide for the column dropped
   its entire label onto a line of its own underneath the radio. */
.scl-deliv label input{flex:0 0 auto}
.scl-deliv label span{overflow-wrap:anywhere}
/* Invisible width probe. Every line's delivery column carries a hidden copy of
   every delivery option label in the whole cart, one unwrappable line each. It
   paints nothing and is out of the accessibility tree, but it sets the column's
   max-content width to the longest label anywhere in the cart. Two things fall
   out of that: no service tier ever wraps, and every line's column comes out
   the same width, so the trailing qty/price/remove columns still line up down
   the cart. No magic pixel width to go stale when an owner renames a tier or a
   promised date runs long. The padding stands in for the radio and its gap,
   which sit beside the real labels but not beside the probe's. */
.scl-deliv-probe{height:0;overflow:hidden;visibility:hidden;display:grid;font-size:0.8125rem}
.scl-deliv-probe span{white-space:nowrap;padding-left:1.25rem}
/* On desktop each line is its own flex row, so the delivery column is sized to
   its own max-content - which the probe above makes identical on every line.
   Capped at 45% of the row so an unusually long tier label squeezes the product
   name rather than overflowing the page; only past that cap does a label wrap.
   Off below 640px, where the whole line restacks onto the grid below and the
   delivery row spans full width (wrapping onto two lines there is fine). */
@media (min-width:641px){
  .scl > .scl-deliv{flex:0 0 auto;width:max-content;max-width:45%}
  /* The summary presentation sizes itself the other way round: it takes the
     room the (deliberately narrow) product column leaves, so the chosen service
     and its switch chips get the width, and every line's column still lines up
     because every other column is fixed. No probe needed - the chips wrap. */
  .scl > .scl-deliv-sum{flex:1 1 auto;width:auto;max-width:none;min-width:0}
}

/* ---- One set of column tracks for the WHOLE list (desktop) ----
   The flex rules above size each line's columns from that line's own content,
   so two lines only lined up by luck: a line with no delivery picker, a longer
   price, or a shorter product name came out a different shape from the one
   above it. Here the list owns the tracks and every line borrows them with
   subgrid, so the product / delivery / quantity / price / remove columns are
   the same width on every line no matter what is in the basket. The track list
   itself is handed in as --scl-cols by the cart, which alone knows which
   columns the shop owner has switched on (see CartFullClient). Wrapped in
   @supports so a browser without subgrid keeps the flex layout above rather
   than collapsing to one column. */
@supports (grid-template-columns:subgrid){
  @media (min-width:641px){
    .scl-list{display:grid;grid-template-columns:var(--scl-cols);column-gap:1rem}
    .scl{display:grid;grid-column:1/-1;grid-template-columns:subgrid;column-gap:1rem;align-items:center}
    /* Both are flex sizing, meaningless here - and the 45% cap would otherwise
       squeeze the column against its own track rather than against the row. */
    .scl > .scl-deliv{width:auto;max-width:none}
  }
}

/* ---- Chosen-service summary + switch chips (control renderAs 'summary') ----
   One confirmed line per cart line, stating what the shopper has chosen and
   when it lands, with every other option beside it as a one-click chip. */
.scl-delgrp{border:0;margin:0;padding:0;min-width:0}
.scl-sum{position:relative;display:flex;align-items:flex-start;gap:0.875rem;width:100%;text-align:left;
  border:1.5px solid var(--color-primary);border-radius:10px;background:var(--color-primary-subtle);padding:0.75rem 1rem}
.scl-sum input{position:absolute;opacity:0;pointer-events:none}
.scl-sum:has(input:focus-visible){outline:2px solid var(--color-primary);outline-offset:2px}
.scl-tick{flex:none;width:19px;height:19px;border-radius:50%;background:var(--color-primary);color:var(--color-on-primary);
  display:flex;align-items:center;justify-content:center;margin-top:2px}
.scl-sum-lines{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}
.scl-s-top{display:flex;align-items:baseline;gap:0.875rem;min-width:0}
.scl-s-date{font-size:0.9375rem;font-weight:700;color:var(--color-primary);white-space:nowrap}
.scl-s-desc{font-size:0.8438rem;color:var(--color-text-secondary);white-space:nowrap}
.scl-s-fee{margin-left:auto;font-size:0.9063rem;font-weight:700;white-space:nowrap;color:var(--color-text)}
.scl-s-below{font-size:0.8125rem;color:var(--color-text-secondary);line-height:1.45}
.scl-free{color:var(--color-success)}
.scl-hints{display:flex;flex-wrap:wrap;align-items:center;gap:0.375rem;margin-top:0.5rem}
.scl-hints-t{font-size:0.8125rem;font-weight:600;color:var(--color-text-secondary)}
.scl-hint{position:relative;display:inline-block;white-space:nowrap;border:1px solid var(--color-border);background:var(--color-surface);
  border-radius:9999px;padding:0.25rem 0.625rem;font-size:0.8125rem;font-weight:600;color:var(--color-primary);cursor:pointer;
  transition:border-color 120ms ease-out,background 120ms ease-out}
.scl-hint:hover{border-color:var(--color-primary);background:var(--color-primary-subtle)}
.scl-hint input{position:absolute;opacity:0;pointer-events:none}
.scl-hint:has(input:focus-visible){outline:2px solid var(--color-primary);outline-offset:2px}
.scl-hint-fee{margin-left:0.4375rem;color:var(--color-text)}

/* ---- Basket totals: Subtotal / any broken-out charges / tax / Total ----
   A two-column definition list, so a screen reader reads each label with its
   own figure rather than a wall of numbers. The label column takes what it
   needs and the figures line up hard right against each other. The Total is
   ruled off above and set larger - it is the row a shopper actually reads. */
.scl-tot{display:grid;grid-template-columns:1fr max-content;gap:0.4375rem 1.5rem;margin:0;font-size:0.9375rem}
.scl-tot dt{color:var(--color-text-secondary)}
.scl-tot dd{margin:0;text-align:right;font-variant-numeric:tabular-nums;color:var(--color-text)}
.scl-tot .scl-tot-t{padding-top:0.5625rem;border-top:1px solid var(--color-border);font-size:1.125rem;font-weight:700;color:var(--color-text)}

/* ---- Quantity stepper pill ---- */
.scl-qtybox{display:inline-flex;align-items:center;height:42px;overflow:hidden;
  border:1px solid var(--color-border-strong);border-radius:9999px;background:var(--color-surface)}
.scl-qtybox button{display:flex;align-items:center;justify-content:center;width:34px;height:100%;border:0;background:none;
  color:var(--color-primary);font-size:1.125rem;font-weight:600;line-height:1;cursor:pointer}
.scl-qtybox button:hover:not(:disabled){background:var(--color-bg-subtle)}
.scl-qtybox button:disabled{color:var(--color-text-disabled);cursor:default}
.scl-qtybox input{width:38px;border:0;padding:0;text-align:center;font-family:inherit;font-size:0.9375rem;font-weight:600;
  color:var(--color-text);background:transparent}

/* ---- Remove cross ---- */
.scl-removebtn{display:inline-flex;align-items:center;justify-content:center;width:38px;height:38px;border:0;border-radius:9999px;
  background:none;color:var(--color-danger);cursor:pointer;transition:background 120ms ease-out}
.scl-removebtn:hover{background:var(--color-destructive-subtle)}
.scl-removebtn[disabled]{cursor:default}

/* ---- Sticky checkout bar: slides up once the real totals scroll away ---- */
.scb{position:fixed;left:0;right:0;bottom:0;z-index:300;background:var(--color-surface);border-top:1px solid var(--color-border);
  box-shadow:0 -6px 18px rgba(0,0,0,0.10);transform:translateY(102%);transition:transform 200ms ease-in-out}
.scb-in{transform:none}
.scb-inner{max-width:1560px;margin:0 auto;padding:0.75rem 1.5rem;display:flex;align-items:center;gap:1.5rem}
.scb-meta{font-size:0.8438rem;color:var(--color-text-secondary);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.scb-right{margin-left:auto;display:flex;align-items:center;gap:1.125rem}
.scb-total{display:flex;align-items:baseline;gap:0.5rem;font-size:0.9375rem;color:var(--color-text-secondary);white-space:nowrap}
.scb-total b{font-size:1.125rem;font-weight:700;color:var(--color-text)}

/* ---- Removed-item undo toast ---- */
.sct{position:fixed;left:50%;transform:translateX(-50%);z-index:500;display:flex;align-items:center;gap:1.125rem;
  border-radius:10px;padding:0.8125rem 1.25rem;font-size:0.9063rem;background:var(--color-text);color:var(--color-bg);
  box-shadow:0 12px 32px rgba(0,0,0,0.28);opacity:1;transition:opacity 300ms ease-out}
.sct-out{opacity:0}
.sct button{border:0;padding:0;background:none;color:inherit;font-family:inherit;font-size:inherit;font-weight:700;
  text-decoration:underline;cursor:pointer}

@media (max-width:640px){
  .scl-s-top{flex-wrap:wrap}
  .scl-s-date,.scl-s-desc{white-space:normal}
  .scb-meta{display:none}
  .scb-inner{padding:0.625rem 1rem;gap:0.75rem}
  .sct{left:1rem;right:1rem;transform:none;justify-content:space-between}
}
@media (pointer:coarse){
  .scl-hint{padding:0.5rem 0.875rem}
  .scl-qtybox button{width:44px}
  .scl-removebtn{width:44px;height:44px}
}
@media (prefers-reduced-motion:reduce){
  .scb,.sct,.scl-hint,.scl-removebtn{transition:none}
}
@media print{
  .scb,.sct{display:none!important}
}
@media (max-width:640px){
  /* The probe's unwrappable lines would set a min-content width the narrow grid
     can't give it, so it earns its keep on desktop only. */
  .scl-deliv-probe{display:none}
  .scl{
    display:grid!important;
    grid-template-columns:auto minmax(0,1fr) auto;
    grid-template-areas:"thumb main price" "thumb deliv deliv" "thumb qty remove";
    gap:0.5rem 0.75rem!important;
    align-items:center;
  }
  .scl-thumb{grid-area:thumb;align-self:start}
  .scl-main{grid-area:main}
  .scl-deliv{grid-area:deliv;align-self:start}
  /* A line with no delivery picker still emits an empty column so the desktop
     tracks stay aligned; on the phone the areas do that job, so it goes. */
  .scl-deliv:empty{display:none}
  .scl-qty{grid-area:qty;justify-self:start;align-self:end}
  .scl-price{grid-area:price;justify-self:end;align-self:start;text-align:right}
  .scl-remove{grid-area:remove;justify-self:end;align-self:end}
}
`
