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
.scd-line{display:grid;grid-template-columns:auto minmax(0,1fr) auto;
  grid-template-areas:"thumb main price" "thumb deliv deliv" "thumb qty remove";
  gap:0.5rem 0.875rem;align-items:center;padding-bottom:1.125rem;border-bottom:1px solid var(--color-border)}
.scd-list > li:last-child{border-bottom:0;padding-bottom:0}
.scd-thumb{grid-area:thumb;align-self:start;object-fit:cover;background:var(--color-bg-subtle)}
.scd-main{grid-area:main;min-width:0;overflow-wrap:anywhere}
.scd-name{color:inherit;text-decoration:none;font-weight:600;line-height:1.3}
.scd-sec{margin:0.25rem 0 0;font-size:0.8125rem;color:var(--color-text-muted)}
.scd-warn{margin:0.25rem 0 0;font-size:0.8125rem;color:var(--color-danger)}
.scd-note{margin:0.25rem 0 0;font-size:0.8125rem;color:var(--color-text-muted)}
.scd-price{grid-area:price;justify-self:end;align-self:start;font-weight:600;white-space:nowrap}
.scd-deliv{grid-area:deliv;min-width:0;align-self:start}
.scd-deliv select{max-width:100%}
.scd-deliv label,.scd-deliv legend{min-width:0}
.scd-deliv label input{flex:0 0 auto}
.scd-qty{grid-area:qty;justify-self:start}
.scd-remove{grid-area:remove;justify-self:end}
.scd-removetxt{border:0;padding:0;background:none;color:var(--color-text-muted);font-family:inherit;
  font-size:0.9063rem;text-decoration:underline;cursor:pointer}
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
}
@media (prefers-reduced-motion:reduce){
  .scd-overlay,.scd-panel{transition:none}
}
`
