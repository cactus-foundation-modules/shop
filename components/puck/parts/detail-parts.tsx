import { AddToCartButton } from '@/modules/shop/components/public/AddToCartButton'
import { GalleryViewportFit } from '@/modules/shop/components/public/GalleryViewportFit'
import { ProductGallery, ProductTabs, type ProductTab } from '@/modules/shop/components/public/ProductDetailIslands'
import { DEFAULT_BREAKPOINTS, type Breakpoints } from '@/modules/shop/lib/breakpoints'
import { formatMoney } from '@/modules/shop/lib/money'
import type { ShpProduct } from '@/modules/shop/lib/types'
import type { DetailPartContext } from '@/modules/shop/components/puck/parts/part-context'

// Product Detail part-blocks. Each is a small draggable piece of a Product
// Detail layout (admin > Layouts > Shop > Product Detail). The markup and class
// names are carved straight out of the old hardcoded ShopProductDetail so the
// live look is unchanged; the two-column structure now comes from the layout's
// own Split/Section blocks, not a `.spd-pdp` grid. Each part renders a labelled
// skeleton in the editor canvas (no product there) and its real slice on the
// live page, reading the injected `_ctx`. Colours are tokens only.

const yesNo = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
]

function Style({ css }: { css: string }) {
  return <style dangerouslySetInnerHTML={{ __html: css }} />
}

// ---------------------------------------------------------------------------
// Gallery (main image + thumbnails)
// ---------------------------------------------------------------------------

