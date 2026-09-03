// The section-head strip - heading, the line beside it, and the "View all" link
// on the right - as one string, because it has to be emitted in two places that
// must never drift: the storefront's full card stylesheet (card-parts.tsx) and
// the editor canvas, which prints a cut-down <style> of its own rather than pull
// the whole card stylesheet into the client editor bundle.
//
// Deliberately dependency-free: card-parts.tsx is imported by every RSC grid, so
// anything this file reached for would land in all of them.
export const SHOP_SECTION_HEAD_CSS = `
.shop-sec-head{display:flex;align-items:baseline;gap:16px;margin:8px 0 20px;flex-wrap:wrap}
.shop-sec-head h2{font-family:var(--display-family,Georgia,serif);font-weight:600;font-size:26px;margin:0;color:var(--color-fg);line-height:1.2}
.shop-sec-head span{font-size:13px;color:var(--color-text-muted)}
/* Pushed to the far end of the strip and centred against the heading rather than
   sitting on its baseline, so a pill next to 26px display type does not ride low.
   data-cactus-unstyled on the element itself: core paints every link inside
   <main> with the theme's link colour, which would recolour the wording of a
   button that has already chosen its own. Having opted out, every state below is
   this stylesheet's to supply - there is no site fallback left. */
.shop-sec-more{margin-left:auto;align-self:center;display:inline-flex;align-items:center;gap:.45em;font-size:14px;font-weight:600;line-height:1;padding:9px 16px;border:1px solid var(--color-border-strong);border-radius:999px;background:transparent;color:var(--color-fg);text-decoration:none;white-space:nowrap;transition:background .2s ease,border-color .2s ease}
.shop-sec-more::after{content:'\\2192';font-weight:400}
.shop-sec-more:hover{background:var(--color-bg-subtle);border-color:var(--color-fg);color:var(--color-fg)}
.shop-sec-more:focus-visible{outline:2px solid var(--color-border-focus);outline-offset:2px}
`
