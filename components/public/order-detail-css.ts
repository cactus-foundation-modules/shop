// Styling for a member's own order page (app/public/shop/account/orders/[id]).
// Injected <style> string inside the module, never a core globals.css edit -
// same discipline as order-confirmation-css.ts, cart-line-css.ts and
// product-card-css.ts.
//
// The page had grown a section at a time - pay online, proforma, invoices,
// credit notes, purchase order numbers, billing corrections, tracking links -
// until it was eleven identical grey cards in one column, every one of them
// shouting at the same volume, with the two things a customer actually comes
// back for (where is it, what did I pay) buried between an invoice-address form
// and a list of documents strung together with middots.
//
// So: one loud header, a progress rail, anything still to DO, the receipt, and
// then everything else as small paired cards. Class prefix `sod-*` = shop order
// detail. It deliberately echoes `soc-*` on the confirmation page - the two are
// the same order, a week apart, and they should look it.
//
// Every colour is a token. Two breakpoints, both physical rather than tied to
// the site's configurable mobile breakpoint: the paired cards need roughly
// 620px before two columns beat one, and the item row's thumbnail and price
// columns stop fitting beside a wrapped product name at 480.
export const ORDER_DETAIL_CSS = `
.sod{display:grid;gap:1.25rem;color:var(--color-text)}

/* --- Back link --------------------------------------------------------- */
.sod-back{display:inline-flex;align-items:center;gap:0.375rem;color:var(--color-text-secondary);
  font-size:0.875rem;text-decoration:none;justify-self:start}
.sod-back:hover{color:var(--color-text)}

/* --- Header ------------------------------------------------------------ */
/* The order number, its state and the three facts that answer "which order is
   this" - date, size, money. Nothing to click lives here any more; the links
   that used to trail off the date have a card of their own further down. */
.sod-head{display:grid;gap:0.625rem}
.sod-head-top{display:flex;flex-wrap:wrap;gap:0.5rem 0.75rem;align-items:center}
.sod-title{margin:0;font-size:1.75rem;line-height:1.15;font-weight:650;color:var(--color-text)}
.sod-facts{display:flex;flex-wrap:wrap;gap:0.25rem 1.5rem;margin:0;font-size:0.875rem;
  color:var(--color-text-secondary)}
.sod-facts strong{color:var(--color-text);font-weight:600;font-variant-numeric:tabular-nums}

/* --- Progress rail ----------------------------------------------------- */
/* Four steps, always the same four, because a rail that changes shape between
   two visits is not a rail. The connector is drawn in two halves off each step
   so the line inherits the step's own state and no wrapper has to work out
   where the colour should stop. */
.sod-steps{list-style:none;margin:0;display:grid;grid-auto-flow:column;grid-auto-columns:1fr;
  border:1px solid var(--color-border);border-radius:var(--radius-lg);
  background:var(--color-surface);padding:1rem 0.5rem 0.875rem}
.sod-step{position:relative;display:grid;justify-items:center;gap:0.25rem;text-align:center;
  padding:0 0.25rem}
.sod-step::before,.sod-step::after{content:'';position:absolute;top:11px;height:2px;
  background:var(--color-border)}
.sod-step::before{left:0;right:50%}
.sod-step::after{left:50%;right:0}
.sod-step:first-child::before,.sod-step:last-child::after{display:none}
/* A finished step colours the rail on both sides of itself; the step in
   progress colours only the half behind it, so the line stops where the order
   has actually got to. */
.sod-step-done::before,.sod-step-done::after,.sod-step-now::before{background:var(--color-success)}
.sod-dot{position:relative;width:24px;height:24px;border-radius:var(--radius-full);
  display:grid;place-items:center;background:var(--color-surface);
  border:2px solid var(--color-border);color:var(--color-text-muted);flex-shrink:0}
.sod-dot svg{width:13px;height:13px;stroke-width:3;fill:none;stroke-linecap:round;stroke-linejoin:round}
.sod-step-done .sod-dot{background:var(--color-success);border-color:var(--color-success);
  color:var(--color-on-primary)}
.sod-step-now .sod-dot{border-color:var(--color-primary);background:var(--color-surface);
  color:var(--color-primary);box-shadow:0 0 0 4px var(--color-primary-subtle)}
.sod-step-now .sod-dot::after{content:'';width:8px;height:8px;border-radius:var(--radius-full);
  background:var(--color-primary)}
.sod-step-label{font-size:0.8125rem;font-weight:600;line-height:1.3;margin-top:0.125rem}
.sod-step-now .sod-step-label{color:var(--color-primary-dark)}
.sod-step-todo .sod-step-label{color:var(--color-text-muted);font-weight:500}
.sod-step-when{font-size:0.6875rem;color:var(--color-text-muted);line-height:1.3}

/* --- Callouts ---------------------------------------------------------- */
/* One shape for every "here is what is going on" message. Same four tints as
   the confirmation page, and the same reason for the icon column: a message
   running to three lines hangs off the icon rather than wrapping under it. */
.sod-note{display:grid;grid-template-columns:auto 1fr;gap:0.75rem;align-items:start;
  border:1px solid var(--color-border);border-radius:var(--radius-lg);padding:0.875rem 1rem;
  background:var(--color-bg-subtle);line-height:1.55}
.sod-note svg{width:20px;height:20px;stroke-width:2;fill:none;stroke-linecap:round;
  stroke-linejoin:round;margin-top:0.125rem}
.sod-note-body{display:grid;gap:0.5rem;min-width:0}
.sod-note p{margin:0}
.sod-note-info{background:var(--color-info-subtle);border-color:var(--color-info-border);color:var(--color-info)}
.sod-note-ok{background:var(--color-success-subtle);border-color:var(--color-success-border);color:var(--color-success)}
.sod-note-warn{background:var(--color-warning-subtle);border-color:var(--color-warning-border);color:var(--color-warning)}
.sod-note-bad{background:var(--color-error-bg);border-color:var(--color-destructive-border);color:var(--color-danger)}
.sod-note strong{color:inherit}
/* Links keep the callout's colour but stay underlined, so they are findable
   for anyone who cannot pick the tint out. */
.sod-note a{color:inherit;text-decoration:underline}
.sod-note-sep{border-top:1px solid currentColor;opacity:0.25;margin:0.125rem 0 0}
.sod-instructions{white-space:pre-wrap}

/* --- Cards ------------------------------------------------------------- */
.sod-card{border:1px solid var(--color-border);border-radius:var(--radius-lg);
  background:var(--color-surface);overflow:hidden;display:flex;flex-direction:column}
.sod-card-head{display:flex;flex-wrap:wrap;gap:0.375rem 1rem;align-items:baseline;
  justify-content:space-between;padding:0.75rem 1.125rem;border-bottom:1px solid var(--color-border);
  background:var(--color-bg-subtle)}
.sod-card-title{margin:0;font-size:0.9375rem;font-weight:650;color:var(--color-text)}
.sod-card-note{margin:0;font-size:0.8125rem;color:var(--color-text-secondary)}
.sod-card-body{padding:1rem 1.125rem;display:grid;gap:0.75rem;align-content:start}
/* Lists supply their own row padding, so the body only sets the gutters. */
.sod-card-list{padding:0 1.125rem}
.sod-card address,.sod-card-body p{margin:0;font-style:normal;line-height:1.55;overflow-wrap:anywhere}
.sod-lines{display:grid;gap:0.125rem;color:var(--color-text-secondary)}
.sod-lines strong{color:var(--color-text);font-weight:600}
.sod-dim{color:var(--color-text-secondary);font-size:0.8125rem}

/* --- The paired cards -------------------------------------------------- */
/* Everything that is reference rather than headline: parcels, paperwork,
   addresses, refunds, past requests. Two up on a desktop, one on a phone. The
   min() is what decides which: a bare 300px minimum would keep its column on a
   narrow screen and push the page sideways instead of stacking. start, not
   stretch, so a two-line address card is not blown up to match a parcel list
   beside it. */
.sod-grid{display:grid;gap:1rem;align-items:start;
  grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr))}
/* For the odd card that has to have the full width back - an open form, mostly. */
.sod-wide{grid-column:1/-1}

/* --- Item rows --------------------------------------------------------- */
.sod-items{list-style:none;margin:0;padding:0}
.sod-item{display:grid;grid-template-columns:auto 1fr auto;gap:0 1rem;align-items:start;
  padding:0.875rem 0}
.sod-item + .sod-item{border-top:1px solid var(--color-border)}
.sod-thumb{width:56px;height:56px;border-radius:var(--radius-md);object-fit:cover;
  background:var(--color-bg-subtle);border:1px solid var(--color-border);grid-row:span 2}
/* No picture is not a hole in the row: the placeholder holds the same column so
   names and prices still line up down the list. */
.sod-thumb-empty{display:grid;place-items:center;color:var(--color-text-muted)}
.sod-thumb-empty svg{width:22px;height:22px;stroke-width:1.75;fill:none;stroke-linecap:round;stroke-linejoin:round}
.sod-item-name{margin:0;font-weight:550;overflow-wrap:anywhere;color:var(--color-text)}
.sod-item-name a{color:inherit;text-decoration:none}
.sod-item-name a:hover{text-decoration:underline}
.sod-item-groupcap{font-weight:400;font-size:0.75rem;color:var(--color-text-muted)}
.sod-item-qty{margin:0.125rem 0 0;font-size:0.8125rem;color:var(--color-text-secondary);
  font-variant-numeric:tabular-nums}
.sod-item-price{font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap}
/* Personalisation captured at add-to-cart, indented into the name column so it
   never widens the row. */
.sod-item-meta{list-style:none;margin:0.375rem 0 0;padding:0;display:grid;gap:0.125rem;
  font-size:0.8125rem;color:var(--color-text-secondary);grid-column:2}
.sod-item-meta span{font-weight:600;color:var(--color-text)}
.sod-item-meta a{color:var(--color-primary)}
/* State on the left, the one thing to do on the right. They used to share a
   single wrapped flex row, so "Dispatched" and "Buy it again" read as two
   badges of equal standing. */
.sod-item-foot{grid-column:2;display:flex;flex-wrap:wrap;gap:0.375rem;align-items:center;
  margin-top:0.5rem}
.sod-item-foot .sod-spacer{flex:1 1 auto}

/* --- Totals ------------------------------------------------------------ */
.sod-totals{display:grid;grid-template-columns:1fr auto;gap:0.375rem 1.5rem;margin:0;
  padding:0.875rem 1.125rem;border-top:1px solid var(--color-border);background:var(--color-bg-subtle)}
.sod-totals dt{color:var(--color-text-secondary)}
.sod-totals dd{margin:0;text-align:right;font-variant-numeric:tabular-nums}
.sod-totals .sod-row{display:contents}
.sod-discount dd,.sod-discount dt{color:var(--color-success)}
.sod-code{font-size:0.8125rem;opacity:0.85}
.sod-grand dt,.sod-grand dd{font-weight:700;font-size:1.125rem;color:var(--color-text);
  padding-top:0.625rem;margin-top:0.25rem;border-top:1px solid var(--color-border)}
.sod-after dt,.sod-after dd{font-weight:650;color:var(--color-text)}
.sod-paidline{grid-column:1/-1;margin:0.5rem 0 0;font-size:0.8125rem;color:var(--color-text-secondary)}

/* --- Document rows ----------------------------------------------------- */
/* Invoices, credit notes, the proforma and the printable receipt. They used to
   be middot-separated links trailing off the date line, which on an order with
   two invoices and a credit note wrapped into a grey paragraph nobody could
   pick a document out of. */
.sod-docs{list-style:none;margin:0;padding:0}
.sod-doc{display:grid;grid-template-columns:auto 1fr auto;gap:0.125rem 0.75rem;align-items:center;
  padding:0.6875rem 0}
.sod-doc + .sod-doc{border-top:1px solid var(--color-border)}
.sod-doc svg{width:18px;height:18px;stroke-width:1.75;fill:none;stroke-linecap:round;
  stroke-linejoin:round;color:var(--color-text-muted);grid-row:span 2}
.sod-doc-name{font-weight:600;overflow-wrap:anywhere}
.sod-doc-name a{color:var(--color-text);text-decoration:none}
.sod-doc-name a:hover{text-decoration:underline}
.sod-doc-note{grid-column:2;font-size:0.8125rem;color:var(--color-text-muted)}
.sod-doc-get{grid-row:span 2;font-size:0.8125rem;font-weight:600;color:var(--color-primary);
  text-decoration:none;white-space:nowrap}
.sod-doc-get:hover{text-decoration:underline}
/* A promise rather than a document: no link, no chevron, just when to expect it. */
.sod-doc-soon .sod-doc-name{font-weight:500;color:var(--color-text-secondary)}

/* --- Parcels ----------------------------------------------------------- */
.sod-parcel{display:grid;gap:0.25rem;padding:0.75rem 0}
.sod-parcel + .sod-parcel{border-top:1px solid var(--color-border)}
.sod-parcel-when{font-weight:600}
.sod-parcel-items{list-style:none;margin:0.125rem 0 0;padding:0;font-size:0.8125rem;
  color:var(--color-text-secondary);display:grid;gap:0.125rem}
.sod-track{justify-self:start;margin-top:0.375rem}

/* --- Small rows (refunds, past requests) ------------------------------- */
.sod-rows{list-style:none;margin:0;padding:0}
.sod-rowitem{display:grid;gap:0.125rem;padding:0.625rem 0}
.sod-rowitem + .sod-rowitem{border-top:1px solid var(--color-border)}
.sod-rowhead{display:flex;flex-wrap:wrap;gap:0.5rem;align-items:center;justify-content:space-between}
.sod-rowhead .sod-amount{font-variant-numeric:tabular-nums;font-weight:600}

/* --- Buttons ----------------------------------------------------------- */
.sod-btn{display:inline-flex;align-items:center;justify-content:center;gap:0.5rem;
  padding:0.5rem 0.875rem;border-radius:var(--radius-md);font-size:0.875rem;font-weight:600;
  text-decoration:none;border:1px solid transparent;cursor:pointer;line-height:1.2}
.sod-btn-ghost{background:var(--color-surface);color:var(--color-text);border-color:var(--color-border-strong)}
.sod-btn-ghost:hover{background:var(--color-bg-subtle)}
.sod-btn:focus-visible{outline:2px solid var(--color-border-focus);outline-offset:2px}

/* --- Narrow screens ---------------------------------------------------- */
@media (max-width:560px){
  .sod-title{font-size:1.5rem}
  .sod-card-head{flex-direction:column;align-items:flex-start;gap:0.25rem}
  /* Four steps across a 320px screen leaves about 70px a label, which is one
     word. Stacked, each step keeps its rail and gets the width to say what it
     means. */
  .sod-steps{grid-auto-flow:row;grid-auto-columns:auto;gap:0;padding:0.875rem 1rem}
  .sod-step{grid-template-columns:auto 1fr;justify-items:start;text-align:left;
    column-gap:0.75rem;padding:0.375rem 0}
  .sod-step .sod-dot{grid-row:span 2}
  .sod-step::before,.sod-step::after{top:auto;left:11px;right:auto;width:2px;height:50%}
  .sod-step::before{top:0}
  .sod-step::after{bottom:0}
  .sod-step-label{margin-top:0}
}
@media (max-width:480px){
  /* The price stops sharing the name's row and drops under it, which buys the
     product name the whole width instead of wrapping it into a column. */
  .sod-item{grid-template-columns:auto 1fr}
  .sod-item-price{grid-column:2;margin-top:0.25rem}
  .sod-thumb{grid-row:span 3}
  .sod-doc{grid-template-columns:auto 1fr}
  .sod-doc-get{grid-column:2;grid-row:auto;justify-self:start;margin-top:0.25rem}
}

/* --- Print ------------------------------------------------------------- */
/* There is a proper printable receipt a click away, but people print whatever
   is in front of them. Drop the tints and anything that is a control. */
@media print{
  .sod-btn,.sod-back,.sod-track{display:none}
  .sod-card,.sod-steps,.sod-note{border-color:#999;background:none;break-inside:avoid}
  .sod-card-head,.sod-totals{background:none}
}
`
