// breakpoints-shared, not breakpoints: these preview components land in the page
// builder's client bundle, and ./breakpoints reaches prisma via lib/config/site.
import { DEFAULT_BREAKPOINTS, type Breakpoints } from '@/modules/shop/lib/breakpoints-shared'
import { formatMoney } from '@/modules/shop/lib/money'
import { ShopCardMedia } from '@/modules/shop/components/public/ShopCardMedia'
import { ShopCardFillBlurb } from '@/modules/shop/components/public/ShopCardFillBlurb'
import type { CardBadge, CardPartContext } from '@/modules/shop/components/puck/parts/part-context'

// Product Card part-blocks. These make up a Product Card layout (admin >
// Layouts > Shop > Product Card), which is then stamped once per product by
// every card surface (grid, related, featured, single). Each surface wraps a
// stamped card in `<a class="shop-card">` and emits shopCardCss once; the parts
// are flat children of that anchor. The three built-in looks (standard / image
// beside / overlay) are driven entirely by the Image part's own "display"
// option via :has() selectors - so they survive a re-save in the editor, with
// no variant class or root prop to lose. In the card layout editor there's no
// product and no anchor, so each part renders a labelled skeleton and emits the
// CSS itself. Class prefix `shop-card-`. Colours are tokens only.

// The carousel-arrow + overlay-slot styles for the ShopCardMedia island, pulled out
// on their own so a surface that reuses the island OUTSIDE a `.shop-card` (the bare
// category/collection tiles, whose own design is kept) can emit just these without
// dragging in the whole card look. `.shop-card` pulls them in through shopCardCss
// below, so there is one source of truth. No `.shop-card` selectors here - only the
// island's own classes - which is what makes it portable.
export const shopCardMediaCss = `
.shop-card-media{position:absolute;inset:0}
.shop-card-media-img{width:100%;height:100%;object-fit:cover;display:block}
.shop-card-nav-btn{position:absolute;top:50%;transform:translateY(-50%);z-index:2;display:flex;align-items:center;justify-content:center;width:34px;height:34px;padding:0;border-radius:50%;border:1px solid var(--color-border);background:var(--color-surface);color:var(--color-fg);cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,.18);opacity:0;transition:opacity .2s ease,background .2s ease}
.shop-card-nav-btn:hover,.shop-card-nav-btn:focus-visible{background:var(--color-bg-subtle)}
.shop-card-nav-btn:focus-visible{opacity:1;outline:2px solid var(--color-primary);outline-offset:2px}
.shop-card-nav-prev{left:8px}
.shop-card-nav-next{right:8px}
/* A touch device has no hover to reveal the arrows, so leave them showing there. */
@media (hover:none){.shop-card-nav-btn{opacity:.9}}
.shop-card-overlay{position:absolute;inset:0;z-index:4;pointer-events:none}
.shop-card-overlay > *{pointer-events:auto}
`

