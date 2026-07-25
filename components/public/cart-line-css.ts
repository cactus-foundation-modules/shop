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
// delivery column (`scl-deliv`) sits between the name and the price on desktop,
// and drops to a full-width row of its own on mobile; it's simply absent on a
// line no delivery picker was offered for. The classes are inert wherever
// there's no `.scl` grid parent (e.g. the table layout reuses the thumbnail
// renderer), so they're safe to apply everywhere.

export const CART_LINE_CSS = `
.scl{min-width:0}
.scl-main{min-width:0;overflow-wrap:anywhere}
.scl-main select{max-width:100%}
.scl-main label{min-width:0;flex-wrap:wrap}
.scl-deliv{min-width:0}
.scl-deliv select{max-width:100%}
.scl-deliv label,.scl-deliv legend{min-width:0;flex-wrap:wrap}
/* On desktop each line is its own flex row, so a wider delivery column on one
   line would push that line's qty/price/remove further left than the next
   line's - the columns "chunk" out of alignment. A fixed basis pins the
   delivery column to one width on every line, so the trailing columns line up
   down the cart. The width is sized to hold a full option label - tier name +
   its promised date + price - on a single line ("Standard Pre-built Delivery by
   Monday 10th of August (+£15.00)"); a label longer than that simply wraps.
   Off below 640px, where the whole line restacks onto the grid above and the
   delivery row spans full width (wrapping onto two lines there is fine). */
@media (min-width:641px){
  .scl-deliv{flex:0 0 25rem;width:25rem}
}
@media (max-width:640px){
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