// The product photo is always square, and the stage with it. Both offsets below
// need the site header's real height, measured and published as `--spd-header-h`
// by GalleryViewportFit (the 96px fallback covers the moment before hydration
// and the editor canvas, and was the old hardcoded guess for every site);
// `--spd-thumbs-h` is the strip's measured height, published the same way.
//
// The column sticks clear of the header, and the stage fits the leftover
// viewport by giving up WIDTH - `aspect-ratio` then takes the height with it, so
// it stays square and merely gets smaller. Capping its height instead (the
// obvious move, and what this did briefly) squashes a square stage into a
// letterbox and crops the photo, which is exactly what the ratio is here to
// prevent. `--spd-fit` is that width budget: what's left of the viewport once
// the header, the strip and the gaps have had their share.
//
// That budget is the COLUMN's width, not just the stage's, so the column hugs
// the photo and the buy column beside it collects whatever the photo didn't
// want. It has to be a definite width for that to work: the layout's Split is
// set to the `auto` ratio, whose fit-content track can only hug content that
// declares a width, and `max-width` (unlike `width`) is ignored while the track
// is being sized, so it clamps the column to the track afterwards without
// feeding a percentage back into the measurement that produced it.
const galleryCss = ({ tabletBp, mobileBp }: Breakpoints, maxPct: number) => `
/* Hard ceiling on the media column: whatever the Split's ratio says, the cell
   holding the gallery never takes more than maxPct of the row (the block's own
   "Max media width" field, default 45%), so the buy column keeps the rest.
   The Split writes grid-template-columns inline, so this needs
   !important to land, and :has() keeps it to the one cell that actually holds
   the gallery.
   minmax(0,N%), not fit-content(N%): the auto ratio's fit-content(60%) was
   already meant to be a ceiling and wasn't one, because the column below
   declares a definite width. A definite width is also the item's min-content
   contribution, and fit-content floors the track at that - so the track grew to
   whatever --spd-fit asked for and sailed past 60%. minmax's max sizing
   function has no such floor, and the column's own max-width:100% then clamps
   --spd-fit to the capped track. */
.puck-split:has(.spd-stage-col){grid-template-columns:minmax(0,${maxPct}%) 1fr !important}
.puck-split:has(> :last-child .spd-stage-col){grid-template-columns:1fr minmax(0,${maxPct}%) !important}
/* Stacked, there is no row to take a share of, and core's own collapse rule is
   !important too - this selector outranks it, so it has to re-state it. */
@media (max-width:${mobileBp}){.puck-split:has(.spd-stage-col){grid-template-columns:1fr !important}}
.spd-stage-col{--spd-fit:calc(100dvh - var(--spd-header-h,96px) - 32px - var(--spd-thumbs-h,76px));width:var(--spd-fit);max-width:100%;position:sticky;top:calc(var(--spd-header-h,96px) + 16px);display:flex;flex-direction:column;gap:12px}
/* Sticking needs somewhere to stick: a sticky box can only travel inside its own
   parent, so the parent has to outlive it. The gallery's parent is the Split's
   left cell, and a Split set to align "start" (which the Default template is, so
   the buy column starts level with the photo rather than centring against it)
   sizes both cells to their own content. The left cell then ends exactly where
   the photo does, the column fills it, travel is zero, and the photo scrolls
   away with the page - sticky was quietly a no-op on the busiest layout there is.
   Stretching just this cell hands the column the taller buy column's height to
   travel down, and leaves the buy column's own alignment alone.
   Selected via :has rather than fixing the template because the alignment is
   saved per site: a shop that already has a product page keeps the align it was
   built with, and CSS is the only half of this that reaches it. */
:has(> .spd-stage-col){align-self:stretch}
/* The stage simply fills that column now - the column is already the photo's
   width, so there is no slack left to centre the photo in. flex:none because the
   width is the whole mechanism - letting flex shrink the height instead would
   undo it. min-width is the floor the fit-content track reads as its min-content,
   so a very short viewport can't crush the photo to nothing. */
.spd-stage{position:relative;border:1px solid var(--color-border);border-radius:16px;background:var(--color-bg-subtle);overflow:hidden;aspect-ratio:1/1;display:flex;align-items:center;justify-content:center;flex:none;width:100%;min-width:140px}
/* Beside sits the strip next to the stage rather than under it, so the strip's
   height is no longer the stage's problem - only the header's is. Here the stage
   takes the row's leftover width and caps it, rather than setting it outright,
   since the strip is spending some of that width too. The column keeps its auto
   width for the same reason: --spd-fit is the stage's budget here, not the whole
   row's, so handing it to the column would short the stage by the strip. */
.spd-stage-col.beside{--spd-fit:calc(100dvh - var(--spd-header-h,96px) - 32px);width:auto;flex-direction:row-reverse;align-items:flex-start}
.spd-stage-col.beside .spd-stage{flex:1 1 auto;align-self:flex-start;width:auto;max-width:var(--spd-fit);min-width:0}
.spd-stage-col.beside .spd-thumbs{flex-direction:column;margin-top:0;flex:none}
.spd-stage-img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .18s ease}
.spd-stage.zoomable{cursor:zoom-in}
/* touch-action only while magnified, so a finger passing over a plain image still scrolls the page */
.spd-stage.zoomed{cursor:zoom-out;touch-action:none}
@media (prefers-reduced-motion:reduce){.spd-stage-img{transition:none}}
/* The column's gap now does the spacing the margin used to. The strip keeps its
   full height; the stage is what gives way, by shrinking squarely. */
.spd-thumbs{display:flex;gap:10px;margin-top:0;flex-wrap:wrap;flex:none}
/* A strip below the stage must not wrap, because its height feeds --spd-fit and
   its width is now that same budget's result. Wrapping closes that circle: a
   narrower strip takes more rows, a taller strip leaves the photo less, a
   smaller photo narrows the column, and the ResizeObserver in GalleryViewportFit
   chases it round. One nowrap row is a constant 64px however many photos there
   are, so the budget holds still and the extras scroll sideways instead.
   Beside is exempt: its strip is a column whose height never entered the sum.

   contain:inline-size is what actually stops fifteen thumbnails widening the
   column they are supposed to sit inside. overflow-x and min-width:0 were meant
   to do that job and don't: they only free the strip to BE narrow (they drop its
   automatic minimum size), while its min-content width is still the whole nowrap
   row - 656px for the nine photos on Deskwell's Chiro Plus. That figure was
   quietly the widest thing in the gallery column, so a stacked mobile layout,
   whose single 1fr track is floored by its items' min-content, was sized 656px
   inside a 327px page and the shopper could swipe the whole product page
   sideways. Containment makes the strip's intrinsic width 0 as intended, so the
   track is free to be the page's width and the row scrolls inside it. */
.spd-stage-col:not(.beside) .spd-thumbs{flex-wrap:nowrap;overflow-x:auto;min-width:0;contain:inline-size}
/* Shop's own strip below the stage sits in a positioned box (GalleryThumbStrip)
   so the arrows and fades have something to hang off. That makes the wrapper the
   column's flex child and the strip the wrapper's, so flex:none moves up here
   with the role: the column's main axis is vertical, so it is the strip's HEIGHT
   that was ever being pinned, and its width came from the cross-axis stretch the
   wrapper still gets.
   Everything below is scoped to the wrapper rather than to the strip, because a
   slot provider's gallery (shop-variations') wears our .spd-thumbs class but
   renders it straight into the column with no wrapper. flex:1 1 auto reaching it
   there would read as grow-to-fill on the vertical axis and stretch its strip
   down the page, and a hidden scrollbar would leave it with no overflow hint at
   all, having no arrows to replace it with. */
.spd-thumbs-wrap{position:relative;display:flex;flex:none;min-width:0}
/* The strip takes the wrapper's width and scrolls inside it rather than sizing
   to its thumbnails, which is what keeps fifteen photos from widening the column
   they are supposed to sit in. The scrollbar goes because the arrows say the
   same thing more clearly, and because its height was quietly being charged to
   the photo's budget via --spd-thumbs-h. */
.spd-thumbs-wrap .spd-thumbs{flex:1 1 auto;scrollbar-width:none;-ms-overflow-style:none}
.spd-thumbs-wrap .spd-thumbs::-webkit-scrollbar{display:none}
/* Fades start where the arrow ends, so the row appears to run on underneath the
   button rather than out of it. Page bg rather than a hardcoded white: this is
   the shopper's site, in whichever mode they are reading it in. */
.spd-thumbs-fade{position:absolute;top:0;bottom:0;width:2rem;pointer-events:none}
.spd-thumbs-fade.start{left:1.5rem;background:linear-gradient(to right,var(--color-page-bg,var(--color-bg)),transparent)}
.spd-thumbs-fade.end{right:1.5rem;background:linear-gradient(to left,var(--color-page-bg,var(--color-bg)),transparent)}
.spd-thumbs-arrow{position:absolute;top:0;bottom:0;width:1.5rem;z-index:1;display:flex;align-items:center;justify-content:center;padding:0;border:none;cursor:pointer;background:var(--color-page-bg,var(--color-bg));color:var(--color-text-muted);font-family:inherit;font-size:1rem;line-height:1}
.spd-thumbs-arrow.start{left:0}
.spd-thumbs-arrow.end{right:0}
.spd-thumbs-arrow:hover{color:var(--color-text)}
/* flex:none or a nowrap strip squashes its thumbnails to fit instead of
   scrolling them - they'd stop being square, which is the one thing they are. */
.spd-thumb{width:64px;height:64px;flex:none;border:1px solid var(--color-border);border-radius:8px;overflow:hidden;background:var(--color-bg-subtle);cursor:pointer;padding:0;transition:border-color .12s ease,box-shadow .12s ease}
.spd-thumb img{width:100%;height:100%;object-fit:cover;display:block}
.spd-thumb.on{border-color:var(--color-primary);box-shadow:0 0 0 1px var(--color-primary)}
.spd-thumb:hover{border-color:var(--color-primary)}
/* Nothing to stick to once the page is short of room for a sticky column. */
@media (max-width:${tabletBp}){.spd-stage-col{position:static}}
/* The hug stands down only where the Split actually stacks, which core does at
   the MOBILE breakpoint (tokens.ts), not the tablet one - between the two the
   buy column is still beside the gallery and still wants the slack. Stacked, the
   gallery has the full width to itself and the photo should use the width it has
   rather than shrink to a viewport it no longer shares; hugging there would only
   donate the slack to the margin. */
@media (max-width:${mobileBp}){.spd-stage-col{width:100%}}
`