// Full card + grid stylesheet. The surface sets `--shop-cols` on `.shop-grid`;
// the card look follows from the Image part's display mode, so all three share
// one source of truth. `:has()` is used for the beside/overlay arrangements.
export function shopCardCss({ tabletBp, mobileBp }: Breakpoints): string {
  return `
.shop-grid{display:grid;grid-template-columns:repeat(var(--shop-cols,3),minmax(0,1fr));gap:24px;margin-top:8px}
.shop-scroller{display:flex;gap:20px;overflow-x:auto;margin-top:8px;padding-bottom:4px}
.shop-scroller .shop-card{min-width:240px;flex:none}
.shop-sec-head{display:flex;align-items:baseline;gap:16px;margin:8px 0 20px;flex-wrap:wrap}
.shop-sec-head h2{font-family:var(--display-family,Georgia,serif);font-weight:600;font-size:26px;margin:0;color:var(--color-fg);line-height:1.2}
.shop-sec-head span{font-size:13px;color:var(--color-text-muted)}
/* One knob for the whole text block. Every type size, gap and inset below is in
   em off this base, so a surface can shrink the card's wording as a unit without
   restating a dozen rules - that is what the two-up mobile grid does (scale .5).
   The picture, the badge and the card's own chrome stay put; only the words move. */
.shop-card{position:relative;display:flex;flex-direction:column;font-size:calc(16px * var(--shop-card-scale,1));background:var(--color-surface);border:1px solid var(--color-border);border-radius:12px;overflow:hidden;text-decoration:none;color:inherit;box-shadow:0 1px 3px rgba(0,0,0,.06);padding-bottom:1em;transition:box-shadow .25s ease,transform .25s ease}
.shop-card:hover{transform:translateY(-4px);box-shadow:0 8px 30px rgba(0,0,0,.10)}
/* Stretched navigation link. Covers the whole card (so tapping the picture or the
   text follows the product) but sits UNDER the carousel arrows and the 3D overlay
   (z-index), so those controls take their own taps. Rendered as a sibling of the
   card parts, not an ancestor - see card-template.tsx renderCards. */
.shop-card-link{position:absolute;inset:0;z-index:1;border-radius:inherit}
.shop-card-link:focus-visible{outline:2px solid var(--color-primary);outline-offset:-2px}
/* Square, always. This was a per-instance pick (square/portrait/landscape) whose
   only real effect was letting one shop's photos be three different shapes
   depending on which layout a page happened to use. The photo is object-fit:cover
   in a clipped box, so a non-square original crops to fit rather than distorting.
   Overlay (fill-mode) is exempt below - the image being the whole card is the
   design, not a shape. */
.shop-card-img{position:relative;aspect-ratio:1/1;background:var(--color-bg-subtle);overflow:hidden}
.shop-card-img img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .4s ease}
.shop-card:hover .shop-card-img img{transform:scale(1.03)}
/* Carousel arrows + overlay slot (the ShopCardMedia island). Shared rules live in
   shopCardMediaCss; the arrows stay hidden until the card is hovered (the same hover
   that swaps in the second photo), and are revealed here on card-hover. */
${shopCardMediaCss}
.shop-card:hover .shop-card-nav-btn{opacity:1}
/* !important: the editor sets position:relative inline on every part root (see
   dragRefOf). The badge stack and the fill image are the two that must position
   against the card instead, so they have to outrank it. No-op on the live page,
   where nothing sets an inline position. A product can earn several badges, so
   the stack is the positioned thing and the badges themselves sit in normal
   flow down the corner of the picture, widest-to-content each. */
.shop-card-badges{position:absolute !important;top:10px;left:10px;z-index:3;display:flex;flex-direction:column;align-items:flex-start;gap:4px;pointer-events:none;max-width:calc(100% - 20px)}
.shop-card-badge{display:inline-block;font-size:12px;font-weight:600;line-height:1;padding:5px 9px;border-radius:6px;pointer-events:none}
.shop-card-badge-new{background:var(--color-primary);color:var(--color-on-primary)}
.shop-card-badge-low{background:var(--color-warning-subtle);color:var(--color-warning);border:1px solid var(--color-warning-border)}
.shop-card-badge-trade{background:var(--color-fg);color:var(--color-bg)}
.shop-card-badge-muted{background:var(--color-surface);color:var(--color-text-muted);border:1px solid var(--color-border)}
/* Owner-defined badge (a tag with its badge switched on). Its colours are per
   tag, not per site, so there is no token to name here - the part sets
   --shop-tag-* inline per card and this rule reads them, falling back to the
   muted look for a tag whose colours were left blank. Dark mode is handled here
   rather than by picking a side at render time, because a card is server-
   rendered once for both themes. Same two dark selectors the design tokens use:
   the explicit toggle, then the OS preference where the toggle is untouched. */
.shop-card-badge-tag{background:var(--shop-tag-bg,var(--color-surface));color:var(--shop-tag-fg,var(--color-text-muted))}
[data-theme="dark"] .shop-card-badge-tag{background:var(--shop-tag-bg-dark,var(--shop-tag-bg,var(--color-surface)));color:var(--shop-tag-fg-dark,var(--shop-tag-fg,var(--color-text-muted)))}
@media(prefers-color-scheme:dark){:root:not([data-theme="light"]) .shop-card-badge-tag{background:var(--shop-tag-bg-dark,var(--shop-tag-bg,var(--color-surface)));color:var(--shop-tag-fg-dark,var(--shop-tag-fg,var(--color-text-muted)))}}
.shop-card-name{margin:.875em 0 0;padding:0 1em;font-size:1em;font-weight:600;color:var(--color-fg);line-height:1.3}
.shop-card-pricerow{display:flex;gap:.5em;align-items:baseline;margin-top:.5em;padding:0 1em}
.shop-card-price{font-size:1em;font-weight:600;color:var(--color-primary)}
.shop-card-compare{font-size:.8125em;color:var(--color-text-muted);text-decoration:line-through}
.shop-card-rrp{font-size:.75em;color:var(--color-text-muted)}
.shop-card-taxnote{font-size:.6875em;color:var(--color-text-muted)}
.shop-card-blurb{margin:.667em 0 0;padding:0 1.111em;font-size:.9em;color:var(--color-text-muted);line-height:1.4}
/* Blurb in "fill the spare space" mode. The wrapper is the flex item that soaks
   up whatever height the grid stretch gave this card beyond its own content:
   flex-basis 0 plus an out-of-flow child means it adds NOTHING to the card's
   intrinsic height (so the description can never make a card - or the row -
   taller), then grows into the slack the tallest neighbour created. The
   paragraph inside is measured by the ShopCardFillBlurb island, which sets
   -webkit-line-clamp to however many whole lines fit and lifts the visibility
   below; until then (and with scripts off) the text stays hidden, so nothing
   ever paints half-clipped. Scoped under .shop-card so the layout editor - which
   has no .shop-card ancestor - keeps the sample paragraph in flow and visible. */
.shop-card-blurb-fill{flex:1 1 0;min-height:0;position:relative;overflow:hidden}
.shop-card .shop-card-blurb-fill .shop-card-blurb{position:absolute;top:0;left:0;right:0;overflow:hidden;display:-webkit-box;-webkit-box-orient:vertical;visibility:hidden}
.shop-card-cta{margin-top:auto;padding:.923em 1.231em 0;display:inline-flex;align-items:center;gap:.308em;font-size:.8125em;font-weight:600;color:var(--color-primary)}
/* The arrow is an <svg> with px width/height attributes, which no stylesheet size
   is inherited into - size it here so it shrinks with the label rather than
   towering over it on the two-up mobile grid. */
.shop-card-cta svg{width:.923em;height:.923em;transition:transform .2s ease}
.shop-card:hover .shop-card-cta svg{transform:translateX(3px)}

/* Image beside text: image spans the left column, text stacks in the right. */
.shop-card:has(.shop-card-img.beside-mode){display:grid;grid-template-columns:40% 1fr;padding-bottom:0}
.shop-card:has(.shop-card-img.beside-mode) .shop-card-img.beside-mode{grid-column:1;grid-row:1 / -1;aspect-ratio:1/1;height:100%}
.shop-card:has(.shop-card-img.beside-mode) > :not(.shop-card-img){grid-column:2}
.shop-card:has(.shop-card-img.beside-mode) .shop-card-name{margin-top:1em}
.shop-card:has(.shop-card-img.beside-mode) .shop-card-cta{padding-bottom:1.231em}

/* Overlay: image fills the card, text floats over a surface-colour fade. */
.shop-card:has(.shop-card-img.fill-mode){aspect-ratio:3/4;padding-bottom:1em}
.shop-card-img.fill-mode{position:absolute !important;inset:0;aspect-ratio:auto;height:100%}
.shop-card-img.fill-mode .shop-card-scrim{position:absolute;left:0;right:0;bottom:0;height:60%;background:linear-gradient(transparent,var(--color-surface) 72%)}
/* The floated text sits above the picture, but pointer-events:none lets a tap fall
   through to the stretched link beneath it - otherwise, in this mode only, the text
   (z-index 2, above the link) would swallow the click and the card would not
   navigate. The text is labels, never interactive, so nothing is lost. */
.shop-card-img.fill-mode ~ *{position:relative;z-index:2;pointer-events:none}
.shop-card-img.fill-mode ~ .shop-card-name{margin-top:auto}

@media (max-width:${tabletBp}){.shop-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
/* Phones keep two products across rather than dropping to one - a single tile per
   row turns a category into an endless scroll and hides everything below the
   fold. The tiles are narrower, so the wording steps down with them
   (--shop-card-scale), and the gutter closes up to buy the pictures the room.
   Three-quarters, not half: half the width does not mean half the type, and at
   .5 the name came out at 8px - technically proportionate, practically a squint. */
@media (max-width:${mobileBp}){
.shop-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.shop-grid .shop-card{--shop-card-scale:.75}
}
`
}

