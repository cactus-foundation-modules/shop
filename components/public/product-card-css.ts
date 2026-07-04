import type { Breakpoints } from '@/modules/shop/lib/breakpoints'

// Shared product-card styling for the cross-sell / related grids on the
// product page. Same visual language as the RANGE grid's `.sr-*` cards in
// ShopProductGrid (hover lift, 4/3 cover, teal price, "View" affordance) so
// the whole shop reads as one system. Class prefix `spc-` (shop product card).
// Kept inside the module - never a core globals.css edit. Breakpoints come from
// the site's Styles setting (4 cols -> 2 at tablet -> 1 at mobile).
export function productCardCss({ tabletBp, mobileBp }: Breakpoints): string {
  return `
.spc-head{display:flex;align-items:baseline;gap:16px;margin:8px 0 20px;flex-wrap:wrap}
.spc-head h2{font-family:var(--display-family,Georgia,serif);font-weight:600;font-size:26px;margin:0;color:var(--color-fg);line-height:1.2}
.spc-head span{font-size:13px;color:var(--color-text-muted)}
.spc-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:20px}
.spc-card{position:relative;display:flex;flex-direction:column;background:var(--color-surface);border:1px solid var(--color-border);border-radius:12px;overflow:hidden;text-decoration:none;color:inherit;box-shadow:0 1px 3px rgba(0,0,0,.06);transition:box-shadow .25s ease,transform .25s ease}
.spc-card:hover{transform:translateY(-4px);box-shadow:0 8px 30px rgba(0,0,0,.10)}
.spc-img{position:relative;aspect-ratio:4/3;background:var(--color-bg-subtle);overflow:hidden}
.spc-img img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .4s ease}
.spc-card:hover .spc-img img{transform:scale(1.03)}
.spc-body{display:flex;flex-direction:column;gap:8px;padding:16px;flex:1}
.spc-name{margin:0;font-size:16px;font-weight:600;color:var(--color-fg);line-height:1.3}
.spc-pricerow{display:flex;gap:8px;align-items:baseline}
.spc-price{font-size:16px;font-weight:600;color:var(--color-primary)}
.spc-compare{font-size:13px;color:var(--color-text-muted);text-decoration:line-through}
.spc-view{margin-top:auto;display:inline-flex;align-items:center;gap:4px;font-size:13px;font-weight:600;color:var(--color-primary)}
.spc-view svg{transition:transform .2s ease}
.spc-card:hover .spc-view svg{transform:translateX(3px)}
@media (max-width:${tabletBp}){.spc-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:${mobileBp}){.spc-grid{grid-template-columns:1fr}}
`
}