type GalleryProps = { _ctx?: DetailPartContext; thumbPosition?: string; maxWidthPct?: number }

// The cap is a percentage of the Split row, so anything outside 10-90 is either
// no cap at all or no buy column - clamp rather than trust the field, and fall
// back to the default for a blank or non-numeric value (Puck's number field
// hands back an empty string while the box is being cleared).
const DEFAULT_MAX_WIDTH_PCT = 45
function capPct(value: unknown) {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_MAX_WIDTH_PCT
  return Math.min(90, Math.max(10, Math.round(n)))
}

export function ShopDetailGallery(props: GalleryProps) {
  return (
    <>
      <Style css={galleryCss(DEFAULT_BREAKPOINTS, capPct(props.maxWidthPct))} />
      <div className={`spd-stage-col${props.thumbPosition === 'beside' ? ' beside' : ''}`} style={{ opacity: 0.6 }}>
        <div className="spd-stage spd-stage-empty" />
        {/* Wrapped exactly as the frontend strip is (GalleryThumbStrip), so the
            preview inherits the same flex roles. Four placeholders never
            overflow, so no arrows are earned here. `beside` has no wrapper. */}
        {props.thumbPosition === 'beside' ? (
          <div className="spd-thumbs">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="spd-thumb" />
            ))}
          </div>
        ) : (
          <div className="spd-thumbs-wrap">
            <div className="spd-thumbs">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="spd-thumb" />
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  )
}

export function ShopDetailGalleryRsc(props: GalleryProps) {
  const ctx = props._ctx
  if (!ctx) return null
  // The layout already carries the provider's own gallery block, so that one
  // owns the job and this part steps aside entirely - see `covered`.
  if (ctx.slot?.covered.includes('Gallery')) return null
  // A claimed product's image follows the shopper's chosen combination, so the
  // provider's gallery replaces ours - styled with our classes so it still looks
  // like this layout's gallery.
  const SlotGallery = ctx.slot?.Gallery
  // Extra items another module has for this product (a 3D model, say), resolved
  // once per page by the injector alongside the slot rather than awaited here.
  // This part must stay synchronous: wrapResponsiveRender calls a block's render
  // as a plain function, so an async one hands it a Promise rather than markup.
  const extras = ctx.galleryExtras
  return (
    <>
      <Style css={galleryCss(ctx.bp, capPct(props.maxWidthPct))} />
      <GalleryViewportFit />
      {SlotGallery ? (
        <SlotGallery
          slug={ctx.product.slug}
          productId={ctx.product.id}
          currencySymbol={ctx.currencySymbol}
          layoutBlockTypes={ctx.layoutBlockTypes}
          productName={ctx.product.name}
          images={ctx.images}
          thumbPosition={props.thumbPosition}
          zoom={ctx.zoomImages}
          extras={extras}
          classNames={{
            col: `spd-stage-col${props.thumbPosition === 'beside' ? ' beside' : ''}`,
            stage: 'spd-stage',
            image: 'spd-stage-img',
            thumbs: 'spd-thumbs',
            thumb: 'spd-thumb',
            thumbOn: 'spd-thumb on',
          }}
        />
      ) : (
        <ProductGallery images={ctx.images} productName={ctx.product.name} thumbPosition={props.thumbPosition} zoom={ctx.zoomImages} extras={extras} />
      )}
    </>
  )
}

