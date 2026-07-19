import { DEFAULT_BREAKPOINTS, type Breakpoints } from '@/modules/shop/lib/breakpoints'
import { formatMoney } from '@/modules/shop/lib/money'
import type { CardPartContext } from '@/modules/shop/components/puck/parts/part-context'

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
.shop-card{position:relative;display:flex;flex-direction:column;background:var(--color-surface);border:1px solid var(--color-border);border-radius:12px;overflow:hidden;text-decoration:none;color:inherit;box-shadow:0 1px 3px rgba(0,0,0,.06);padding-bottom:16px;transition:box-shadow .25s ease,transform .25s ease}
.shop-card:hover{transform:translateY(-4px);box-shadow:0 8px 30px rgba(0,0,0,.10)}
/* Square, always. This was a per-instance pick (square/portrait/landscape) whose
   only real effect was letting one shop's photos be three different shapes
   depending on which layout a page happened to use. The photo is object-fit:cover
   in a clipped box, so a non-square original crops to fit rather than distorting.
   Overlay (fill-mode) is exempt below - the image being the whole card is the
   design, not a shape. */
.shop-card-img{position:relative;aspect-ratio:1/1;background:var(--color-bg-subtle);overflow:hidden}
.shop-card-img img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .4s ease}
.shop-card:hover .shop-card-img img{transform:scale(1.03)}
/* !important: the editor sets position:relative inline on every part root (see
   dragRefOf). The badge and the fill image are the two that must position
   against the card instead, so they have to outrank it. No-op on the live page,
   where nothing sets an inline position. */
.shop-card-badge{position:absolute !important;top:10px;left:10px;z-index:3;font-size:12px;font-weight:600;line-height:1;padding:5px 9px;border-radius:6px}
.shop-card-badge-new{background:var(--color-primary);color:var(--color-on-primary)}
.shop-card-badge-low{background:var(--color-warning-subtle);color:var(--color-warning);border:1px solid var(--color-warning-border)}
.shop-card-badge-trade{background:var(--color-fg);color:var(--color-bg)}
.shop-card-badge-muted{background:var(--color-surface);color:var(--color-text-muted);border:1px solid var(--color-border)}
.shop-card-name{margin:14px 0 0;padding:0 16px;font-size:16px;font-weight:600;color:var(--color-fg);line-height:1.3}
.shop-card-pricerow{display:flex;gap:8px;align-items:baseline;margin-top:8px;padding:0 16px}
.shop-card-price{font-size:16px;font-weight:600;color:var(--color-primary)}
.shop-card-compare{font-size:13px;color:var(--color-text-muted);text-decoration:line-through}
.shop-card-rrp{font-size:12px;color:var(--color-text-muted)}
.shop-card-blurb{margin:8px 0 0;padding:0 16px;font-size:12px;color:var(--color-text-muted);line-height:1.4}
.shop-card-cta{margin-top:auto;padding:12px 16px 0;display:inline-flex;align-items:center;gap:4px;font-size:13px;font-weight:600;color:var(--color-primary)}
.shop-card-cta svg{transition:transform .2s ease}
.shop-card:hover .shop-card-cta svg{transform:translateX(3px)}

/* Image beside text: image spans the left column, text stacks in the right. */
.shop-card:has(.shop-card-img.beside-mode){display:grid;grid-template-columns:40% 1fr;padding-bottom:0}
.shop-card:has(.shop-card-img.beside-mode) .shop-card-img.beside-mode{grid-column:1;grid-row:1 / -1;aspect-ratio:1/1;height:100%}
.shop-card:has(.shop-card-img.beside-mode) > :not(.shop-card-img){grid-column:2}
.shop-card:has(.shop-card-img.beside-mode) .shop-card-name{margin-top:16px}
.shop-card:has(.shop-card-img.beside-mode) .shop-card-cta{padding-bottom:16px}

/* Overlay: image fills the card, text floats over a surface-colour fade. */
.shop-card:has(.shop-card-img.fill-mode){aspect-ratio:3/4;padding-bottom:16px}
.shop-card-img.fill-mode{position:absolute !important;inset:0;aspect-ratio:auto;height:100%}
.shop-card-img.fill-mode .shop-card-scrim{position:absolute;left:0;right:0;bottom:0;height:60%;background:linear-gradient(transparent,var(--color-surface) 72%)}
.shop-card-img.fill-mode ~ *{position:relative;z-index:2}
.shop-card-img.fill-mode ~ .shop-card-name{margin-top:auto}

@media (max-width:${tabletBp}){.shop-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:${mobileBp}){.shop-grid{grid-template-columns:1fr}}
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
  return (
    <>
      <EditorStyle ctx={ctx} />
      <div className={imgClass(props)} ref={dragRefOf(props)}>
        {ctx?.image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={ctx.image.url} alt={ctx.image.alt} />
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

export function ShopCardBadge(props: CardPartProps) {
  const _ctx = props._ctx
  const badge = _ctx?.badge
  // In the editor (no ctx) show a sample so the part is visible; live shows the
  // real badge, or nothing when the product has none.
  if (_ctx && !badge) return null
  const shown = badge ?? { label: 'New', variant: 'new' as const }
  return (
    <>
      <EditorStyle ctx={_ctx} />
      <span className={`shop-card-badge shop-card-badge-${shown.variant}`} ref={dragRefOf(props)}>{shown.label}</span>
    </>
  )
}

export const shopCardBadgePuckComponent = { label: 'Card: Badge', inline: true, fields: {}, defaultProps: {}, render: ShopCardBadge }
export const shopCardBadgePuckRscComponent = { ...shopCardBadgePuckComponent, render: ShopCardBadge }

// ---------------------------------------------------------------------------
// Name
// ---------------------------------------------------------------------------

export function ShopCardName(props: CardPartProps) {
  return (
    <>
      <EditorStyle ctx={props._ctx} />
      <h3 className="shop-card-name" ref={dragRefOf(props)}>{props._ctx?.product.name ?? 'Product name'}</h3>
    </>
  )
}

export const shopCardNamePuckComponent = { label: 'Card: Name', inline: true, fields: {}, defaultProps: {}, render: ShopCardName }
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
  return (
    <>
      <EditorStyle ctx={ctx} />
      <div className="shop-card-pricerow" ref={dragRefOf(props)}>
        <span className="shop-card-price">{formatMoney(now, symbol)}</span>
        {showCompare && was && (
          <span className="shop-card-compare">{formatMoney(was, symbol)}</span>
        )}
        {showRrp && rrp && (
          <span className="shop-card-rrp">RRP {formatMoney(rrp, symbol)}</span>
        )}
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

export function ShopCardBlurb(props: CardPartProps) {
  const _ctx = props._ctx
  // Live: hide when the product has no short description. Editor: show sample.
  if (_ctx && !_ctx.product.shortDescription) return null
  const text = _ctx?.product.shortDescription ?? 'A short line about this product.'
  return (
    <>
      <EditorStyle ctx={_ctx} />
      <p className="shop-card-blurb" ref={dragRefOf(props)}>{text}</p>
    </>
  )
}

export const shopCardBlurbPuckComponent = { label: 'Card: Short description', inline: true, fields: {}, defaultProps: {}, render: ShopCardBlurb }
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