// Every part below is declared `inline: true` and attaches `puck.dragRef` to its
// own root element. That is not cosmetic. Without it the editor wraps each part
// in a <div> of its own, which lands BETWEEN `.shop-card` and the part - and the
// card's whole design is the container arranging its direct children. Wrapped,
// the image is no longer a grid item (so `beside` never puts it in column one),
// `~` never sees a sibling, and the wrapper Puck gives `position: relative`
// becomes the containing block the `fill` image stretches to instead of the
// card. Every look collapsed to "image on top". Live has no such wrapper, so
// this is also what keeps the editor's markup identical to the storefront's.
type PuckPart = { puck?: { dragRef?: ((element: Element | null) => void) | null } }

// Puck also stamps `position: relative` inline onto that same element, which
// outranks any stylesheet rule - hence the two `!important`s in the CSS above,
// on the only parts that must position against the card rather than themselves.
function dragRefOf(props: PuckPart) {
  return props.puck?.dragRef ?? undefined
}

function Style({ css }: { css: string }) {
  return <style dangerouslySetInnerHTML={{ __html: css }} />
}

// Card parts only emit the stylesheet themselves in the editor (no _ctx); on
// the live page the surface has already emitted it once for the whole grid.
function EditorStyle({ ctx }: { ctx?: CardPartContext }) {
  return ctx ? null : <Style css={shopCardCss(DEFAULT_BREAKPOINTS)} />
}