export const shopDetailGalleryPuckComponent = {
  label: 'Product: Gallery',
  fields: {
    thumbPosition: { type: 'select' as const, label: 'Thumbnails', options: [{ value: 'below', label: 'Below image' }, { value: 'beside', label: 'Beside image' }] },
    maxWidthPct: { type: 'number' as const, label: 'Max media width (% of row)', min: 10, max: 90 },
  },
  defaultProps: { thumbPosition: 'below', maxWidthPct: DEFAULT_MAX_WIDTH_PCT },
  render: ShopDetailGallery,
}
export const shopDetailGalleryPuckRscComponent = { ...shopDetailGalleryPuckComponent, render: ShopDetailGalleryRsc }

// ---------------------------------------------------------------------------
// Badges (new / trade / stock / low / out)
// ---------------------------------------------------------------------------

const badgesCss = `
.spd-badges{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px}
.spd-badge{display:inline-block;font-size:12px;font-weight:600;padding:4px 9px;border-radius:6px;line-height:1.35}
.spd-badge-new{background:var(--color-primary);color:var(--color-on-primary)}
.spd-badge-trade{background:var(--color-fg);color:var(--color-bg)}
.spd-badge-stock{background:var(--color-success-subtle);color:var(--color-success)}
.spd-badge-low{background:var(--color-warning-subtle);color:var(--color-warning);border:1px solid var(--color-warning-border)}
.spd-badge-out{background:var(--color-surface);color:var(--color-text-muted);border:1px solid var(--color-border)}
`

type PartProps = { _ctx?: DetailPartContext }

export function ShopDetailBadges(_props: PartProps) {
  return (
    <>
      <Style css={badgesCss} />
      <div className="spd-badges" style={{ opacity: 0.6 }}>
        <span className="spd-badge spd-badge-new">New</span>
        <span className="spd-badge spd-badge-stock">In stock</span>
      </div>
    </>
  )
}

export function ShopDetailBadgesRsc({ _ctx }: PartProps) {
  if (!_ctx) return null
  const { tagSlugs, outOfStock, lowStock, product } = _ctx
  return (
    <>
      <Style css={badgesCss} />
      <div className="spd-badges">
        {tagSlugs.includes('new') && <span className="spd-badge spd-badge-new">New</span>}
        {tagSlugs.includes('trade') && <span className="spd-badge spd-badge-trade">Trade price</span>}
        {outOfStock ? (
          <span className="spd-badge spd-badge-out">Out of stock</span>
        ) : product.isPreOrder ? (
          <span className="spd-badge spd-badge-new">Pre-order</span>
        ) : lowStock ? (
          <span className="spd-badge spd-badge-low">Low stock</span>
        ) : (
          <span className="spd-badge spd-badge-stock">In stock</span>
        )}
      </div>
    </>
  )
}

export const shopDetailBadgesPuckComponent = { label: 'Product: Badges', fields: {}, defaultProps: {}, render: ShopDetailBadges }
export const shopDetailBadgesPuckRscComponent = { ...shopDetailBadgesPuckComponent, render: ShopDetailBadgesRsc }

// ---------------------------------------------------------------------------
// Title
// ---------------------------------------------------------------------------

const titleCss = `.spd-title{font-family:var(--display-family,Georgia,serif);font-weight:600;font-size:34px;line-height:1.2;margin:6px 0;color:var(--color-fg)}`

export function ShopDetailTitle(_props: PartProps) {
  return (
    <>
      <Style css={titleCss} />
      <div style={{ height: 30, width: '70%', background: 'var(--color-border)', borderRadius: 6, margin: '8px 0', opacity: 0.6 }} />
    </>
  )
}

export function ShopDetailTitleRsc({ _ctx }: PartProps) {
  if (!_ctx) return null
  return (
    <>
      <Style css={titleCss} />
      <h1 className="spd-title">{_ctx.product.name}</h1>
    </>
  )
}

export const shopDetailTitlePuckComponent = { label: 'Product: Title', fields: {}, defaultProps: {}, render: ShopDetailTitle }
export const shopDetailTitlePuckRscComponent = { ...shopDetailTitlePuckComponent, render: ShopDetailTitleRsc }

// ---------------------------------------------------------------------------
// SKU
// ---------------------------------------------------------------------------

const skuCss = `.spd-sku{font-size:13px;color:var(--color-text-muted)}`

export function ShopDetailSku(_props: PartProps) {
  return (
    <>
      <Style css={skuCss} />
      <div style={{ height: 13, width: '35%', background: 'var(--color-border)', borderRadius: 4, opacity: 0.6 }} />
    </>
  )
}

