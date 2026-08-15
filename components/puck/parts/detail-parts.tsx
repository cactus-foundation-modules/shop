import { AddToCartButton } from '@/modules/shop/components/public/AddToCartButton'
import { GalleryViewportFit } from '@/modules/shop/components/public/GalleryViewportFit'
import { ProductGallery, ProductSectionTabs, type ProductTab, type TabAction } from '@/modules/shop/components/public/ProductDetailIslands'
import { StickyStripHeight } from '@/modules/shop/components/public/StickyStripHeight'
// breakpoints-shared, not breakpoints: these preview components land in the page
// builder's client bundle, and ./breakpoints reaches prisma via lib/config/site.
import { DEFAULT_BREAKPOINTS, type Breakpoints } from '@/modules/shop/lib/breakpoints-shared'
import { formatMoney } from '@/modules/shop/lib/money'
// commerce-mode-shared, not commerce-mode: these parts land in the page
// builder's client bundle, and the resolver reaches prisma.
import { commerceModeButtonLabel } from '@/modules/shop/lib/commerce-mode-shared'
import type { ShpProduct } from '@/modules/shop/lib/types'
import type { CardBadge, DetailPartContext } from '@/modules/shop/components/puck/parts/part-context'
import { SiteColourField } from '@/lib/puck/SiteColourField'
import { ClearableNumberField } from '@/lib/puck/ClearableNumberField'
import { splitLightDark, composeLightDark } from '@/lib/puck/lightDark'
import type { CSSProperties, ReactNode } from 'react'

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
// `--spd-tabnav-h` joins them because the section tab strip (SectionTabs, set
// sticky) pins BELOW the header and is therefore in the column's way too: a
// gallery that only clears the header parks its own top - and the "Your choice"
// pill sitting in it - behind that strip. It is 0px whenever the strip isn't
// pinned, so a page without one is unaffected.
//
// The column sticks clear of both, and the stage fits the leftover
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
   min(N%,fit), not minmax(0,N%): a track is a ceiling AND a floor, and
   minmax(0,N%) grew to the full N% whatever the column inside it did with the
   room. Once the column started hugging the photo properly the two stopped
   agreeing, and the difference showed up as dead white space between the photo
   and the buy column - the whole 76px the thumbnail strip had just stopped
   wasting. min() makes the track the same number the column is about to be, so
   the cell ends where the photo ends and the 1fr beside it collects the rest,
   which is what "the buy column keeps the rest" was always meant to mean.
   Not fit-content(N%) either: the auto ratio's fit-content(60%) was already
   meant to be a ceiling and wasn't one, because the column below declares a
   definite width. A definite width is also the item's min-content contribution,
   and fit-content floors the track at that - so the track grew to whatever
   --spd-fit asked for and sailed past 60%. min() takes no contribution from its
   contents at all, and the column's own max-width:100% still clamps --spd-fit to
   the capped track on the N% side of the min. */
:root{--spd-gallery-fit:calc(100dvh - var(--spd-header-h,96px) - var(--spd-tabnav-h,0px) - 32px - var(--spd-thumbs-h,76px));--spd-gallery-fit-beside:calc(100dvh - var(--spd-header-h,96px) - var(--spd-tabnav-h,0px) - 32px)}
.puck-split:has(.spd-stage-col){grid-template-columns:min(${maxPct}%,var(--spd-gallery-fit)) 1fr !important}
.puck-split:has(> :last-child .spd-stage-col){grid-template-columns:1fr min(${maxPct}%,var(--spd-gallery-fit)) !important}
/* Beside keeps the old ceiling: its column is width:auto and stretches to fill
   the track, so the track was never leaving a gap to close, and its budget is
   the stage's rather than the column's - handing it a track sized by the
   stacked sum would short the photo by a strip it isn't stacking. */
.puck-split:has(.spd-stage-col.beside){grid-template-columns:minmax(0,${maxPct}%) 1fr !important}
.puck-split:has(> :last-child .spd-stage-col.beside){grid-template-columns:1fr minmax(0,${maxPct}%) !important}
/* Stacked, there is no row to take a share of, and core's own collapse rule is
   !important too - this selector outranks it, so it has to re-state it. All
   three beside/side variants are spelled out because :has() counts what's inside
   it: the .beside rules above outrank a bare :has(.spd-stage-col), so the
   collapse has to match them selector for selector or a phone keeps two
   columns. */
@media (max-width:${mobileBp}){.puck-split:has(.spd-stage-col),.puck-split:has(.spd-stage-col.beside),.puck-split:has(> :last-child .spd-stage-col.beside){grid-template-columns:1fr !important}}
.spd-stage-col{--spd-fit:var(--spd-gallery-fit);width:var(--spd-fit);max-width:100%;position:sticky;top:calc(var(--spd-header-h,96px) + var(--spd-tabnav-h,0px) + 16px);display:flex;flex-direction:column;gap:12px}
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
.spd-stage-col.beside{--spd-fit:var(--spd-gallery-fit-beside);width:auto;flex-direction:row-reverse;align-items:flex-start}
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

type GalleryProps = { _ctx?: DetailPartContext; thumbPosition?: string; maxWidthPct?: number; zoomOnHover?: boolean }

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
  // owns the job and this part steps aside entirely - see `coveredParts`.
  if (ctx.coveredParts.includes('Gallery')) return null
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
          zoom={props.zoomOnHover}
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
        <ProductGallery images={ctx.images} productName={ctx.product.name} thumbPosition={props.thumbPosition} zoom={props.zoomOnHover} extras={extras} />
      )}
    </>
  )
}