const yesNo = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
]

// ---------------------------------------------------------------------------
// Image (carries the card's overall layout via its display mode)
// ---------------------------------------------------------------------------

type ImageProps = PuckPart & { _ctx?: CardPartContext; display?: string }

function imgClass({ display }: ImageProps): string {
  const mode = display === 'beside' ? ' beside-mode' : display === 'fill' ? ' fill-mode' : ''
  return `shop-card-img${mode}`
}

export function ShopCardImage(props: ImageProps) {
  const ctx = props._ctx
  const fill = props.display === 'fill'
  // The interactive carousel earns its client bundle only when there is something
  // to interact with: more than one picture, or an overlay to mount. A single
  // still image (the common product, and every card in the editor canvas where
  // there is no ctx at all) stays the plain <img> it always was.
  const interactive = !!ctx && (ctx.images.length > 1 || ctx.overlays.length > 0)
  return (
    <>
      <EditorStyle ctx={ctx} />
      <div className={imgClass(props)} ref={dragRefOf(props)}>
        {interactive ? (
          <ShopCardMedia images={ctx.images} overlays={ctx.overlays} productId={ctx.product.id} />
        ) : (
          ctx?.image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={ctx.image.url} alt={ctx.image.alt} />
          )
        )}
        {fill && <div className="shop-card-scrim" />}
      </div>
    </>
  )
}