export function ShopDetailSkuRsc({ _ctx }: PartProps) {
  if (!_ctx || !_ctx.product.sku) return null
  return (
    <>
      <Style css={skuCss} />
      <div className="spd-sku">SKU {_ctx.product.sku}</div>
    </>
  )
}

export const shopDetailSkuPuckComponent = { label: 'Product: SKU', fields: {}, defaultProps: {}, render: ShopDetailSku }
export const shopDetailSkuPuckRscComponent = { ...shopDetailSkuPuckComponent, render: ShopDetailSkuRsc }

// ---------------------------------------------------------------------------
// Price (now / was / save)
// ---------------------------------------------------------------------------

const priceCss = `
.spd-price-block{margin:18px 0 4px;display:flex;align-items:baseline;gap:12px;flex-wrap:wrap}
.spd-price-now{font-family:var(--display-family,Georgia,serif);font-weight:600;font-size:34px;color:var(--color-primary)}
.spd-price-was{font-size:15px;color:var(--color-text-muted);text-decoration:line-through}
.spd-save{background:var(--color-success-subtle);color:var(--color-success);font-size:12px;font-weight:600;border-radius:9999px;padding:4px 11px}
`

type PriceProps = { _ctx?: DetailPartContext; showCompare?: string; showSave?: string }

export function ShopDetailPrice(_props: PriceProps) {
  return (
    <>
      <Style css={priceCss} />
      <div className="spd-price-block" style={{ opacity: 0.6 }}>
        <div style={{ height: 30, width: 110, background: 'var(--color-border)', borderRadius: 6 }} />
      </div>
    </>
  )
}

export function ShopDetailPriceRsc(props: PriceProps) {
  const ctx = props._ctx
  if (!ctx) return null
  const { product, currencySymbol, hasWas, savePct } = ctx
  const showCompare = props.showCompare !== 'no'
  const showSave = props.showSave !== 'no'
  // The layout already carries the provider's own price block. Rendering our
  // static parent price beside it would put two different figures for the one
  // product on the page, so this part steps aside - see `covered`.
  if (ctx.slot?.covered.includes('Price')) return null
  // A claimed product is priced by the chosen combination, so our static price
  // would be wrong the moment the shopper picks an option.
  const SlotPrice = ctx.slot?.Price
  if (SlotPrice) {
    return (
      <>
        <Style css={priceCss} />
        <SlotPrice
          slug={product.slug}
          productId={product.id}
          currencySymbol={currencySymbol}
          layoutBlockTypes={ctx.layoutBlockTypes}
          basePrice={product.price}
          compareAtPrice={showCompare && hasWas ? product.compareAtPrice : null}
          savePct={showSave ? savePct : null}
          showCompare={showCompare}
          showSave={showSave}
          classNames={{ block: 'spd-price-block', now: 'spd-price-now', was: 'spd-price-was', save: 'spd-save' }}
        />
      </>
    )
  }
  return (
    <>
      <Style css={priceCss} />
      <div className="spd-price-block">
        <span className="spd-price-now">{formatMoney(product.price, currencySymbol)}</span>
        {showCompare && hasWas && (
          <span className="spd-price-was">{formatMoney(product.compareAtPrice, currencySymbol)}</span>
        )}
        {showSave && savePct != null && savePct > 0 && <span className="spd-save">Save {savePct}%</span>}
      </div>
    </>
  )
}

export const shopDetailPricePuckComponent = {
  label: 'Product: Price',
  fields: {
    showCompare: { type: 'select' as const, label: 'Show "was" price', options: yesNo },
    showSave: { type: 'select' as const, label: 'Show "Save X%" badge', options: yesNo },
  },
  defaultProps: { showCompare: 'yes', showSave: 'yes' },
  render: ShopDetailPrice,
}
export const shopDetailPricePuckRscComponent = { ...shopDetailPricePuckComponent, render: ShopDetailPriceRsc }

// ---------------------------------------------------------------------------
// Blurb (short description)
// ---------------------------------------------------------------------------

const blurbCss = `.spd-blurb{margin-top:14px;color:var(--color-text-muted);max-width:52ch}`

export function ShopDetailBlurb(_props: PartProps) {
  return (
    <>
      <Style css={blurbCss} />
      <div className="spd-blurb" style={{ opacity: 0.6 }}>
        <div style={{ height: 12, width: '90%', background: 'var(--color-border)', borderRadius: 4, marginBottom: 6 }} />
        <div style={{ height: 12, width: '75%', background: 'var(--color-border)', borderRadius: 4 }} />
      </div>
    </>
  )
}

export function ShopDetailBlurbRsc({ _ctx }: PartProps) {
  if (!_ctx || !_ctx.product.shortDescription) return null
  return (
    <>
      <Style css={blurbCss} />
      <p className="spd-blurb">{_ctx.product.shortDescription}</p>
    </>
  )
}

