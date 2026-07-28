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

export const CART_LINE_CSS = `
.scl{min-width:0}
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
  .scl-qty{grid-area:qty;justify-self:start;align-self:end}
  .scl-price{grid-area:price;justify-self:end;align-self:start;text-align:right}
  .scl-remove{grid-area:remove;justify-self:end;align-self:end}
}
`