export const shopCardImagePuckComponent = {
  label: 'Card: Image',
  inline: true,
  fields: {
    display: { type: 'select' as const, label: 'Card layout', options: [{ value: 'standard', label: 'Image on top' }, { value: 'beside', label: 'Image beside text' }, { value: 'fill', label: 'Image fills card (overlay)' }] },
  },
  defaultProps: { display: 'standard' },
  render: ShopCardImage,
}
export const shopCardImagePuckRscComponent = { ...shopCardImagePuckComponent, render: ShopCardImage }

// ---------------------------------------------------------------------------
// Badge
// ---------------------------------------------------------------------------

type CardPartProps = PuckPart & { _ctx?: CardPartContext }

type BadgeProps = CardPartProps & { showNew?: string; showLow?: string; showTrade?: string; showMuted?: string; showTag?: string }

// Which badge kinds this card prints. All on by default (the historical look);
// a shop that finds "Low stock" too pushy on browse pages switches that one off
// without losing "New". 'tag' is the owner's own badge, set on the tag itself
// under Shop > Tags.
function badgeShown(props: BadgeProps, variant: CardBadge['variant']): boolean {
  const toggle = { new: props.showNew, low: props.showLow, trade: props.showTrade, muted: props.showMuted, tag: props.showTag }[variant]
  return toggle !== 'no'
}

// A tag badge's colours ride in as custom properties rather than as background/
// color directly, so the stylesheet above can pick the light or dark one per
// theme. Already sanitised upstream (cssValue, in card-template); an unset
// colour is simply left off, which drops that side through to the fallback.
function tagColourVars(badge: CardBadge): React.CSSProperties | undefined {
  if (badge.variant !== 'tag' || !badge.colours) return undefined
  const { bg, bgDark, text, textDark } = badge.colours
  return {
    ...(bg ? { '--shop-tag-bg': bg } : {}),
    ...(bgDark ? { '--shop-tag-bg-dark': bgDark } : {}),
    ...(text ? { '--shop-tag-fg': text } : {}),
    ...(textDark ? { '--shop-tag-fg-dark': textDark } : {}),
  } as React.CSSProperties
}

export function ShopCardBadge(props: BadgeProps) {
  const _ctx = props._ctx
  // Every badge the product earned, not just the first: a product that is both
  // on sale and ex-display says both, as its own page already does. Order comes
  // from lib/card-template.tsx; each kind still answers to its own switch here.
  const earned = (_ctx?.badges ?? (_ctx?.badge ? [_ctx.badge] : [])).filter((b) => badgeShown(props, b.variant))
  // In the editor (no ctx) show a sample so the part is visible; live shows the
  // real badges, or nothing when the product has none (or their kinds are off).
  if (_ctx && earned.length === 0) return null
  const shown: CardBadge[] = _ctx ? earned : [{ label: 'New', variant: 'new' }]
  return (
    <>
      <EditorStyle ctx={_ctx} />
      <span className="shop-card-badges" ref={dragRefOf(props)}>
        {shown.map((badge, i) => (
          <span key={badge.slug ?? `${badge.variant}-${i}`} className={`shop-card-badge shop-card-badge-${badge.variant}`} style={tagColourVars(badge)}>{badge.label}</span>
        ))}
      </span>
    </>
  )
}

export const shopCardBadgePuckComponent = {
  label: 'Card: Badge',
  inline: true,
  fields: {
    showNew: { type: 'select' as const, label: 'Show "New" badges', options: yesNo },
    showLow: { type: 'select' as const, label: 'Show stock badges', options: yesNo },
    showTrade: { type: 'select' as const, label: 'Show "Trade price" badges', options: yesNo },
    showTag: { type: 'select' as const, label: 'Show your own tag badges', options: yesNo },
    showMuted: { type: 'select' as const, label: 'Show other badges', options: yesNo },
  },
  defaultProps: { showNew: 'yes', showLow: 'yes', showTrade: 'yes', showTag: 'yes', showMuted: 'yes' },
  render: ShopCardBadge,
}
export const shopCardBadgePuckRscComponent = { ...shopCardBadgePuckComponent, render: ShopCardBadge }