export const shopDetailBlurbPuckComponent = { label: 'Product: Short description', fields: {}, defaultProps: {}, render: ShopDetailBlurb }
export const shopDetailBlurbPuckRscComponent = { ...shopDetailBlurbPuckComponent, render: ShopDetailBlurbRsc }

// ---------------------------------------------------------------------------
// Pre-order notice
// ---------------------------------------------------------------------------

const preorderCss = `.spd-preorder{margin-top:14px;background:var(--color-bg-subtle);border:1px solid var(--color-border);border-radius:8px;padding:10px 12px;font-size:14px;color:var(--color-fg)}`

export function ShopDetailPreorder(_props: PartProps) {
  return (
    <>
      <Style css={preorderCss} />
      <p className="spd-preorder" style={{ opacity: 0.6 }}>Pre-order notice (shows only for pre-order products).</p>
    </>
  )
}

export function ShopDetailPreorderRsc({ _ctx }: PartProps) {
  if (!_ctx || !_ctx.product.isPreOrder) return null
  const { product } = _ctx
  return (
    <>
      <Style css={preorderCss} />
      <p className="spd-preorder">
        Pre-order
        {product.preOrderDispatchDate
          ? ` - expected dispatch ${new Date(product.preOrderDispatchDate).toLocaleDateString('en-GB')}`
          : ''}
        {product.preOrderNote ? `. ${product.preOrderNote}` : ''}
      </p>
    </>
  )
}

export const shopDetailPreorderPuckComponent = { label: 'Product: Pre-order notice', fields: {}, defaultProps: {}, render: ShopDetailPreorder }
export const shopDetailPreorderPuckRscComponent = { ...shopDetailPreorderPuckComponent, render: ShopDetailPreorderRsc }

// ---------------------------------------------------------------------------
// Add to Cart (ANCHOR - not removable)
// ---------------------------------------------------------------------------

const buyCss = `
.spd-buy-row{display:flex;gap:14px;align-items:center;margin-top:22px;flex-wrap:wrap}
.spd-stepper{display:inline-flex;align-items:center;border:1px solid var(--color-border);border-radius:9999px;height:52px;overflow:hidden;background:var(--color-surface)}
.spd-stepper button{width:46px;height:52px;border:none;background:transparent;color:var(--color-primary);font-size:20px;font-weight:600;cursor:pointer;transition:background .12s ease}
/* !important beats the site theme's own !important button:hover fill so the stepper stays a subtle teal control */
.spd-stepper button:hover:not(:disabled){background:var(--color-bg-subtle) !important;color:var(--color-primary) !important}
.spd-stepper button:disabled{color:var(--color-border);cursor:not-allowed}
.spd-stepper input{width:52px;border:none;text-align:center;font:inherit;font-weight:600;font-size:16px;background:transparent;color:var(--color-fg)}
.spd-stepper input:focus{outline:none}
/* Add-to-basket intentionally inherits the site's primary button fill - matches the concept's CTA - so no background here */
.spd-add{flex:1;min-width:200px;height:52px;border:none;border-radius:9999px;font:inherit;font-weight:600;font-size:16px;cursor:pointer;transition:transform .06s ease}
.spd-add:active{transform:scale(.99)}
.spd-oos{margin-top:16px;color:var(--color-text-muted);font-weight:600}
`

type AddProps = { _ctx?: DetailPartContext; showStepper?: string }

export function ShopDetailAddToCart(props: AddProps) {
  const showStepper = props.showStepper !== 'no'
  return (
    <>
      <Style css={buyCss} />
      <div className="spd-buy-row" style={{ opacity: 0.6 }}>
        {showStepper && <div className="spd-stepper" style={{ width: 148 }} />}
        <div className="spd-add" style={{ maxWidth: 240, background: 'var(--color-border)' }} />
      </div>
    </>
  )
}

export function ShopDetailAddToCartRsc(props: AddProps) {
  const ctx = props._ctx
  if (!ctx) return null
  const { product, outOfStock } = ctx
  const showStepper = props.showStepper !== 'no'
  const label = product.isPreOrder ? 'Pre-order now' : 'Add to basket'
  // The layout already carries the provider's own buy block, so that one owns
  // the purchase and this part steps aside - see `covered`.
  if (ctx.slot?.covered.includes('PurchaseArea')) return null
  // A claimed product is bought as a chosen combination, and its availability
  // lives on that combination rather than on the parent row - so the provider
  // owns this whole area, our out-of-stock gate included. Gating on the parent
  // first would strand a product whose parent tracks no stock of its own.
  const SlotPurchase = ctx.slot?.PurchaseArea
  if (SlotPurchase) {
    return (
      <>
        <Style css={buyCss} />
        <SlotPurchase
          slug={product.slug}
          productId={product.id}
          currencySymbol={ctx.currencySymbol}
          layoutBlockTypes={ctx.layoutBlockTypes}
          showStepper={showStepper}
          label={label}
          classNames={{ row: 'spd-buy-row', stepper: 'spd-stepper', add: 'spd-add', outOfStock: 'spd-oos' }}
        />
      </>
    )
  }
  return (
    <>
      <Style css={buyCss} />
      {outOfStock ? (
        <p className="spd-oos">Out of stock</p>
      ) : (
        <AddToCartButton productId={product.id} label={label} showStepper={showStepper} />
      )}
    </>
  )
}