export const shopDetailGalleryPuckComponent = {
  label: 'Product: Gallery',
  fields: {
    thumbPosition: { type: 'select' as const, label: 'Thumbnails', options: [{ value: 'below', label: 'Below image' }, { value: 'beside', label: 'Beside image' }] },
    maxWidthPct: { type: 'number' as const, label: 'Max media width (% of row)', min: 10, max: 90 },
    zoomOnHover: { type: 'radio' as const, label: 'Zoom the image on hover', options: [{ value: true, label: 'On' }, { value: false, label: 'Off' }] },
  },
  defaultProps: { thumbPosition: 'below', maxWidthPct: DEFAULT_MAX_WIDTH_PCT, zoomOnHover: false },
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
.spd-badge-staff{background:var(--color-surface);color:var(--color-text-muted);border:1px dashed var(--color-border);font-variant-numeric:tabular-nums}
/* Owner-defined badge, set on a tag under Shop > Tags. Its colours are per tag
   rather than per site, so there is no token to name here: the part sets
   --spd-tag-* inline on each one and this reads them, falling back to the muted
   look where a colour was left blank. Dark mode is settled in CSS rather than by
   picking a side at render time, because the page is server-rendered once for
   both themes - the same two selectors the design tokens use. Mirrors
   .shop-card-badge-tag in card-parts.tsx; the two must keep agreeing. */
.spd-badge-tag{background:var(--spd-tag-bg,var(--color-surface));color:var(--spd-tag-fg,var(--color-text-muted))}
[data-theme="dark"] .spd-badge-tag{background:var(--spd-tag-bg-dark,var(--spd-tag-bg,var(--color-surface)));color:var(--spd-tag-fg-dark,var(--spd-tag-fg,var(--color-text-muted)))}
@media(prefers-color-scheme:dark){:root:not([data-theme="light"]) .spd-badge-tag{background:var(--spd-tag-bg-dark,var(--spd-tag-bg,var(--color-surface)));color:var(--spd-tag-fg-dark,var(--spd-tag-fg,var(--color-text-muted)))}}
`

type PartProps = { _ctx?: DetailPartContext }

type BadgesProps = { _ctx?: DetailPartContext; showNew?: string; showTrade?: string; showStock?: string; showTag?: string }

// A tag badge's colours ride in as custom properties rather than as background
// and colour directly, so the stylesheet above can pick the light or dark one
// per theme. Already sanitised upstream (cssValue, in lib/tag-badges); an unset
// colour is left off, dropping that side through to the fallback. Same shape as
// tagColourVars in card-parts.tsx.
function tagColourVars(badge: CardBadge): React.CSSProperties | undefined {
  if (!badge.colours) return undefined
  const { bg, bgDark, text, textDark } = badge.colours
  return {
    ...(bg ? { '--spd-tag-bg': bg } : {}),
    ...(bgDark ? { '--spd-tag-bg-dark': bgDark } : {}),
    ...(text ? { '--spd-tag-fg': text } : {}),
    ...(textDark ? { '--spd-tag-fg-dark': textDark } : {}),
  } as React.CSSProperties
}

export function ShopDetailBadges(props: BadgesProps) {
  return (
    <>
      <Style css={badgesCss} />
      <div className="spd-badges" style={{ opacity: 0.6 }}>
        {props.showTag !== 'no' && <span className="spd-badge spd-badge-tag" style={{ '--spd-tag-bg': 'var(--color-primary)', '--spd-tag-fg': 'var(--color-on-primary)' } as React.CSSProperties}>Sale</span>}
        {props.showNew !== 'no' && <span className="spd-badge spd-badge-new">New</span>}
        {props.showStock !== 'no' && <span className="spd-badge spd-badge-stock">In stock</span>}
      </div>
    </>
  )
}

export function ShopDetailBadgesRsc(props: BadgesProps) {
  const _ctx = props._ctx
  if (!_ctx) return null
  const { tagSlugs, tagBadges, outOfStock, lowStock, product } = _ctx
  const showNew = props.showNew !== 'no'
  const showTrade = props.showTrade !== 'no'
  const showStock = props.showStock !== 'no'
  const showTag = props.showTag !== 'no'
  // The owner's own badges lead, in the order their tags are listed in the
  // admin. Unlike the card, which has room for one, the page prints every badge
  // the product earned - "Sale" and "Ex-display" are both worth saying here.
  // A tag whose slug is 'new' or 'trade' and which carries its own badge would
  // otherwise print twice, once in the owner's colours and once in the built-in
  // ones; the two hardcoded badges below stand down where that has happened.
  const ownedSlugs = new Set(tagBadges.map((b) => b.slug))
  // The figure behind "In stock", for staff only. Not tied to the author's stock
  // badge switch: that switch decides what SHOPPERS are told, and an owner
  // checking the shelf needs the number on a layout that keeps its stock quiet
  // too. Withheld on a claimed product, where the parent row this reads is not
  // what governs buying - the provider owns availability there and shows the
  // chosen combination's own figure, so printing the parent's beside it would put
  // two unrelated numbers on one page.
  const staffStock = _ctx.showAdminStock && !_ctx.slot
  return (
    <>
      <Style css={badgesCss} />
      <div className="spd-badges">
        {showTag && tagBadges.map((badge) => (
          <span key={badge.slug ?? badge.label} className="spd-badge spd-badge-tag" style={tagColourVars(badge)}>{badge.label}</span>
        ))}
        {showNew && !ownedSlugs.has('new') && tagSlugs.includes('new') && <span className="spd-badge spd-badge-new">New</span>}
        {showTrade && !ownedSlugs.has('trade') && tagSlugs.includes('trade') && <span className="spd-badge spd-badge-trade">Trade price</span>}
        {showStock && (
          outOfStock ? (
            <span className="spd-badge spd-badge-out">Out of stock</span>
          ) : product.isPreOrder ? (
            <span className="spd-badge spd-badge-new">Pre-order</span>
          ) : lowStock ? (
            <span className="spd-badge spd-badge-low">Low stock</span>
          ) : (
            <span className="spd-badge spd-badge-stock">In stock</span>
          )
        )}
        {staffStock && (
          // "Not tracked" rather than nothing, so a blank is never read as a
          // broken figure: this product simply has stock tracking switched off
          // and is always buyable.
          <span className="spd-badge spd-badge-staff" title="Only staff signed in to this site can see this">
            {product.trackInventory ? `Stock: ${product.stockCount ?? 0}` : 'Stock: not tracked'}
          </span>
        )}
      </div>
    </>
  )
}

export const shopDetailBadgesPuckComponent = {
  label: 'Product: Badges',
  fields: {
    showNew: { type: 'select' as const, label: 'Show "New" badge', options: yesNo },
    showTrade: { type: 'select' as const, label: 'Show "Trade price" badge', options: yesNo },
    showTag: { type: 'select' as const, label: 'Show your own tag badges', options: yesNo },
    showStock: { type: 'select' as const, label: 'Show stock status badge', options: yesNo },
  },
  defaultProps: { showNew: 'yes', showTrade: 'yes', showTag: 'yes', showStock: 'yes' },
  render: ShopDetailBadges,
}
export const shopDetailBadgesPuckRscComponent = { ...shopDetailBadgesPuckComponent, render: ShopDetailBadgesRsc }

// ---------------------------------------------------------------------------
// Title
// ---------------------------------------------------------------------------

// scroll-margin-top so the Tabs strip's "Configure" action can land the shopper
// at the top of the configure area (the product name) without the site header
// or a pinned tab bar covering it - same resting line the sections use.
// The admin edit link inherits the heading entirely - same face, same weight,
// same colour - so a shopper's page and an admin's page read identically. The
// only tell is the dimmed pencil, which brightens and underlines on hover or
// keyboard focus. Colours are currentColor rather than a token so the link
// tracks whatever colour the heading itself has been given.
const titleCss = `.spd-title{font-family:var(--display-family,Georgia,serif);font-weight:600;font-size:34px;line-height:1.2;margin:6px 0;color:var(--color-fg);scroll-margin-top:calc(var(--spd-header-h,72px) + var(--spd-tabnav-h,0px) + 16px)}
.spd-title-edit{color:inherit;text-decoration:none}
.spd-title-edit:hover,.spd-title-edit:focus-visible{text-decoration:underline;text-decoration-thickness:1px;text-underline-offset:5px}
.spd-title-edit svg{width:.48em;height:.48em;margin-left:.28em;vertical-align:middle;opacity:.3;transition:opacity .15s ease}
.spd-title-edit:hover svg,.spd-title-edit:focus-visible svg{opacity:.75}`

type TitleProps = { _ctx?: DetailPartContext; size?: number; align?: string }

// Blank or non-numeric (the clearable field stores undefined for an emptied
// box) falls back to the long-standing 34px, clamped to a sane heading range.
const TITLE_SIZE_DEFAULT = 34
function titleSizePx(value: unknown): number | undefined {
  if (value === '' || value == null) return undefined
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return undefined
  return Math.min(72, Math.max(14, Math.round(n)))
}
const alignOptions = [
  { value: 'left', label: 'Left' },
  { value: 'center', label: 'Centre' },
  { value: 'right', label: 'Right' },
]
const textAlignStyle = (align?: string): CSSProperties | undefined =>
  align === 'center' || align === 'right' ? { textAlign: align } : undefined

export function ShopDetailTitle(props: TitleProps) {
  const align = props.align
  return (
    <>
      <Style css={titleCss} />
      <div
        style={{
          height: titleSizePx(props.size) ?? 30,
          width: '70%',
          background: 'var(--color-border)',
          borderRadius: 6,
          margin: align === 'center' ? '8px auto' : align === 'right' ? '8px 0 8px auto' : '8px 0',
          opacity: 0.6,
        }}
      />
    </>
  )
}

export function ShopDetailTitleRsc(props: TitleProps) {
  const _ctx = props._ctx
  if (!_ctx) return null
  const size = titleSizePx(props.size)
  const style: CSSProperties | undefined =
    size || textAlignStyle(props.align) ? { ...(size ? { fontSize: size } : null), ...textAlignStyle(props.align) } : undefined
  return (
    <>
      <Style css={titleCss} />
      {/* id="spd-top" is the Configure action's landing target - the top of the
          configure area, so the shopper sees the name and the option pickers
          together. */}
      <h1 id="spd-top" className="spd-title" style={style}>
        {_ctx.adminEditHref
          ? (
            // Only ever rendered for a signed-in admin who may edit products
            // (see lib/admin-edit.ts), so the admin URL stays off a shopper's
            // page. New tab, because the point is to fix a typo without losing
            // the storefront view being checked. The pencil is decorative - the
            // link's accessible name is the product name, and the title
            // attribute says where it goes.
            <a
              className="spd-title-edit"
              href={_ctx.adminEditHref}
              target="_blank"
              rel="noopener noreferrer"
              title="Edit this product (opens a new tab)"
            >
              {_ctx.product.name}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
              </svg>
            </a>
          )
          : _ctx.product.name}
      </h1>
    </>
  )
}

export const shopDetailTitlePuckComponent = {
  label: 'Product: Title',
  fields: {
    size: { type: 'custom' as const, label: 'Text size (px)', render: ClearableNumberField },
    align: { type: 'select' as const, label: 'Alignment', options: alignOptions },
  },
  defaultProps: { size: TITLE_SIZE_DEFAULT, align: 'left' },
  render: ShopDetailTitle,
}
export const shopDetailTitlePuckRscComponent = { ...shopDetailTitlePuckComponent, render: ShopDetailTitleRsc }

// ---------------------------------------------------------------------------
// SKU
// ---------------------------------------------------------------------------

const skuCss = `.spd-sku{font-size:13px;color:var(--color-text-muted)}
.spd-sku-staff{display:inline-flex;align-items:baseline;gap:8px;margin-top:5px;padding:3px 9px;border:1px dashed var(--color-border);border-radius:8px;background:var(--color-surface);color:var(--color-text-muted);font-size:12px;line-height:1.35;font-variant-numeric:tabular-nums}
.spd-sku-staff strong{font-weight:700}`

type SkuProps = { _ctx?: DetailPartContext; prefix?: string; align?: string; audience?: string }

// undefined (an old block saved before the field existed) keeps the
// long-standing "SKU"; an explicitly emptied box means "just the code".
const skuPrefix = (value: unknown): string => (typeof value === 'string' ? value.trim() : 'SKU')

// Who the product's own code is written for. Staff by default - a SKU is a
// buying reference, and a shop that wants its customers quoting codes at it can
// say so explicitly. Which is why the default is read off the ABSENCE of
// 'everyone' rather than the presence of 'staff': a block saved before this
// field existed carries no value at all, and those are exactly the pages this
// was asked for. The sale SKU below is never on this switch - a supplier's
// clearance code is staff-only whatever the author picks.
const skuAudienceOptions = [
  { label: 'Staff only', value: 'staff' },
  { label: 'Everyone', value: 'everyone' },
]
const skuIsPublic = (value: unknown): boolean => value === 'everyone'

export function ShopDetailSku(props: SkuProps) {
  return (
    <>
      <Style css={skuCss} />
      <div
        style={{
          height: 13,
          width: '35%',
          background: 'var(--color-border)',
          borderRadius: 4,
          opacity: 0.6,
          margin: props.align === 'center' ? '0 auto' : props.align === 'right' ? '0 0 0 auto' : undefined,
        }}
      />
    </>
  )
}

export function ShopDetailSkuRsc(props: SkuProps) {
  const _ctx = props._ctx
  if (!_ctx) return null
  const { product, showAdminCodes } = _ctx
  // The product's own code, staff-only unless the author has published it.
  // Staff see it either way - the switch decides who ELSE does.
  const isPublic = skuIsPublic(props.audience)
  const sku = product.sku && (isPublic || showAdminCodes) ? product.sku : null
  // The supplier's clearance code, for staff alone. Written out whenever the
  // product carries one, on sale or not: the owner reading their own page needs
  // to know which code this stock is currently ordered under.
  const saleSku = showAdminCodes ? product.saleSku : null
  if (!sku && !saleSku) return null
  const prefix = skuPrefix(props.prefix)
  const staffSku = Boolean(sku) && !isPublic
  return (
    <>
      <Style css={skuCss} />
      <div style={textAlignStyle(props.align)}>
        {sku && (
          <div className="spd-sku" title={staffSku ? 'Only staff signed in to this site can see this' : undefined}>
            {prefix ? `${prefix} ${sku}` : sku}
            {staffSku && ' · staff only'}
          </div>
        )}
        {saleSku && (
          // Labelled "staff only" on its face, because it sits in the middle of
          // a public page and an owner showing a customer their screen must not
          // have to wonder whether the customer can see it too.
          <div className="spd-sku-staff" title="Only staff signed in to this site can see this">
            <strong>Sale SKU: {saleSku}</strong>
            <span>staff only</span>
          </div>
        )}
      </div>
    </>
  )
}

export const shopDetailSkuPuckComponent = {
  label: 'Product: SKU',
  fields: {
    prefix: { type: 'text' as const, label: 'Label before the code' },
    audience: { type: 'select' as const, label: 'Show the code to', options: skuAudienceOptions },
    align: { type: 'select' as const, label: 'Alignment', options: alignOptions },
  },
  defaultProps: { prefix: 'SKU', audience: 'staff', align: 'left' },
  render: ShopDetailSku,
}
export const shopDetailSkuPuckRscComponent = { ...shopDetailSkuPuckComponent, render: ShopDetailSkuRsc }

// ---------------------------------------------------------------------------
// Price (now / was / save)
// ---------------------------------------------------------------------------

const priceCss = `
.spd-price-block{margin:18px 0 4px;display:flex;align-items:baseline;gap:12px;flex-wrap:wrap}
.spd-price-now{font-family:var(--display-family,Georgia,serif);font-weight:600;font-size:var(--spd-price-size,34px);color:var(--color-primary)}
.spd-price-was{font-size:15px;color:var(--color-text-muted);text-decoration:line-through}
.spd-save{background:var(--color-success-subtle);color:var(--color-success);font-size:12px;font-weight:600;border-radius:9999px;padding:4px 11px}
.spd-price-rrp{font-size:13px;color:var(--color-text-muted)}
.spd-price-taxnote{font-size:13px;color:var(--color-text-muted)}
`

type PriceProps = { _ctx?: DetailPartContext; showCompare?: string; showSave?: string; showRrp?: string; size?: number; align?: string }

// Same clearable-field contract as the title: blank falls back to the
// long-standing 34px, and the var is set on a wrapper so a slot provider's own
// .spd-price-now (which we can't reach inline) inherits it too.
const PRICE_SIZE_DEFAULT = 34
const priceSizeVars = (value: unknown): CSSProperties | undefined => {
  const size = titleSizePx(value)
  return size && size !== PRICE_SIZE_DEFAULT ? ({ '--spd-price-size': `${size}px` } as CSSProperties) : undefined
}

export function ShopDetailPrice(props: PriceProps) {
  return (
    <>
      <Style css={priceCss} />
      <div className="spd-price-block" style={{ opacity: 0.6, ...priceSizeVars(props.size), ...textAlignStyle(props.align) }}>
        <div style={{ height: titleSizePx(props.size) ?? 30, width: 110, background: 'var(--color-border)', borderRadius: 6 }} />
      </div>
    </>
  )
}

export function ShopDetailPriceRsc(props: PriceProps) {
  const ctx = props._ctx
  if (!ctx) return null
  const { product, currencySymbol, prices } = ctx
  const showCompare = props.showCompare !== 'no'
  const showSave = props.showSave !== 'no'
  const showRrp = props.showRrp !== 'no'
  const rrp = ctx.showRetailPrice && showRrp ? prices.rrp : null
  // The layout already carries the provider's own price block. Rendering our
  // static parent price beside it would put two different figures for the one
  // product on the page - which is exactly what an ordinary product with
  // nothing to choose used to show, one line above the other - so this part
  // steps aside whether or not the module claimed the product. See
  // `coveredParts`.
  if (ctx.coveredParts.includes('Price')) return null
  // A claimed product is priced by the chosen combination, so our static price
  // would be wrong the moment the shopper picks an option.
  const SlotPrice = ctx.slot?.Price
  if (SlotPrice) {
    return (
      <>
        <Style css={priceCss} />
        <div style={{ ...priceSizeVars(props.size), ...textAlignStyle(props.align) }}>
        <SlotPrice
          slug={product.slug}
          productId={product.id}
          currencySymbol={currencySymbol}
          layoutBlockTypes={ctx.layoutBlockTypes}
          basePrice={prices.now}
          compareAtPrice={showCompare ? prices.was : null}
          savePct={showSave ? prices.savePct : null}
          showCompare={showCompare}
          showSave={showSave}
          priceSuffix={ctx.priceSuffix}
          classNames={{ block: 'spd-price-block', now: 'spd-price-now', was: 'spd-price-was', save: 'spd-save' }}
        />
        </div>
      </>
    )
  }
  return (
    <>
      <Style css={priceCss} />
      <div className="spd-price-block" style={{ ...priceSizeVars(props.size), ...textAlignStyle(props.align) }}>
        {/* A shop quoting by hand withholds the figures: its stand-in wording
            goes in place of the price, and the was/save/RRP/tax-note trimmings
            all stand down with it - there is nothing left for them to describe. */}
        {ctx.commerce.hidePrices ? (
          <span className="spd-price-now">{ctx.commerce.hiddenPriceLabel}</span>
        ) : (
          <>
            <span className="spd-price-now">{formatMoney(prices.now, currencySymbol)}</span>
            {showCompare && prices.was && (
              <span className="spd-price-was">{formatMoney(prices.was, currencySymbol)}</span>
            )}
            {showSave && prices.savePct != null && <span className="spd-save">Save {prices.savePct}%</span>}
            {rrp && <span className="spd-price-rrp">RRP {formatMoney(rrp, currencySymbol)}</span>}
            {ctx.priceSuffix && <span className="spd-price-taxnote">{ctx.priceSuffix}</span>}
          </>
        )}
      </div>
    </>
  )
}

export const shopDetailPricePuckComponent = {
  label: 'Product: Price',
  fields: {
    showCompare: { type: 'select' as const, label: 'Show "was" price', options: yesNo },
    showSave: { type: 'select' as const, label: 'Show "Save X%" badge', options: yesNo },
    showRrp: { type: 'select' as const, label: 'Show RRP', options: yesNo },
    size: { type: 'custom' as const, label: 'Price size (px)', render: ClearableNumberField },
    // Title, SKU and the short description all offered alignment; the price did
    // not, so a centred product layout had one stubbornly left-aligned row in
    // the middle of it. 'left' is what it always rendered as.
    align: { type: 'select' as const, label: 'Alignment', options: alignOptions },
  },
  defaultProps: { showCompare: 'yes', showSave: 'yes', showRrp: 'yes', size: PRICE_SIZE_DEFAULT, align: 'left' },
  render: ShopDetailPrice,
}
export const shopDetailPricePuckRscComponent = { ...shopDetailPricePuckComponent, render: ShopDetailPriceRsc }

// ---------------------------------------------------------------------------
// Blurb (short description)
// ---------------------------------------------------------------------------

// Full column width by default: the old hardcoded 52ch reading cap left a
// stripe of dead space beside the text in any buy column wider than it, with
// no way to turn it off. Reading width is now the opt-in.
const blurbCss = `.spd-blurb{margin-top:14px;color:var(--color-text-muted)}
.spd-blurb.narrow{max-width:52ch}`

type BlurbProps = { _ctx?: DetailPartContext; width?: string; size?: number }

// Blank falls back to inheriting the site's body size, as it always has.
function blurbSizePx(value: unknown): number | undefined {
  if (value === '' || value == null) return undefined
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return undefined
  return Math.min(28, Math.max(11, Math.round(n)))
}

export function ShopDetailBlurb(props: BlurbProps) {
  return (
    <>
      <Style css={blurbCss} />
      <div className={`spd-blurb${props.width === 'reading' ? ' narrow' : ''}`} style={{ opacity: 0.6 }}>
        <div style={{ height: blurbSizePx(props.size) ?? 12, width: '90%', background: 'var(--color-border)', borderRadius: 4, marginBottom: 6 }} />
        <div style={{ height: blurbSizePx(props.size) ?? 12, width: '75%', background: 'var(--color-border)', borderRadius: 4 }} />
      </div>
    </>
  )
}

export function ShopDetailBlurbRsc(props: BlurbProps) {
  const _ctx = props._ctx
  if (!_ctx || !_ctx.product.shortDescription) return null
  const size = blurbSizePx(props.size)
  return (
    <>
      <Style css={blurbCss} />
      <p className={`spd-blurb${props.width === 'reading' ? ' narrow' : ''}`} style={size ? { fontSize: size } : undefined}>
        {_ctx.product.shortDescription}
      </p>
    </>
  )
}

export const shopDetailBlurbPuckComponent = {
  label: 'Product: Short description',
  fields: {
    width: {
      type: 'select' as const,
      label: 'Text width',
      options: [
        { value: 'full', label: 'Fill the column' },
        { value: 'reading', label: 'Reading width (about 52 characters)' },
      ],
    },
    size: { type: 'custom' as const, label: 'Text size (px)', render: ClearableNumberField },
  },
  // `size` is declared above and was missing here, so a freshly dropped block
  // had no value for it while every other part carried one. Left undefined
  // rather than given a number: the render already falls back to the inherited
  // body size, and inventing a pixel value here would restyle existing blocks.
  defaultProps: { width: 'full', size: undefined },
  render: ShopDetailBlurb,
}
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
/* The Tabs strip's "Configure" action jumps here; clear the site header (the
   strip itself is below this point on the page, so its height need not be in
   the offset). */
.spd-buy-anchor{scroll-margin-top:calc(var(--spd-header-h,72px) + 16px)}
`

type AddProps = { _ctx?: DetailPartContext; showStepper?: string; buttonLabel?: string }

export function ShopDetailAddToCart(props: AddProps) {
  const showStepper = props.showStepper !== 'no'
  return (
    <>
      <Style css={buyCss} />
      <div id="spd-buy" className="spd-buy-anchor">
        <div className="spd-buy-row" style={{ opacity: 0.6 }}>
          {showStepper && <div className="spd-stepper" style={{ width: 148 }} />}
          <div className="spd-add" style={{ maxWidth: 240, background: 'var(--color-border)' }} />
        </div>
      </div>
    </>
  )
}

export function ShopDetailAddToCartRsc(props: AddProps) {
  const ctx = props._ctx
  if (!ctx) return null
  const { product, outOfStock } = ctx
  const showStepper = props.showStepper !== 'no'
  // What the button says: shop's own wording, or the mode's ("Add to quote") on
  // a shop an add-on has switched over. Pre-order wins either way - "reserve one
  // of these" is a different promise from "buy one", and a quote-only shop makes
  // no promise about stock at all.
  // A block-level wording override sits between the two, but pre-order still
  // wins: "reserve one of these" is a different promise from whatever the
  // author wrote for the buy case.
  const override = typeof props.buttonLabel === 'string' ? props.buttonLabel.trim() : ''
  const label = product.isPreOrder
    ? 'Pre-order now'
    : override || commerceModeButtonLabel(ctx.commerce.addLabel, null, 'Add to basket')
  // The layout already carries the provider's own buy block, so that one owns
  // the purchase and this part steps aside - see `coveredParts`.
  if (ctx.coveredParts.includes('PurchaseArea')) return null
  // A claimed product is bought as a chosen combination, and its availability
  // lives on that combination rather than on the parent row - so the provider
  // owns this whole area, our out-of-stock gate included. Gating on the parent
  // first would strand a product whose parent tracks no stock of its own.
  const SlotPurchase = ctx.slot?.PurchaseArea
  if (SlotPurchase) {
    return (
      <>
        <Style css={buyCss} />
        <div id="spd-buy" className="spd-buy-anchor">
          <SlotPurchase
            slug={product.slug}
            productId={product.id}
            currencySymbol={ctx.currencySymbol}
            layoutBlockTypes={ctx.layoutBlockTypes}
            showStepper={showStepper}
            label={label}
            classNames={{ row: 'spd-buy-row', stepper: 'spd-stepper', add: 'spd-add', outOfStock: 'spd-oos' }}
          />
        </div>
      </>
    )
  }
  return (
    <>
      <Style css={buyCss} />
      <div id="spd-buy" className="spd-buy-anchor">
        {outOfStock ? (
          <p className="spd-oos">Out of stock</p>
        ) : (
          <AddToCartButton productId={product.id} label={label} showStepper={showStepper} />
        )}
      </div>
    </>
  )
}

export const shopDetailAddToCartPuckComponent = {
  label: 'Product: Add to Cart [Anchor]',
  fields: {
    showStepper: { type: 'select' as const, label: 'Quantity stepper', options: [{ value: 'yes', label: 'Show stepper' }, { value: 'no', label: 'Button only' }] },
    buttonLabel: { type: 'text' as const, label: 'Button label (blank = automatic)' },
  },
  defaultProps: { showStepper: 'yes', buttonLabel: '' },
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
// Tabs (nav strip only - jumps to the Product: Sections block)
// ---------------------------------------------------------------------------

// The Tabs block is a navigation strip: it shows Description / Specification /
// Dimensions / Downloads as pill links and jumps to the matching section the
// separate Product: Sections block renders. It carries no content of its own -
// pair it with a Sections block set to stacked or accordion.
//
// The divider (top rule + 40px gap) is the opt-out `.divider` class (default on)
// - drop it via the block's "Divider above" field when the nav leads the page,
// where the gap would otherwise look like a mistake. Content styling
// (h3/p/facts/downloads) is scoped to .spd-tabs, the wrapper the Sections block
// renders, so the stacked and accordion layouts inherit it.
// Below this width even shrunk-to-fit tabs can't keep their labels readable, so
// the strip switches to the admin-style edge-to-edge horizontal scroll. Fixed
// (not a design token): it's a "labels no longer fit" threshold, sized to catch
// the common portrait phones (375-430px), not a layout-collapse breakpoint.
const SMALL_PHONE_BP = '480px'

const tabsCss = ({ mobileBp }: Breakpoints) => `
.spd-tabs.divider{border-top:1px solid var(--color-border);margin-top:40px}
/* Same rule for the standalone Tabs nav, which carries no .spd-tabs wrapper. */
.spd-tab-nav.divider{border-top:1px solid var(--color-border);margin-top:40px}
.spd-tab-nav{display:flex;gap:6px;overflow-x:auto;padding:var(--spd-tabnav-pt,16px) 0 var(--spd-tabnav-pb,16px);scrollbar-width:none;-webkit-overflow-scrolling:touch}
/* Scrollbar hidden like the admin tab bar - the fades/arrows are the scroll cue. */
.spd-tab-nav::-webkit-scrollbar{display:none}
.spd-tab-nav.align-center{justify-content:center}
.spd-tab-nav.align-right{justify-content:flex-end}
/* Sticky pins the strip flush under the site header (its measured height is
   published as --spd-header-h by GalleryViewportFit; the fallback covers a page
   with no gallery). Pin flush, not header+8px: an offset leaves a transparent
   band above the pinned strip that page content scrolls through - the strip's
   own 16px top padding is the breathing room and its bg fills it. A solid
   page-bg fill stops the panel showing through as it scrolls under.
   The standalone Section links block has no shell wrapper, so it stays sticky on
   the nav itself; the Tabs island moves sticky up to .spd-tab-shell (below) so
   its fade/arrow overlay pins with the strip instead of scrolling away. */
.spd-tab-nav.sticky{position:sticky;top:var(--spd-header-h,72px);z-index:20;background:var(--color-page-bg,var(--color-bg))}
/* Shell wraps the Tabs island's scrolling nav so the admin-style edge fades and
   arrow buttons (rendered only when the strip actually overflows) can sit over
   it without scrolling away. relative for the absolute overlay; when the block
   is sticky the shell carries the pin so the overlay travels with the strip. */
/* The block's own background colour rides --spd-tabnav-bg (set inline by the
   block when the author picks one, dark arm and opacity already folded in). Left
   unset it stays transparent, so a strip with no chosen colour looks exactly as
   it did; sticky still falls back to the page background, which is what stops
   the panel showing through as it scrolls under. */
.spd-tab-shell{position:relative;background:var(--spd-tabnav-bg,transparent)}
.spd-tab-shell.sticky{position:sticky;top:var(--spd-header-h,72px);z-index:20;background:var(--spd-tabnav-bg,var(--color-page-bg,var(--color-bg)))}
/* Fade + arrow match the admin TabStrip: 2rem fade sitting inboard of a 1.5rem
   arrow, both filled with the page background so tabs dissolve into / out from
   under them. pointer-events:none on the fade so only the arrow takes the tap.
   These sit OVER the shell's own fill, so they use --spd-tabnav-fade - the same
   author colour already composited onto the page background - rather than
   --spd-tabnav-bg. A see-through colour painted twice would darken the two
   edges; the composited one matches what the middle of the strip looks like. */
.spd-tab-fade{position:absolute;top:0;bottom:0;width:2rem;pointer-events:none;z-index:1}
.spd-tab-fade.left{left:1.5rem;background:linear-gradient(to right,var(--spd-tabnav-fade,var(--color-page-bg,var(--color-bg))),transparent)}
.spd-tab-fade.right{right:1.5rem;background:linear-gradient(to left,var(--spd-tabnav-fade,var(--color-page-bg,var(--color-bg))),transparent)}
.spd-tab-arrow{position:absolute;top:0;bottom:0;width:1.5rem;display:flex;align-items:center;justify-content:center;border:none;padding:0;cursor:pointer;background:var(--spd-tabnav-fade,var(--color-page-bg,var(--color-bg)));color:var(--color-text-muted);font:inherit;font-size:1rem;z-index:2}
.spd-tab-arrow.left{left:0}
.spd-tab-arrow.right{right:0}
/* The tabs sit inside one pill-shaped track rather than each wearing its own
   outline - a segmented control, so the strip reads as one thing with a current
   position in it instead of a row of separate buttons. The track is the only child
   of the nav, which keeps the nav free to do the alignment and the sideways scroll
   exactly as before (the shell's fades and arrows measure the nav, not this).
   flex:none so it hugs its tabs; the phone tier below hands it the full width when
   the tabs have to share a row. */
.spd-tab-track{display:inline-flex;gap:4px;padding:4px;flex:none;border:1px solid var(--color-border);border-radius:9999px;background:var(--color-surface)}
/* Each tab is now bare text inside the track until it is the current one. The
   transparent border stays so a tab does not change size when it lights up. */
.spd-tab-btn{border:1px solid transparent;background:transparent;border-radius:9999px;padding:9px 18px;font:inherit;font-size:14px;font-weight:600;color:var(--color-text-muted);cursor:pointer;white-space:nowrap;transition:background .12s ease,color .12s ease,border-color .12s ease;text-decoration:none;display:inline-block}
/* !important on hover/active so the site theme's !important button fill can't turn tabs mustard */
.spd-tab-btn:hover{background:var(--color-bg-subtle) !important;border-color:transparent;color:var(--color-primary) !important}
.spd-tab-btn.on{background:var(--color-primary) !important;border-color:var(--color-primary);color:var(--color-on-primary) !important}
/* Action tab: the CTA that leads the strip - "Add to cart" (no options) or
   "Configure" (options) - filled like the primary button so it reads as an
   action, not another jump-link. It sits first in the row and flows with the
   strip's chosen alignment; no margin-auto forcing it to the far end. */
.spd-tab-btn.spd-tab-action{background:var(--color-primary) !important;border-color:var(--color-primary) !important;color:var(--color-on-primary) !important}
.spd-tab-btn.spd-tab-action:hover{background:var(--color-primary) !important;border-color:var(--color-primary) !important;color:var(--color-on-primary) !important;filter:brightness(.94)}
/* Stacked: every section on the page at once, a rule between each. Accordion:
   native <details> so it needs no client JS, and a jump-link from the Tabs nav
   auto-opens the closed section it targets. scroll-margin keeps a sticky header
   from covering the section a jump-link lands on. Sections fill their container
   (no reading-width cap) so a full-width slot doesn't leave a gap on the right. */
.spd-section{padding:20px 0 8px;border-top:1px solid var(--color-border);scroll-margin-top:calc(var(--spd-header-h,72px) + var(--spd-tabnav-h,0px) + 16px)}
.spd-section:first-child{border-top:none}
.spd-acc{border-top:1px solid var(--color-border);scroll-margin-top:calc(var(--spd-header-h,72px) + var(--spd-tabnav-h,0px) + 16px)}
.spd-acc summary{cursor:pointer;list-style:none;padding:16px 0;font-family:var(--display-family,Georgia,serif);font-weight:600;font-size:20px;color:var(--color-fg);display:flex;align-items:center;justify-content:space-between;gap:12px}
.spd-acc summary::-webkit-details-marker{display:none}
.spd-acc summary::after{content:'+';font-size:22px;line-height:1;color:var(--color-text-muted);flex:none}
.spd-acc[open] summary::after{content:'\\2212'}
.spd-acc-body{padding:0 0 16px}
.spd-tabs h3{font-family:var(--display-family,Georgia,serif);font-weight:600;font-size:24px;margin:0 0 14px;color:var(--color-fg)}
.spd-tabs p{color:var(--color-text-muted);margin:0 0 14px;white-space:pre-wrap}
/* ...but only for the bodies shop itself writes. A designed (Puck) description
   renders inside the same panel and brings its own typography, and the rule
   above outranks the shared .puck-richtext one on cascade order alone (equal
   specificity, later sheet) - which greyed out every rich-text paragraph and
   turned bullet text a shade lighter than the paragraphs beside it. Hand the
   rich text its own values back wherever it lands in a tab body. */
.spd-tabs .puck-richtext p{color:var(--color-fg-secondary);margin:0 0 1em;white-space:normal}
/* Standalone "Section links" block: the same nav strip, on its own, so it can
   sit above the image while the sections stay below. Links jump to the section
   anchors the Sections block renders in stacked/accordion mode. */
.spd-section-nav .spd-tab-nav{margin:0}
.spd-facts{width:100%;border-collapse:collapse;font-size:14px}
.spd-facts td{padding:11px 14px;border-bottom:1px solid var(--color-border);vertical-align:top}
.spd-facts td:first-child{color:var(--color-text-muted);width:38%}
.spd-facts td:last-child{color:var(--color-fg)}
.spd-dl{display:flex;align-items:center;gap:16px;border:1px solid var(--color-border);border-radius:10px;padding:16px 18px;color:var(--color-fg)}
.spd-dl .fico{width:42px;height:42px;border-radius:6px;background:var(--color-bg-subtle);color:var(--color-primary);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:600;flex:none}
.spd-dl b{font-size:15px;display:block}
.spd-dl small{font-size:12px;color:var(--color-text-muted)}
.spd-dl .get{margin-left:auto;color:var(--color-text-muted);font-weight:600;font-size:13px;white-space:nowrap}
/* Larger phones (down to the small-phone cutoff): the strip stops scrolling
   sideways and shares one row - the jump-link tabs flex to equal widths and
   shrink to fit. They shrink on BOTH axes: padding and type come down together
   (not just the sides) so the pills keep their proportion instead of squashing
   into wide, thin lozenges. No ellipsis - at this width the shrunk labels still
   fit whole and stay readable. The action CTA keeps its own width (flex:0 1 auto)
   so "Add to cart" stays legible while the links give way around it. Desktop is
   untouched - it has the room and keeps the natural, non-scrolling row. */
@media (max-width:${mobileBp}){
.spd-tab-nav{overflow-x:hidden;gap:4px}
/* The track spans the row here so the tabs inside it have a width to share. */
.spd-tab-track{width:100%;gap:2px}
.spd-tab-btn{flex:1 1 0;min-width:0;padding:6px 10px;font-size:12px;line-height:1.2;text-align:center}
.spd-tab-btn.spd-tab-action{flex:0 1 auto}
}
/* Small phones: the labels can no longer shrink to fit AND stay readable, so
   the strip gives up sharing the row and scrolls sideways instead - the same
   move the admin tab bars make, complete with the edge fades and arrow buttons
   the shell renders over it. It stays within the reading column (not full-bleed)
   so the arrows land on the strip's own edges exactly like the admin bar. Pills
   return to their natural size and never shrink (flex:0 0 auto), so every label
   reads in full. flex-start start-aligns them regardless of the block's chosen
   alignment - centre/right can't survive an overflowing scroll row. */
@media (max-width:${SMALL_PHONE_BP}){
.spd-tab-nav{overflow-x:auto;overflow-y:hidden;gap:8px;flex-wrap:nowrap;justify-content:flex-start}
.spd-tab-nav.align-center,.spd-tab-nav.align-right{justify-content:flex-start}
/* Back to hugging its tabs, so the track is wider than the nav and the nav is
   what scrolls - which is what the shell's fades and arrows are measuring. */
.spd-tab-track{width:auto;gap:4px}
.spd-tab-btn{flex:0 0 auto;min-width:auto;padding:9px 16px;font-size:13px}
.spd-tab-btn.spd-tab-action{flex:0 0 auto}
}
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

function FactsTable({ rows }: { rows: Array<[string, ReactNode]> }) {
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

// Anchor id a section carries in stacked/accordion mode, and the target the
// standalone "Section links" block jumps to. One prefix, one place, so the nav
// and the sections can never drift apart.
const SECTION_ID_PREFIX = 'spd-sec-'
const sectionAnchorId = (id: string) => `${SECTION_ID_PREFIX}${id}`

// The one source of truth for what sections a product has, in what order, with
// what labels. The Tabs block, the Sections block, and the standalone Section
// links block all build from this, so a link can never point at a section that
// isn't there. Carved out of the old ShopDetailTabsRsc body unchanged.
function buildDetailSections(ctx: DetailPartContext, opts?: { specAutoSort?: boolean }): OrderedTab[] {
  const { product, digitalFile, detailTabs, supplierLabel, slot, currencySymbol, layoutBlockTypes, descriptionBody, specOverride } = ctx

  const weightStr = product.weight ? `${product.weight}${product.weightUnit ? ` ${product.weightUnit}` : ''}` : null
  const dimUnit = product.dimensionUnit ? ` ${product.dimensionUnit}` : ''
  const dimsCombined =
    product.dimensionL && product.dimensionW && product.dimensionH
      ? `${product.dimensionL} × ${product.dimensionW} × ${product.dimensionH}${dimUnit}`
      : null

  const specRows: Array<[string, ReactNode]> = []
  if (product.sku) specRows.push(['SKU', product.sku])
  specRows.push(['Type', TYPE_LABEL[product.type]])
  if (supplierLabel && product.supplier) {
    const SupplierValue = slot?.SupplierValue
    specRows.push([
      supplierLabel,
      SupplierValue
        ? (
          <SupplierValue
            slug={product.slug}
            productId={product.id}
            currencySymbol={currencySymbol}
            layoutBlockTypes={layoutBlockTypes}
            fallback={product.supplier}
          />
        )
        : product.supplier,
    ])
  }
  if (weightStr) specRows.push(['Weight', weightStr])
  if (dimsCombined) specRows.push(['Dimensions (L × W × H)', dimsCombined])

  const dimRows: Array<[string, string]> = []
  if (weightStr) dimRows.push(['Weight', weightStr])
  if (product.dimensionL) dimRows.push(['Length', `${product.dimensionL}${dimUnit}`])
  if (product.dimensionW) dimRows.push(['Width', `${product.dimensionW}${dimUnit}`])
  if (product.dimensionH) dimRows.push(['Height', `${product.dimensionH}${dimUnit}`])

  const own: OrderedTab[] = []
  // A designed description wins when present; otherwise the plain-text paragraph.
  const desc = descriptionBody ?? (product.description ? <p>{product.description}</p> : null)
  if (desc) {
    own.push({ id: 'desc', order: TAB_ORDER.desc, label: 'Description', content: desc })
  }
  // A companion module may take over the whole Specification body for this
  // product (lib/detail-spec.ts) - its own headed groups in place of shop's
  // facts. Null on a shop-only site and for any product no provider claimed,
  // where shop's own facts table renders unchanged. The tab, its name and its
  // place in the strip stay shop's either way.
  const specContent = specOverride
    ? <specOverride.Panel payload={specOverride.payload} autoSort={opts?.specAutoSort} />
    : <FactsTable rows={specRows} />
  own.push({ id: 'spec', order: TAB_ORDER.spec, label: 'Specification', content: specContent })
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
  return [...own, ...contributed].sort((a, b) => a.order - b.order)
}

// `align`/`sticky` come off the block as 'center'/'right'/'yes'; keep the flag
// translation in one place so the Tabs block and the Section links block agree.
const navClassFor = (align?: string, sticky?: string, divider?: boolean) =>
  `spd-tab-nav${align === 'center' ? ' align-center' : align === 'right' ? ' align-right' : ''}${sticky === 'yes' ? ' sticky' : ''}${divider ? ' divider' : ''}`

type TabsProps = { _ctx?: DetailPartContext; align?: string; sticky?: string; divider?: string; padTop?: number; padBottom?: number; bgColour?: string; bgOpacity?: number }

// The strip's own vertical padding, adjustable per block. Blank or non-numeric
// (the clearable field stores undefined for an emptied box) falls back to the
// long-standing 16px; zero is a legitimate choice and kept.
const NAV_PAD_DEFAULT = 16
function navPadPx(value: unknown): number {
  if (value === '' || value == null) return NAV_PAD_DEFAULT
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) return NAV_PAD_DEFAULT
  return Math.min(64, Math.round(n))
}
const navPadStyle = (padTop: unknown, padBottom: unknown) =>
  ({ '--spd-tabnav-pt': `${navPadPx(padTop)}px`, '--spd-tabnav-pb': `${navPadPx(padBottom)}px` }) as CSSProperties

// The strip's own background colour. The stored value already carries an
// optional dark-mode arm as `light-dark(light, dark)` (lib/puck/lightDark.ts),
// so opacity is folded into each arm separately rather than wrapped round the
// whole thing - the same shape SectionBgColorField writes, and the one CSS is
// certain to resolve. rgba() can't wrap a `var(--color-N)` swatch, hence
// color-mix. Blank colour leaves both vars unset, so the CSS falls back to the
// long-standing transparent / page-background behaviour untouched.
const BG_OPACITY_DEFAULT = 100
function bgOpacityPct(value: unknown): number {
  if (value === '' || value == null) return BG_OPACITY_DEFAULT
  const n = Number(value)
  if (!Number.isFinite(n)) return BG_OPACITY_DEFAULT
  return Math.min(100, Math.max(0, Math.round(n)))
}
// `over` is what the translucent colour is composited onto: `transparent` for
// the strip's own fill (so the page shows through), the page background for the
// edge fades and arrows, which sit over that fill and must stay opaque.
const mixOpacity = (colour: string, pct: number, over: string) =>
  !colour || pct >= 100 ? colour : `color-mix(in srgb, ${colour} ${pct}%, ${over})`
function navBgVars(bgColour: unknown, bgOpacity: unknown): CSSProperties | undefined {
  const raw = typeof bgColour === 'string' ? bgColour.trim() : ''
  const pct = bgOpacityPct(bgOpacity)
  // No colour chosen: opacity still means something - it thins the strip's
  // default fill (the page background the sticky fallback paints), so a sticky
  // strip can go translucent without the author having to re-pick the page
  // colour by hand. The fades/arrows stay on the opaque page background - they
  // sit over the fill and a see-through fade painted twice darkens the edges.
  // At 100% nothing is set, keeping the long-standing transparent / sticky
  // fallback behaviour byte-identical.
  if (!raw) {
    if (pct >= 100) return undefined
    return {
      '--spd-tabnav-bg': `color-mix(in srgb, var(--color-page-bg, var(--color-bg)) ${pct}%, transparent)`,
      '--spd-tabnav-fade': 'var(--color-page-bg, var(--color-bg))',
    } as CSSProperties
  }
  const { light, dark } = splitLightDark(raw)
  const compose = (over: string) =>
    composeLightDark(mixOpacity(light, pct, over), dark ? mixOpacity(dark, pct, over) : '')
  return {
    '--spd-tabnav-bg': compose('transparent'),
    '--spd-tabnav-fade': compose('var(--color-page-bg, var(--color-bg))'),
  } as CSSProperties
}

// Editor preview: the nav strip only, no panel and no .spd-tabs wrapper - it
// mirrors the frontend ProductSectionTabs island so the markup and classes
// match (span here, <a> there, as the standalone Section links block also does).
export function ShopDetailTabs(props: TabsProps) {
  const divider = props.divider !== 'no'
  const labels = ['Description', 'Specification', 'Dimensions']
  // Mirror the storefront island's markup: the nav sits inside a .spd-tab-shell
  // (which carries sticky and, live, the fade/arrow overlay). The editor preview
  // is static, so no overlay renders - the wrapper only keeps the DOM in parity.
  return (
    <>
      <Style css={tabsCss(DEFAULT_BREAKPOINTS)} />
      <div className={`spd-tab-shell${props.sticky === 'yes' ? ' sticky' : ''}`} style={navBgVars(props.bgColour, props.bgOpacity)}>
        <nav className={navClassFor(props.align, undefined, divider)} style={navPadStyle(props.padTop, props.padBottom)} aria-label="Product information">
          {/* The segmented track the storefront island also renders, so the editor
              canvas shows the same frame round the same tabs. */}
          <div className="spd-tab-track">
            {/* The CTA leads the strip on the storefront (Add to cart, or Configure
                for a product with options); a static label here so the author sees
                it in the layout. No jump tab is pre-highlighted - the storefront
                opens on the action, not the first section. */}
            <span className="spd-tab-btn spd-tab-action">Add to basket</span>
            {labels.map((t) => (
              <span key={t} className="spd-tab-btn">{t}</span>
            ))}
          </div>
        </nav>
      </div>
    </>
  )
}

export function ShopDetailTabsRsc(props: TabsProps) {
  const ctx = props._ctx
  if (!ctx) return null
  const divider = props.divider !== 'no'
  const sections = buildDetailSections(ctx)
  if (sections.length === 0) return null

  // The nav points at the anchors the Product: Sections block renders; content
  // itself lives in that block, so this carries labels and targets only.
  const tabs = sections.map((s) => ({ label: s.label, anchor: sectionAnchorId(s.id) }))
  // The strip closes on a CTA. A product bought as a chosen combination (a
  // provider owns its purchase area) sends the shopper up to configure it; a
  // plain product goes straight into the basket. Out-of-stock plain products
  // get no add action - there is nothing to add. Both jump/act on the buy block
  // (id="spd-buy") the Add to Cart part renders.
  const hasOptions = Boolean(ctx.slot?.PurchaseArea) || Boolean(ctx.slot?.covered.includes('PurchaseArea'))
  const action: TabAction | undefined = hasOptions
    ? { kind: 'configure', anchor: 'spd-buy', label: 'Configure' }
    : ctx.outOfStock
      ? undefined
      : { kind: 'add', productId: ctx.product.id, label: 'Add to basket' }
  return (
    <>
      <Style css={tabsCss(ctx.bp)} />
      <ProductSectionTabs tabs={tabs} align={props.align} sticky={props.sticky === 'yes'} divider={divider} action={action} navStyle={navPadStyle(props.padTop, props.padBottom)} shellStyle={navBgVars(props.bgColour, props.bgOpacity)} />
    </>
  )
}

export const shopDetailTabsPuckComponent = {
  label: 'Product: Tabs',
  fields: {
    align: {
      type: 'select' as const,
      label: 'Tab alignment',
      options: [
        { value: 'left', label: 'Left' },
        { value: 'center', label: 'Centre' },
        { value: 'right', label: 'Right' },
      ],
    },
    sticky: {
      type: 'select' as const,
      label: 'Sticky tab bar',
      options: yesNo,
    },
    divider: {
      type: 'select' as const,
      label: 'Divider above',
      options: yesNo,
    },
    padTop: { type: 'custom' as const, label: 'Padding above tabs (px)', render: ClearableNumberField },
    padBottom: { type: 'custom' as const, label: 'Padding below tabs (px)', render: ClearableNumberField },
    // One field carries both arms: the swatch row sets the light colour and a
    // second row underneath sets the dark-mode one (blank = same as light).
    bgColour: {
      type: 'custom' as const,
      label: 'Background colour',
      render: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => <SiteColourField value={value} onChange={onChange} />,
    },
    // Custom clearable field: Puck's built-in number field turns a cleared box
    // into Number('') = 0, so the author could never get back to "default".
    // Clearing this one genuinely stores nothing and falls back to 100%.
    bgOpacity: { type: 'custom' as const, label: 'Background opacity (%)', render: ClearableNumberField },
  },
  defaultProps: { align: 'left', sticky: 'no', divider: 'yes', padTop: NAV_PAD_DEFAULT, padBottom: NAV_PAD_DEFAULT, bgColour: '', bgOpacity: BG_OPACITY_DEFAULT },
  render: ShopDetailTabs,
}
export const shopDetailTabsPuckRscComponent = { ...shopDetailTabsPuckComponent, render: ShopDetailTabsRsc }

// ---------------------------------------------------------------------------
// Sections (stacked / accordion - no tab bar, own "Section display" setting)
// ---------------------------------------------------------------------------

type SectionsProps = { _ctx?: DetailPartContext; display?: string; divider?: string; specSort?: string }

export function ShopDetailSections(props: SectionsProps) {
  const divider = props.divider !== 'no'
  const labels = ['Description', 'Specification', 'Dimensions']
  return (
    <>
      <Style css={tabsCss(DEFAULT_BREAKPOINTS)} />
      <div className={`spd-tabs${divider ? ' divider' : ''}`}>
        {labels.map((t) => (
          <div key={t} className="spd-section" style={{ opacity: 0.6 }}>
            <h3>{t}</h3>
          </div>
        ))}
      </div>
    </>
  )
}

export function ShopDetailSectionsRsc(props: SectionsProps) {
  const ctx = props._ctx
  if (!ctx) return null
  const display = props.display === 'accordion' ? 'accordion' : 'stacked'
  const divider = props.divider !== 'no'
  const sections = buildDetailSections(ctx, { specAutoSort: props.specSort === 'yes' })
  if (sections.length === 0) return null

  // Stacked and accordion are pure server markup - no tab state to hold, so no
  // client island. Each section carries its anchor id so the standalone Section
  // links block can jump to it (and a jump-link auto-opens a closed accordion).
  return (
    <>
      <Style css={tabsCss(ctx.bp)} />
      <div className={`spd-tabs${divider ? ' divider' : ''}`}>
        {display === 'accordion'
          ? sections.map((s, i) => (
              <details key={s.id} id={sectionAnchorId(s.id)} className="spd-acc" open={i === 0}>
                <summary>{s.label}</summary>
                <div className="spd-acc-body">{s.content}</div>
              </details>
            ))
          : sections.map((s) => (
              <section key={s.id} id={sectionAnchorId(s.id)} className="spd-section">
                <h3>{s.label}</h3>
                {s.content}
              </section>
            ))}
      </div>
    </>
  )
}

export const shopDetailSectionsPuckComponent = {
  label: 'Product: Sections',
  fields: {
    display: {
      type: 'select' as const,
      label: 'Section display',
      options: [
        { value: 'stacked', label: 'Stacked (all open)' },
        { value: 'accordion', label: 'Accordion (collapsible)' },
      ],
    },
    divider: {
      type: 'select' as const,
      label: 'Divider above',
      options: yesNo,
    },
    // A hint carried through the product-detail-spec seam (lib/detail-spec.ts):
    // a module that fills the Specification body with headed groups may re-order
    // them for the tightest column fill instead of the author's order. Does
    // nothing on shop's own facts table, which has no groups to sort.
    specSort: {
      type: 'select' as const,
      label: 'Auto-sort specification groups',
      options: yesNo,
    },
  },
  defaultProps: { display: 'stacked', divider: 'yes', specSort: 'no' },
  render: ShopDetailSections,
}
export const shopDetailSectionsPuckRscComponent = { ...shopDetailSectionsPuckComponent, render: ShopDetailSectionsRsc }

// ---------------------------------------------------------------------------
// Section links (standalone nav - jumps to the sections above/below)
// ---------------------------------------------------------------------------
// The nav strip on its own, so it can sit above the image while the sections
// stay below. It jumps to the anchors the Sections block renders in stacked or
// accordion mode; pair it with that block (the Tabs block keeps its own nav).

type SectionNavProps = { _ctx?: DetailPartContext; align?: string; sticky?: string }

export function ShopDetailSectionNav(props: SectionNavProps) {
  const labels = ['Description', 'Specification', 'Dimensions']
  return (
    <>
      <Style css={tabsCss(DEFAULT_BREAKPOINTS)} />
      <div className="spd-section-nav" style={{ opacity: 0.6 }}>
        {/* Same publisher as the frontend below, so the editor canvas sizes its
            sticky gallery against this strip exactly as the page does. */}
        <StickyStripHeight signal={`${props.sticky ?? 'no'}:${labels.length}`} />
        <div className={navClassFor(props.align, props.sticky)}>
          <div className="spd-tab-track">
            {labels.map((t) => (
              <span key={t} className="spd-tab-btn">{t}</span>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}

export function ShopDetailSectionNavRsc(props: SectionNavProps) {
  const ctx = props._ctx
  if (!ctx) return null
  const sections = buildDetailSections(ctx)
  if (sections.length === 0) return null
  return (
    <>
      <Style css={tabsCss(ctx.bp)} />
      <div className="spd-section-nav">
        {/* This block is server-only, so the one thing on the page that has to
            measure it - a strip pinned below the header is in the sticky
            gallery's way, and in every jump link's - needs a client island of
            its own here. The Tabs block mounts the same one. */}
        <StickyStripHeight signal={`${props.sticky ?? 'no'}:${sections.length}`} />
        <nav className={navClassFor(props.align, props.sticky)} aria-label="Product information">
          <div className="spd-tab-track">
            {sections.map((s) => (
              <a key={s.id} className="spd-tab-btn" href={`#${sectionAnchorId(s.id)}`}>{s.label}</a>
            ))}
          </div>
        </nav>
      </div>
    </>
  )
}

export const shopDetailSectionNavPuckComponent = {
  label: 'Product: Section links',
  fields: {
    align: {
      type: 'select' as const,
      label: 'Alignment',
      options: [
        { value: 'left', label: 'Left' },
        { value: 'center', label: 'Centre' },
        { value: 'right', label: 'Right' },
      ],
    },
    sticky: {
      type: 'select' as const,
      label: 'Sticky',
      options: yesNo,
    },
  },
  defaultProps: { align: 'left', sticky: 'no' },
  render: ShopDetailSectionNav,
}
export const shopDetailSectionNavPuckRscComponent = { ...shopDetailSectionNavPuckComponent, render: ShopDetailSectionNavRsc }