// ---------------------------------------------------------------------------
// Name
// ---------------------------------------------------------------------------

// Long names and blurbs can make one card in a row twice the height of its
// neighbours; clamping trims to N lines with an ellipsis. 'none' (the default,
// and every card saved before the option existed) adds no style at all.
const clampOptions = [
  { value: 'none', label: 'No limit' },
  { value: '1', label: '1 line' },
  { value: '2', label: '2 lines' },
  { value: '3', label: '3 lines' },
]

function clampStyle(lines?: string): React.CSSProperties | undefined {
  if (!lines || lines === 'none') return undefined
  const n = Number(lines)
  if (!Number.isFinite(n) || n < 1) return undefined
  return { display: '-webkit-box', WebkitLineClamp: n, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden' }
}

type NameProps = CardPartProps & { lines?: string }

export function ShopCardName(props: NameProps) {
  return (
    <>
      <EditorStyle ctx={props._ctx} />
      <h3 className="shop-card-name" style={clampStyle(props.lines)} ref={dragRefOf(props)}>{props._ctx?.product.name ?? 'Product name'}</h3>
    </>
  )
}

export const shopCardNamePuckComponent = {
  label: 'Card: Name',
  inline: true,
  fields: {
    lines: { type: 'select' as const, label: 'Longest a name may run', options: clampOptions },
  },
  defaultProps: { lines: 'none' },
  render: ShopCardName,
}
export const shopCardNamePuckRscComponent = { ...shopCardNamePuckComponent, render: ShopCardName }

// ---------------------------------------------------------------------------
// Price (price + compare-at)
// ---------------------------------------------------------------------------

type CardPriceProps = PuckPart & { _ctx?: CardPartContext; showCompare?: string; showRrp?: string }

export function ShopCardPrice(props: CardPriceProps) {
  const ctx = props._ctx
  const showCompare = props.showCompare !== 'no'
  const showRrp = props.showRrp !== 'no'
  const symbol = ctx?.currencySymbol ?? '£'
  // The editor canvas has no product, so fall back to a plausible figure rather
  // than rendering an empty row the author cannot see or style.
  const now = ctx?.prices.now ?? '0.00'
  const was = ctx ? ctx.prices.was : '0.00'
  const rrp = ctx && ctx.showRetailPrice ? ctx.prices.rrp : null
  // A product priced as a range (variations) shows its cheapest as "From £…" -
  // but only where the choices actually differ in price. All the same money and
  // it is a single price like any other, so the prefix goes. There is no single
  // "was" to strike or RRP to sit against either way, so those stand down; the
  // shopper sees the exact figures on the product page once they choose.
  const fromPrice = ctx?.fromPrice ?? null
  const fromVaries = ctx?.fromPriceVaries ?? false
  return (
    <>
      <EditorStyle ctx={ctx} />
      <div className="shop-card-pricerow" ref={dragRefOf(props)}>
        {/* A shop quoting by hand withholds every figure. Its stand-in wording
            goes in once, in place of the whole row of them - three "POA"s where
            a price, a struck-through was and an RRP would have been reads as a
            fault rather than a policy. */}
        {ctx?.commerce.hidePrices ? (
          <span className="shop-card-price">{ctx.commerce.hiddenPriceLabel}</span>
        ) : fromPrice != null ? (
          <span className="shop-card-price">{fromVaries ? 'From ' : ''}{formatMoney(fromPrice, symbol)}</span>
        ) : (
          <>
            <span className="shop-card-price">{formatMoney(now, symbol)}</span>
            {showCompare && was && (
              <span className="shop-card-compare">{formatMoney(was, symbol)}</span>
            )}
            {showRrp && rrp && (
              <span className="shop-card-rrp">RRP {formatMoney(rrp, symbol)}</span>
            )}
          </>
        )}
        {/* Says which side of tax the figure beside it sits on, where the shop
            has set the wording. The editor canvas has no context and so no
            note - there is no shop config to read there. */}
        {!ctx?.commerce.hidePrices && ctx?.priceSuffix && <span className="shop-card-taxnote">{ctx.priceSuffix}</span>}
      </div>
    </>
  )
}

export const shopCardPricePuckComponent = {
  label: 'Card: Price',
  inline: true,
  fields: {
    showCompare: { type: 'select' as const, label: 'Show "was" price', options: yesNo },
    showRrp: { type: 'select' as const, label: 'Show RRP', options: yesNo },
  },
  defaultProps: { showCompare: 'yes', showRrp: 'yes' },
  render: ShopCardPrice,
}
export const shopCardPricePuckRscComponent = { ...shopCardPricePuckComponent, render: ShopCardPrice }

// ---------------------------------------------------------------------------
// Blurb (short description)
// ---------------------------------------------------------------------------

type BlurbProps = CardPartProps & { lines?: string }

// The blurb's own line options: the Name part's fixed clamps, plus "fill". Fill
// is a blurb-only idea - a name that grew and shrank with its neighbours' cards
// would look broken, but a description reading "as much as fits" is the point.
const blurbLineOptions = [...clampOptions, { value: 'fill', label: 'Fill the spare space' }]

export function ShopCardBlurb(props: BlurbProps) {
  const _ctx = props._ctx
  // Live: hide when the product has no short description. Editor: show sample.
  if (_ctx && !_ctx.product.shortDescription) return null
  const text = _ctx?.product.shortDescription ?? 'A short line about this product.'
  // Fill mode: in a grid, cards in a row are all stretched to the tallest one's
  // height - this turns the shorter cards' dead space into as many whole lines
  // of description as fit, ellipsis at the cut, and never a line more (so the
  // description cannot lengthen any card). The wrapper here is the flex item
  // that absorbs the slack; the island inside measures it and sets the clamp.
  // See ShopCardFillBlurb and .shop-card-blurb-fill in shopCardCss.
  if (props.lines === 'fill') {
    return (
      <>
        <EditorStyle ctx={_ctx} />
        <div className="shop-card-blurb-fill" ref={dragRefOf(props)}>
          <ShopCardFillBlurb text={text} />
        </div>
      </>
    )
  }
  return (
    <>
      <EditorStyle ctx={_ctx} />
      <p className="shop-card-blurb" style={clampStyle(props.lines)} ref={dragRefOf(props)}>{text}</p>
    </>
  )
}

export const shopCardBlurbPuckComponent = {
  label: 'Card: Short description',
  inline: true,
  fields: {
    lines: { type: 'select' as const, label: 'Longest it may run', options: blurbLineOptions },
  },
  defaultProps: { lines: 'none' },
  render: ShopCardBlurb,
}
export const shopCardBlurbPuckRscComponent = { ...shopCardBlurbPuckComponent, render: ShopCardBlurb }

// ---------------------------------------------------------------------------
// Spec link / CTA (a labelled affordance - the whole card is the real link)
// ---------------------------------------------------------------------------

type CtaProps = PuckPart & { _ctx?: CardPartContext; label?: string }

function CtaArrow() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function ShopCardCta(props: CtaProps) {
  return (
    <>
      <EditorStyle ctx={props._ctx} />
      <span className="shop-card-cta" ref={dragRefOf(props)}>
        {props.label || 'Full spec'}
        <CtaArrow />
      </span>
    </>
  )
}

export const shopCardCtaPuckComponent = {
  label: 'Card: Spec link',
  inline: true,
  fields: {
    label: { type: 'text' as const, label: 'Link label' },
  },
  defaultProps: { label: 'Full spec' },
  render: ShopCardCta,
}
export const shopCardCtaPuckRscComponent = { ...shopCardCtaPuckComponent, render: ShopCardCta }