export const shopDetailAddToCartPuckComponent = {
  label: 'Product: Add to Cart [Anchor]',
  fields: {
    showStepper: { type: 'select' as const, label: 'Quantity stepper', options: [{ value: 'yes', label: 'Show stepper' }, { value: 'no', label: 'Button only' }] },
  },
  defaultProps: { showStepper: 'yes' },
  permissions: { delete: false },
  render: ShopDetailAddToCart,
}
export const shopDetailAddToCartPuckRscComponent = { ...shopDetailAddToCartPuckComponent, render: ShopDetailAddToCartRsc }

// ---------------------------------------------------------------------------
// Reassurance lines (absorbs the old reassure1..3 fields)
// ---------------------------------------------------------------------------

const reassureCss = `
.spd-reassure{margin-top:18px;display:flex;gap:20px;flex-wrap:wrap;font-size:13px;color:var(--color-text-muted)}
.spd-reassure span{display:inline-flex;gap:7px;align-items:center}
.spd-reassure svg{color:var(--color-primary);flex:none}
`

function ReassureCheck() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

type ReassureProps = { reassure1?: string; reassure2?: string; reassure3?: string }

function ReassureLines({ lines }: { lines: string[] }) {
  if (lines.length === 0) return null
  return (
    <>
      <Style css={reassureCss} />
      <div className="spd-reassure">
        {lines.map((r, i) => (
          <span key={i}>
            <ReassureCheck />
            {r}
          </span>
        ))}
      </div>
    </>
  )
}

export function ShopDetailReassure(props: ReassureProps) {
  const lines = [props.reassure1, props.reassure2, props.reassure3].filter((s): s is string => Boolean(s && s.trim()))
  return <ReassureLines lines={lines.length > 0 ? lines : ['Free delivery', '30-day returns', '2-year guarantee']} />
}

export function ShopDetailReassureRsc(props: ReassureProps) {
  const lines = [props.reassure1, props.reassure2, props.reassure3].filter((s): s is string => Boolean(s && s.trim()))
  return <ReassureLines lines={lines} />
}

export const shopDetailReassurePuckComponent = {
  label: 'Product: Reassurance lines',
  fields: {
    reassure1: { type: 'text' as const, label: 'Reassurance line 1' },
    reassure2: { type: 'text' as const, label: 'Reassurance line 2' },
    reassure3: { type: 'text' as const, label: 'Reassurance line 3' },
  },
  defaultProps: { reassure1: '', reassure2: '', reassure3: '' },
  render: ShopDetailReassure,
}
export const shopDetailReassurePuckRscComponent = { ...shopDetailReassurePuckComponent, render: ShopDetailReassureRsc }

// ---------------------------------------------------------------------------
// Tabs (description / specification / dimensions / downloads)
// ---------------------------------------------------------------------------

const tabsCss = `
.spd-tabs{border-top:1px solid var(--color-border);margin-top:40px}
.spd-tab-nav{display:flex;gap:6px;overflow-x:auto;padding:16px 0}
.spd-tab-btn{border:1px solid var(--color-border);background:var(--color-surface);border-radius:9999px;padding:9px 18px;font:inherit;font-size:14px;font-weight:600;color:var(--color-text-muted);cursor:pointer;white-space:nowrap;transition:background .12s ease,color .12s ease,border-color .12s ease}
/* !important on hover/active so the site theme's !important button fill can't turn tabs mustard */
.spd-tab-btn:hover{background:var(--color-surface) !important;border-color:var(--color-primary);color:var(--color-primary) !important}
.spd-tab-btn.on{background:var(--color-primary) !important;border-color:var(--color-primary);color:var(--color-on-primary) !important}
.spd-panel{padding:20px 0 8px;max-width:900px}
.spd-panel h3{font-family:var(--display-family,Georgia,serif);font-weight:600;font-size:24px;margin:0 0 14px;color:var(--color-fg)}
.spd-panel p{color:var(--color-text-muted);max-width:70ch;margin:0 0 14px;white-space:pre-wrap}
.spd-facts{width:100%;border-collapse:collapse;font-size:14px}
.spd-facts td{padding:11px 14px;border-bottom:1px solid var(--color-border);vertical-align:top}
.spd-facts td:first-child{color:var(--color-text-muted);width:38%}
.spd-facts td:last-child{color:var(--color-fg)}
.spd-dl{display:flex;align-items:center;gap:16px;border:1px solid var(--color-border);border-radius:10px;padding:16px 18px;color:var(--color-fg)}
.spd-dl .fico{width:42px;height:42px;border-radius:6px;background:var(--color-bg-subtle);color:var(--color-primary);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:600;flex:none}
.spd-dl b{font-size:15px;display:block}
.spd-dl small{font-size:12px;color:var(--color-text-muted)}
.spd-dl .get{margin-left:auto;color:var(--color-text-muted);font-weight:600;font-size:13px;white-space:nowrap}
`

