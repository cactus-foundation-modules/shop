// Styling for the order confirmation view (OrderConfirmationClient - the
// "Shop: Order Confirmation" Puck block). Kept inside the module as an injected
// <style> string, never a core globals.css edit - same discipline as
// cart-line-css.ts and product-card-css.ts.
//
// The old confirmation was a heading, a flat <ul> of line items and a couple of
// grey paragraphs, all inline-styled at 480px wide. It is the last page of the
// whole shop and the one people screenshot, forward to accounts and come back
// to a week later wondering where their parcel is, so it now carries what a
// receipt is actually asked for: what was bought, what it cost and why, where
// it is going, how it was paid for and what happens next.
//
// Class prefix `soc-*` = shop order confirmation. Every colour is a token, so
// the whole page follows the site's light/dark theme with no hex anywhere.
//
// Two breakpoints, both fixed rather than tied to the site's configurable
// mobile breakpoint, because both are physical: the totals/address columns need
// roughly 560px before splitting is worth anything, and the item row's
// thumbnail + price columns stop fitting beside a wrapped product name at 480.
export const ORDER_CONFIRMATION_CSS = `
.soc{display:grid;gap:1.25rem;max-width:720px;margin:0 auto;color:var(--color-text)}

/* --- Hero -------------------------------------------------------------- */
/* The mark, the headline and the one line telling them what happens next.
   Centred on its own rather than sharing a row with the order number: the
   order number is reference data and belongs in the receipt below, not
   competing with the only sentence anyone reads. */
.soc-hero{display:grid;justify-items:center;text-align:center;gap:0.625rem;padding:0.5rem 0 0.25rem}
.soc-mark{width:64px;height:64px;border-radius:var(--radius-full);display:grid;place-items:center;flex-shrink:0}
.soc-mark svg{width:32px;height:32px;stroke-width:2.5;fill:none;stroke-linecap:round;stroke-linejoin:round}
.soc-mark-ok{background:var(--color-success-subtle);color:var(--color-success);border:1px solid var(--color-success-border)}
.soc-mark-wait{background:var(--color-info-subtle);color:var(--color-info);border:1px solid var(--color-info-border)}
.soc-mark-todo{background:var(--color-warning-subtle);color:var(--color-warning);border:1px solid var(--color-warning-border)}
.soc-mark-bad{background:var(--color-error-bg);color:var(--color-danger);border:1px solid var(--color-destructive-border)}
.soc-title{font-size:1.75rem;line-height:1.2;margin:0;font-weight:650}
.soc-sub{margin:0;color:var(--color-text-secondary);max-width:44ch}
.soc-sub strong{color:var(--color-text);font-weight:600;overflow-wrap:anywhere}

/* Drawing the tick stroke on rather than popping it in: the page has just
   finished a wait, and a mark that arrives under its own steam reads as the
   answer to it. Anyone who has asked not to be moved about gets the finished
   tick with no animation, via the reduced-motion block at the foot. */
@keyframes soc-draw{from{stroke-dashoffset:32}to{stroke-dashoffset:0}}
.soc-mark-ok svg path{stroke-dasharray:32;animation:soc-draw 0.5s ease-out 0.1s both}

/* --- Callouts ---------------------------------------------------------- */
/* One shape for every "here is what is going on" message, coloured by which
   of the four it is. Icon in its own column so a message running to three
   lines stays hanging off it rather than wrapping underneath. */
.soc-note{display:grid;grid-template-columns:auto 1fr;gap:0.75rem;align-items:start;
  border:1px solid var(--color-border);border-radius:var(--radius-lg);padding:0.875rem 1rem;
  background:var(--color-bg-subtle);line-height:1.5}
.soc-note svg{width:20px;height:20px;stroke-width:2;fill:none;stroke-linecap:round;stroke-linejoin:round;margin-top:0.125rem}
.soc-note p{margin:0}
.soc-note p + p{margin-top:0.5rem}
.soc-note-info{background:var(--color-info-subtle);border-color:var(--color-info-border);color:var(--color-info)}
.soc-note-ok{background:var(--color-success-subtle);border-color:var(--color-success-border);color:var(--color-success)}
.soc-note-warn{background:var(--color-warning-subtle);border-color:var(--color-warning-border);color:var(--color-warning)}
.soc-note-bad{background:var(--color-error-bg);border-color:var(--color-destructive-border);color:var(--color-danger)}
/* The coloured text above is the message's own; links inside it keep the
   colour but stay underlined, so they are still findable for anyone who
   cannot pick the tint out. */
.soc-note a{color:inherit;text-decoration:underline}
.soc-instructions{white-space:pre-wrap}

/* --- Receipt card ------------------------------------------------------ */
.soc-card{border:1px solid var(--color-border);border-radius:var(--radius-lg);background:var(--color-surface);overflow:hidden}
.soc-card-head{display:flex;flex-wrap:wrap;gap:0.5rem 1.5rem;align-items:baseline;justify-content:space-between;
  padding:0.875rem 1.25rem;border-bottom:1px solid var(--color-border);background:var(--color-bg-subtle)}
.soc-card-title{margin:0;font-size:0.9375rem;font-weight:650}
.soc-meta{display:flex;flex-wrap:wrap;gap:0.25rem 1rem;margin:0;font-size:0.8125rem;color:var(--color-text-secondary)}
.soc-meta strong{color:var(--color-text);font-weight:600;font-variant-numeric:tabular-nums}
.soc-card-body{padding:0.25rem 1.25rem}

/* --- Item rows --------------------------------------------------------- */
.soc-items{list-style:none;margin:0;padding:0}
.soc-item{display:grid;grid-template-columns:auto 1fr auto;gap:0 1rem;align-items:start;padding:0.875rem 0}
.soc-item + .soc-item{border-top:1px solid var(--color-border)}
.soc-thumb{width:56px;height:56px;border-radius:var(--radius-md);object-fit:cover;background:var(--color-bg-subtle);
  border:1px solid var(--color-border);grid-row:span 2}
/* No picture is not a hole in the row: the placeholder holds the same column
   so names and prices still line up down the list. */
.soc-thumb-empty{display:grid;place-items:center;color:var(--color-text-muted)}
.soc-thumb-empty svg{width:22px;height:22px;stroke-width:1.75;fill:none;stroke-linecap:round;stroke-linejoin:round}
.soc-item-name{margin:0;font-weight:550;overflow-wrap:anywhere}
.soc-item-qty{margin:0.125rem 0 0;font-size:0.8125rem;color:var(--color-text-secondary);font-variant-numeric:tabular-nums}
.soc-item-price{font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap}
/* Personalisation captured at add-to-cart. Sits under the name, indented into
   the name column so it never widens the row. */
.soc-item-meta{list-style:none;margin:0.375rem 0 0;padding:0;display:grid;gap:0.125rem;
  font-size:0.8125rem;color:var(--color-text-secondary);grid-column:2}
.soc-item-meta span{font-weight:600;color:var(--color-text)}
.soc-item-meta a{color:var(--color-primary)}

/* --- Totals ------------------------------------------------------------ */
.soc-totals{display:grid;grid-template-columns:1fr auto;gap:0.375rem 1.5rem;margin:0;
  padding:0.875rem 1.25rem;border-top:1px solid var(--color-border);background:var(--color-bg-subtle)}
.soc-totals dt{color:var(--color-text-secondary)}
.soc-totals dd{margin:0;text-align:right;font-variant-numeric:tabular-nums}
.soc-totals .soc-row{display:contents}
.soc-discount dd,.soc-discount dt{color:var(--color-success)}
.soc-code{font-size:0.8125rem;opacity:0.85}
.soc-grand dt,.soc-grand dd{font-weight:700;font-size:1.125rem;color:var(--color-text);
  padding-top:0.625rem;margin-top:0.25rem;border-top:1px solid var(--color-border)}

/* --- Detail cards ------------------------------------------------------ */
/* Delivery, contact and payment, side by side where there is room. */
.soc-details{display:grid;gap:1rem;grid-template-columns:repeat(auto-fit,minmax(220px,1fr))}
.soc-detail{border:1px solid var(--color-border);border-radius:var(--radius-lg);padding:0.875rem 1rem;background:var(--color-surface)}
.soc-detail h3{margin:0 0 0.5rem;font-size:0.75rem;font-weight:650;letter-spacing:0.04em;text-transform:uppercase;color:var(--color-text-muted)}
.soc-detail address,.soc-detail p{margin:0;font-style:normal;line-height:1.55;overflow-wrap:anywhere}
.soc-detail .soc-dim{color:var(--color-text-secondary)}

/* --- Account prompt ---------------------------------------------------- */
/* The one thing on the page asking for something rather than reporting it, so
   it gets the primary tint and sits apart from the receipt. */
.soc-account{border:1px solid var(--color-primary-border);background:var(--color-primary-subtle);
  border-radius:var(--radius-lg);padding:1.125rem 1.25rem;display:grid;gap:0.75rem}
.soc-account h2{margin:0;font-size:1.0625rem;font-weight:650}
.soc-account p{margin:0;color:var(--color-text-secondary)}
.soc-account ul{margin:0;padding-left:1.125rem;color:var(--color-text-secondary);display:grid;gap:0.25rem}
/* The embedded registration form brings the site's own form styling with it, so
   there is nothing to restyle here. The one collision is the paragraph rule
   above, which would repaint the form's own hint text. */
.soc-account form{margin:0}
.soc-account form p.field-hint{color:var(--color-text-muted)}

/* --- Buttons ----------------------------------------------------------- */
.soc-actions{display:flex;flex-wrap:wrap;gap:0.625rem}
.soc-btn{display:inline-flex;align-items:center;justify-content:center;gap:0.5rem;
  padding:0.6875rem 1.25rem;border-radius:var(--radius-md);font-weight:600;text-decoration:none;
  border:1px solid transparent;cursor:pointer;line-height:1.2}
.soc-btn-primary{background:var(--color-primary);color:var(--color-on-primary)}
.soc-btn-primary:hover{background:var(--color-primary-hover)}
.soc-btn-ghost{background:var(--color-surface);color:var(--color-text);border-color:var(--color-border-strong)}
.soc-btn-ghost:hover{background:var(--color-bg-subtle)}
.soc-btn:focus-visible{outline:2px solid var(--color-border-focus);outline-offset:2px}

/* --- Narrow screens ---------------------------------------------------- */
@media (max-width:560px){
  .soc-title{font-size:1.5rem}
  .soc-card-head{flex-direction:column;gap:0.375rem}
  .soc-btn{flex:1 1 100%}
}
@media (max-width:480px){
  /* The price stops sharing the name's row and drops under it, which buys the
     product name the whole width instead of wrapping it into a column. */
  .soc-item{grid-template-columns:auto 1fr}
  .soc-item-price{grid-column:2;margin-top:0.25rem}
  .soc-thumb{grid-row:span 3}
}

/* --- Print ------------------------------------------------------------- */
/* People do print this, and a receipt is one of the few web pages where that
   is the expected ending rather than a curiosity. Drop the two things that
   are useless on paper - the tint behind the cards, and the buttons. */
@media print{
  .soc-actions,.soc-account{display:none}
  .soc-card,.soc-detail{border-color:#999;background:none;break-inside:avoid}
  .soc-card-head,.soc-totals{background:none}
}

@media (prefers-reduced-motion:reduce){
  .soc-mark-ok svg path{animation:none;stroke-dasharray:none}
}
`
