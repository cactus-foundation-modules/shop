// Styling for the slide-out basket (CartDrawerClient). Injected as a <style>
// string inside the module, never a core globals.css edit - same discipline as
// cart-line-css.ts, whose chrome (the quantity pill, the remove cross, the
// chosen-service summary and its switch chips) this surface reuses wholesale.
//
// Class prefix `scd-` (shop cart drawer) so nothing here collides with the cart
// page's `scl-*` line grid. The drawer deliberately does NOT reuse `.scl`: that
// class carries a desktop row layout (and a subgrid track set owned by the cart
// list) which makes no sense in a 400px panel. The drawer stacks every line the
// way the cart page stacks on a phone, at every width, because a panel is always
// phone-narrow.
//
// Every colour is a token, so the panel follows the site's light/dark theme.

export const CART_DRAWER_CSS = `
/* Open and shut are one class, not two mounts: the panel stays in the DOM once
   it has been opened and simply slides out of the viewport again. Visibility
   is what takes a shut panel out of the tab order and the accessibility tree,
   and it is delayed by exactly the length of the slide so the exit animation
   still plays (a plain visibility flip would cut it off). */
.scd-overlay{position:fixed;inset:0;z-index:900;background:rgba(0,0,0,0.42);opacity:0;visibility:hidden;
  transition:opacity 220ms ease-out,visibility 0s linear 220ms}
.scd-overlay.scd-in{opacity:1;visibility:visible;transition:opacity 220ms ease-out,visibility 0s}
.scd-panel{position:fixed;top:0;bottom:0;z-index:901;display:flex;flex-direction:column;
  width:min(var(--scd-w,420px),100vw);background:var(--color-surface);color:var(--color-text);
  box-shadow:0 0 40px rgba(0,0,0,0.24);visibility:hidden;
  transition:transform 240ms ease-out,visibility 0s linear 240ms}
.scd-right{right:0;transform:translateX(100%)}
.scd-left{left:0;transform:translateX(-100%)}
.scd-panel.scd-in{transform:none;visibility:visible;transition:transform 240ms ease-out,visibility 0s}

/* The way in is a keyframe animation, not the transition above, because the
   panel is loaded on demand and mounts already open: on that first click its
   very first painted frame is the open one, and a transition has no earlier
   frame to move from, so the basket used to just appear. An animation runs from
   its own start frame whether or not the element existed a frame ago. The
   transition
   still does the way out, where the open position is on screen to leave from.
   Both directions are the same 240ms ease-out, so a panel already in the DOM
   slides identically whichever rule wins. */
.scd-right.scd-in{animation:scd-slide-right 240ms ease-out}
.scd-left.scd-in{animation:scd-slide-left 240ms ease-out}
.scd-overlay.scd-in{animation:scd-fade 220ms ease-out}
@keyframes scd-slide-right{from{transform:translateX(100%)}to{transform:none}}
@keyframes scd-slide-left{from{transform:translateX(-100%)}to{transform:none}}
@keyframes scd-fade{from{opacity:0}to{opacity:1}}

/* ---- Header ---- */
.scd-head{flex:none;display:flex;align-items:center;gap:1rem;padding:1.125rem 1.25rem;
  border-bottom:1px solid var(--color-border)}
.scd-title{margin:0;font-size:1.375rem;line-height:1.2;font-weight:700}
.scd-close{margin-left:auto;display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;
  border:0;border-radius:9999px;background:none;color:var(--color-text);cursor:pointer;
  transition:background 120ms ease-out}
.scd-close:hover{background:var(--color-bg-subtle)}

/* ---- Scrolling line list ---- */
.scd-body{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:1.25rem}
.scd-list{list-style:none;margin:0;padding:0;display:grid;gap:1.125rem}
/* Two rows: the thumbnail, the name and the money column across the top, then
   the delivery picker full width underneath the lot. The picker's options are
   the longest text on a line, so a 420px panel gives it the whole width rather
   than the third of one a side-by-side column would leave it. */
.scd-line{display:grid;grid-template-columns:auto minmax(0,1fr) auto;
  grid-template-areas:"thumb main side" "deliv deliv deliv";
  gap:0.625rem 0.875rem;align-items:start;padding-bottom:1.125rem;border-bottom:1px solid var(--color-border)}
.scd-list > li:last-child{border-bottom:0;padding-bottom:0}
.scd-thumb{grid-area:thumb;align-self:start;object-fit:cover;background:var(--color-bg-subtle)}
.scd-main{grid-area:main;min-width:0;overflow-wrap:anywhere}
.scd-name{color:inherit;text-decoration:none;font-weight:600;line-height:1.3}
.scd-sec{margin:0.25rem 0 0;font-size:0.8125rem;color:var(--color-text-muted)}
.scd-warn{margin:0.25rem 0 0;font-size:0.8125rem;color:var(--color-danger)}
.scd-note{margin:0.25rem 0 0;font-size:0.8125rem;color:var(--color-text-muted)}

/* The money column: price, then the stepper, then Remove, each stretched to the
   one track so all three read as the same width. The floor keeps the track wide
   enough for the compact stepper below, so it is the price that sets the width
   for any figure longer than that. */
.scd-side{grid-area:side;display:grid;gap:0.375rem;justify-items:stretch;min-width:5rem;text-align:right}
.scd-price{font-weight:600;white-space:nowrap}
.scd-side .scl-qtybox{width:100%;box-sizing:border-box;height:32px;justify-content:space-between}
.scd-side .scl-qtybox button{width:24px;flex:0 0 auto;font-size:1rem}
.scd-side .scl-qtybox input{width:1.625rem;flex:1 1 auto;min-width:0;font-size:0.8125rem}
.scd-deliv{grid-area:deliv;min-width:0;align-self:start}
.scd-deliv select{max-width:100%}
.scd-deliv label,.scd-deliv legend{min-width:0}
.scd-deliv label input{flex:0 0 auto}

/* ---- The delivery picker, panel-sized ----
   Same card as the cart page (cart-line-css.ts), its content set 10% smaller
   here: it has ~420px of panel to say what it says in a full cart row's worth of
   words. Written out rather than scaled with a single em because the shared
   card sizes every part of itself in rem, which would ignore a parent font size.
   Each figure below is exactly 0.9 x its cart-page value. */
.scd-deliv .scl-sum{gap:0.7875rem;padding:0.675rem 0.9rem}
.scd-deliv .scl-tick{width:17px;height:17px}
.scd-deliv .scl-s-below{font-size:0.7313rem}
.scd-deliv .scl-hints{gap:0.3375rem;margin-top:0.45rem}
.scd-deliv .scl-hints-t{font-size:0.7313rem}
.scd-deliv .scl-hint{font-size:0.7313rem;padding:0.225rem 0.5625rem}
.scd-deliv .scl-hint-fee{margin-left:0.3938rem}

/* Two lines, not one. The promised date owns the top line; the service and its
   price sit together at the foot of the card, the price beside the service
   rather than across the card from it (see summaryLayout='stacked' in
   CartLineControlView). Both rows are one unwrappable line inside a clipped box,
   which is what makes scrollWidth past clientWidth mean "wider than the card" -
   the measurement the fitter in fit-line.ts scales the row down by. The rows
   carry the font size and their parts are sized in em, so scaling a row scales
   everything on it. Nothing may shrink either: a flex child that gives way
   would keep the row's own scrollWidth inside its box and the row would measure
   as fitting while its text was quietly cut off. */
.scd-deliv .scl-s-top,.scd-deliv .scl-s-foot{display:flex;align-items:baseline;gap:0.5rem;min-width:0;
  overflow:hidden;white-space:nowrap;font-size:0.8438rem}
.scd-deliv .scl-s-top > *,.scd-deliv .scl-s-foot > *{flex:0 0 auto;min-width:0}
/* The mobile rules on the shared card let these wrap; a panel is phone-narrow at
   every width, and wrapping is what the fitter exists to avoid. */
.scd-deliv .scl-s-date,.scd-deliv .scl-s-desc{white-space:nowrap}
.scd-deliv .scl-s-date{font-size:1em}
.scd-deliv .scl-s-desc{font-size:0.9em}
.scd-deliv .scl-s-foot .scl-s-fee{margin-left:0;font-size:0.9667em}
/* Floor reached and the line is still too long for the card (a very wordy
   service name, a very long date). The price is the part that must survive
   whole, so the words are what gives - trailing off rather than being chopped
   mid-letter at the card's edge. */
.scd-deliv .scl-s-foot.sfit-clip .scl-s-desc,
.scd-deliv .scl-s-top.sfit-clip .scl-s-date{flex:0 1 auto;overflow:hidden;text-overflow:ellipsis}
.scd-removetxt{border:0;padding:0;background:none;color:var(--color-text-muted);font-family:inherit;
  font-size:0.75rem;text-align:right;text-decoration:underline;cursor:pointer}
.scd-removetxt:hover{color:var(--color-danger)}
.scd-removetxt[disabled]{cursor:default}

/* ---- Empty state ---- */
.scd-empty{display:grid;gap:0.75rem;justify-items:start;color:var(--color-text-muted)}

/* ---- Footer: notes, subtotal, actions ---- */
.scd-foot{flex:none;display:grid;gap:0.75rem;padding:1.25rem;border-top:1px solid var(--color-border);
  background:var(--color-surface)}
.scd-notes{list-style:none;margin:0;padding:0;display:grid;gap:0.25rem}
.scd-notes li{display:flex;align-items:baseline;gap:0.4375rem;font-size:0.9063rem;color:var(--color-success);font-weight:600}
.scd-sub{display:flex;align-items:baseline;justify-content:space-between;font-size:1.125rem;font-weight:700}
.scd-btn{display:block;width:100%;box-sizing:border-box;padding:0.875rem 1.25rem;text-align:center;
  font-family:inherit;font-size:1rem;font-weight:700;text-decoration:none;border:0;cursor:pointer}
.scd-ghost{display:block;width:100%;box-sizing:border-box;padding:0.8125rem 1.25rem;text-align:center;
  font-family:inherit;font-size:1rem;font-weight:600;text-decoration:none;cursor:pointer;
  border:1.5px solid currentColor;background:none}

@media (pointer:coarse){
  .scd-close{width:44px;height:44px}
  /* The shared stepper's touch rule widens its buttons to 44px, which a narrow
     money column cannot give it. Fingertip-sized here means taller and a little
     wider, with the column's floor moved up to match. */
  .scd-side{min-width:6.25rem}
  .scd-side .scl-qtybox{height:38px}
  .scd-side .scl-qtybox button{width:32px}
  /* The shared card's own touch padding is a class less specific than the
     panel-sized rules above, so it would be overruled; here it is, 10% down
     like everything else in the panel's card. */
  .scd-deliv .scl-hint{padding:0.45rem 0.7875rem}
}
@media (prefers-reduced-motion:reduce){
  .scd-overlay,.scd-panel{transition:none}
  .scd-right.scd-in,.scd-left.scd-in,.scd-overlay.scd-in{animation:none}
}
`