const TYPE_LABEL: Record<ShpProduct['type'], string> = {
  PHYSICAL: 'Physical product',
  DIGITAL: 'Digital download',
  SERVICE: 'Service',
}

// Shop's own tabs, numbered so a tab contributed through
// `shop.product-detail-tabs` can be dropped among them rather than only after
// them. Spaced by tens for the obvious reason. See lib/detail-tabs.ts - a
// provider that names no order lands after this lot.
const TAB_ORDER = { desc: 10, spec: 20, dims: 30, downloads: 40 } as const

type OrderedTab = ProductTab & { order: number }

function FactsTable({ rows }: { rows: Array<[string, string]> }) {
  return (
    <table className="spd-facts">
      <tbody>
        {rows.map(([label, value]) => (
          <tr key={label}>
            <td>{label}</td>
            <td>{value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function ShopDetailTabs(_props: PartProps) {
  return (
    <>
      <Style css={tabsCss} />
      <div className="spd-tabs">
        <div className="spd-tab-nav">
          {['Description', 'Specification', 'Dimensions'].map((t, i) => (
            <span key={t} className={`spd-tab-btn${i === 0 ? ' on' : ''}`}>{t}</span>
          ))}
        </div>
      </div>
    </>
  )
}

export function ShopDetailTabsRsc({ _ctx }: PartProps) {
  if (!_ctx) return null
  const { product, digitalFile, detailTabs } = _ctx

  const weightStr = product.weight ? `${product.weight}${product.weightUnit ? ` ${product.weightUnit}` : ''}` : null
  const dimUnit = product.dimensionUnit ? ` ${product.dimensionUnit}` : ''
  const dimsCombined =
    product.dimensionL && product.dimensionW && product.dimensionH
      ? `${product.dimensionL} × ${product.dimensionW} × ${product.dimensionH}${dimUnit}`
      : null

  const specRows: Array<[string, string]> = []
  if (product.sku) specRows.push(['SKU', product.sku])
  specRows.push(['Type', TYPE_LABEL[product.type]])
  if (weightStr) specRows.push(['Weight', weightStr])
  if (dimsCombined) specRows.push(['Dimensions (L × W × H)', dimsCombined])

  const dimRows: Array<[string, string]> = []
  if (weightStr) dimRows.push(['Weight', weightStr])
  if (product.dimensionL) dimRows.push(['Length', `${product.dimensionL}${dimUnit}`])
  if (product.dimensionW) dimRows.push(['Width', `${product.dimensionW}${dimUnit}`])
  if (product.dimensionH) dimRows.push(['Height', `${product.dimensionH}${dimUnit}`])

  const own: OrderedTab[] = []
  if (product.description) {
    own.push({ id: 'desc', order: TAB_ORDER.desc, label: 'Description', content: <p>{product.description}</p> })
  }
  own.push({ id: 'spec', order: TAB_ORDER.spec, label: 'Specification', content: <FactsTable rows={specRows} /> })
  if (dimRows.length > 0) {
    own.push({ id: 'dims', order: TAB_ORDER.dims, label: 'Dimensions', content: <FactsTable rows={dimRows} /> })
  }
  if (digitalFile) {
    const ext = (digitalFile.filename.split('.').pop() ?? 'FILE').toUpperCase().slice(0, 4)
    const sizeMb = `${(digitalFile.size / 1048576).toFixed(1)}MB`
    own.push({
      id: 'downloads',
      order: TAB_ORDER.downloads,
      label: 'Downloads',
      content: (
        <div className="spd-dl">
          <span className="fico">{ext}</span>
          <span>
            <b>{digitalFile.filename}</b>
            <small>{sizeMb}</small>
          </span>
          <span className="get">Available after purchase</span>
        </div>
      ),
    })
  }

  // Tabs contributed by other modules, already loaded and ordered by
  // resolveShopDetailTabs (lib/detail-tabs.ts). Empty on a shop-only site, which
  // is why the sort below is the only trace of this on one.
  const contributed: OrderedTab[] = detailTabs.map((tab) => ({
    id: tab.id,
    order: tab.order,
    label: tab.label,
    content: <tab.Panel payload={tab.payload} />,
  }))

  // Shop's own first on a tie: sort is stable, and a contributed tab landing on
  // the same number as the description should not be what the shopper opens on.
  const tabs = [...own, ...contributed].sort((a, b) => a.order - b.order)

  if (tabs.length === 0) return null
  return (
    <>
      <Style css={tabsCss} />
      <ProductTabs tabs={tabs} />
    </>
  )
}

export const shopDetailTabsPuckComponent = { label: 'Product: Tabs (spec/dimensions/downloads)', fields: {}, defaultProps: {}, render: ShopDetailTabs }
export const shopDetailTabsPuckRscComponent = { ...shopDetailTabsPuckComponent, render: ShopDetailTabsRsc }
