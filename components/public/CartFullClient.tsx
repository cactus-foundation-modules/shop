'use client'

import { Fragment, useEffect, useRef, useState, type CSSProperties } from 'react'
import Link from 'next/link'
import { getCart, setLineQuantity, setLineMeta, subscribeCart } from '@/modules/shop/components/public/cart'
import { minOrderQuantity } from '@/modules/shop/lib/min-order'
import { postCartValidate, readValidatedCartCache, writeValidatedCartCache } from '@/modules/shop/components/public/validated-cache'
import { updateCheckoutState } from '@/modules/shop/components/public/checkout-state'
import type { LineMeta, LineMetaField } from '@/modules/shop/lib/types'
import type { CartLineControl, CartLineGroup, CartLineTitle } from '@/modules/shop/lib/line-meta'
import { effectiveGroup, groupMemberKeys, sortLinesByGroup } from '@/modules/shop/lib/cart-group'
import {
  commerceModeButtonLabel,
  commerceModeMoney,
  normaliseShopCommerceMode,
  SHOP_DEFAULT_COMMERCE_MODE,
} from '@/modules/shop/lib/commerce-mode-shared'
import { CART_LINE_CSS } from '@/modules/shop/components/public/cart-line-css'
import { CartStickyBar, CartUndoToast, QuantityStepper, RemoveCross, TickIcon } from '@/modules/shop/components/public/CartChrome'
import { useCartUndo, useOutOfView } from '@/modules/shop/components/public/use-cart-undo'
import { productHref, type ProductUrlStyle } from '@/modules/shop/lib/product-url'
import { fetchShopPublicConfig } from '@/modules/shop/lib/public-config-client'

// Full cart-display island. ONE render path, shared by the Puck editor preview
// (seeded with SAMPLE_LINES, no fetch, controls inert) and the live frontend
// (real localStorage cart, wired controls). Editor and frontend therefore emit
// identical markup - only the data source and handler wiring differ.
//
// The same render path also serves the two split blocks (Shop: Cart items and
// Shop: Cart totals) through `section`, so a page can put something of its own
// - a delivery arrivals panel, say - between the basket lines and the totals
// without either half being a second implementation of the cart. Both halves
// are independent islands reading the same localStorage cart, and
// postCartValidate single-flights, so the split costs no extra server work.

type ValidatedLine = {
  productId: string; name: string; slug: string; quantity: number; unitPrice: number
  lineSubtotal: number; available: boolean; availabilityReason: string | null
  isPreOrder: boolean; imageUrl: string | null
  // The minimum this line answers to, and whether it is pooled across the whole
  // listing. Absent on a response from a shop that predates them, which reads as
  // no minimum at all.
  minOrderQuantity?: number
  minOrderPooled?: boolean
  lineId?: string | null; lineMeta?: LineMeta | null
  control?: CartLineControl | null
  displayTitle?: CartLineTitle | null
  // Named slices of this line's money a resolver attributes elsewhere (e.g. a
  // delivery service), already counted inside lineSubtotal - see CartLineCharge.
  charges?: { label: string; amount: number }[] | null
  // Which basket group this line belongs to, when a resolver declared one - the
  // cart keeps the set together and indents the attachments (see lib/cart-group).
  group?: CartLineGroup | null
  // This line's tax rate as a fraction, quoted against the shop's default zone.
  taxRate?: number
}

// A personalised line is keyed by its lineId so two of the same product with
// different options are targeted/removed independently; plain lines fall back
// to productId exactly as before.
const lineKey = (l: Pick<ValidatedLine, 'productId' | 'lineId'>) => l.lineId ?? l.productId

// Width of the product column when the delivery picker is showing its summary
// card, in px. There the product column is the pinned one and the delivery
// column is the `1fr` that takes whatever is left - which is what makes the
// 16px the quantity stepper gave up when it was trimmed 15% (see .scl-qtybox in
// cart-line-css.ts) land on the delivery card rather than on the product name.
const SUMMARY_NAME_COL = 247

// All look/behaviour knobs. Every value is plain and serialisable, so this whole
// object crosses the RSC boundary from the server wrapper into the client island.
export type CartFullOptions = {
  layoutStyle?: string        // 'rows' | 'cards' | 'table'
  maxWidth?: number           // px; 0 = full width
  density?: string            // 'compact' | 'cosy' | 'roomy'
  dividers?: string           // 'line' | 'none' (rows layout)
  heading?: string
  headingSize?: string        // 'sm' | 'md' | 'lg'
  showImage?: string          // 'yes' | 'no'
  imageSize?: number
  imageRadius?: number
  showUnitPrice?: string
  showLinePrice?: string
  quantityControl?: string    // 'stepper' | 'input' | 'readonly'
  showRemove?: string
  removeStyle?: string        // 'text' | 'icon'
  showAvailability?: string
  showPreorder?: string
  showCoupon?: string
  couponPlaceholder?: string
  couponButtonLabel?: string
  couponLinkLabel?: string
  showItemCount?: string
  showSubtotal?: string
  subtotalLabel?: string
  taxLabel?: string          // 'VAT' by default; the row only appears when there is tax to show
  totalLabel?: string
  stickyBar?: string          // 'yes' | 'no' - bottom checkout bar once the totals scroll away
  undoRemove?: string         // 'yes' | 'no' - undo toast after a line is removed
  checkoutLabel?: string
  checkoutBg?: string         // CSS colour value (var(--color-N)) from SiteColourField
  checkoutText?: string
  checkoutFullWidth?: string
  checkoutRadius?: number
  emptyText?: string
  continueLabel?: string
  continueHref?: string
  accentColour?: string       // price emphasis; '' = inherit
  panelBg?: string            // cards/table background
  borderRadius?: number       // panel radius (cards)
}

// Visually-hidden but present for assistive tech (screen-reader-only).
const SR_ONLY: CSSProperties = { position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0 }

const SAMPLE_LINES: ValidatedLine[] = [
  // The first sample carries a split title and a delivery control so the editor
  // preview shows the name/variation lines and the delivery column in place.
  {
    productId: 'sample-1', name: 'Terracotta Plant Pot - Large / Matte', slug: 'terracotta-plant-pot',
    quantity: 2, unitPrice: 18, lineSubtotal: 36, available: true, availabilityReason: null, isPreOrder: false, imageUrl: null,
    displayTitle: { name: 'Terracotta Plant Pot', secondary: 'Large / Matte' },
    // A sample charge and tax rate so the editor preview shows the same
    // Subtotal / Delivery / VAT / Total block the live cart renders.
    charges: [{ label: 'Delivery', amount: 8 }], taxRate: 0.2,
    control: {
      key: 'shippingTier', label: 'Delivery', value: 'standard', optionsSelfLabelled: true, renderAs: 'summary',
      options: [
        {
          value: 'standard', label: 'Standard by Tuesday (included)', priceAdjust: 0, description: 'Left in your porch if you are out.',
          summary: { headline: 'Arrives by Tue 12 Aug', secondary: 'Standard', switchLabel: 'Standard by Tuesday', priceLabel: 'Free' },
        },
        {
          value: 'express', label: 'Express by Monday (+£4.95)', priceAdjust: 4.95,
          summary: { headline: 'Arrives by Mon 11 Aug', secondary: 'Express', switchLabel: 'Express by Monday', priceLabel: '+£4.95' },
        },
      ],
    },
  },
  // Deliberately offered no delivery control: it is the case that used to knock
  // the columns out of line, so the editor preview shows it holding its place.
  { productId: 'sample-2', name: 'Watering Can (Brass)', slug: 'watering-can-brass', quantity: 1, unitPrice: 42.5, lineSubtotal: 42.5, available: true, availabilityReason: null, isPreOrder: true, imageUrl: null, taxRate: 0.2 },
]

const yes = (v: string | undefined, dflt = true) => (v == null ? dflt : v !== 'no')

const DENSITY = {
  compact: { gap: '0.5rem', padY: '0.5rem' },
  cosy: { gap: '0.75rem', padY: '0.75rem' },
  roomy: { gap: '1.25rem', padY: '1.1rem' },
} as const
const HEADING_SIZE = { sm: '1.25rem', md: '1.75rem', lg: '2.25rem' } as const

// Which half of the cart this island renders. 'all' is the whole thing (the
// original Shop: Cart block); 'items' is the line list, its empty state and the
// undo toast; 'totals' is the coupon, the item count, the totals table, the
// checkout button and the sticky bar. Not a Puck field - the block chooses it.
export type CartSection = 'all' | 'items' | 'totals'

export function CartFullClient(props: CartFullOptions & { preview?: boolean; section?: CartSection }) {
  const { preview } = props
  const section = props.section ?? 'all'
  const withItems = section !== 'totals'
  const withFooter = section !== 'items'
  const [lines, setLines] = useState<ValidatedLine[]>(preview ? SAMPLE_LINES : [])
  const [currencySymbol, setCurrencySymbol] = useState('£')
  // Whether the prices ON SCREEN already include tax. It decides whether the tax
  // row is a share of the total or an addition to it, so the cart must not guess
  // at it - until the config lands the tax row simply isn't shown. This is the
  // DISPLAY mode, not the storage one: the validate route hands back lines
  // already converted to whichever side of tax the shop prints on, so a shop
  // storing net prices and quoting gross adds up here exactly like an inclusive
  // one. See lib/tax-display-shared.ts.
  const [taxMode, setTaxMode] = useState<'INCLUSIVE' | 'EXCLUSIVE'>('INCLUSIVE')
  // How this shop is transacted with (see lib/commerce-mode-shared.ts). Shop's
  // own basket-and-checkout until the config lands, so a slow config read never
  // flashes a quote-only shop's wording onto an ordinary cart or the reverse.
  const [commerce, setCommerce] = useState(SHOP_DEFAULT_COMMERCE_MODE)
  // Where product pages live for this shop, filled in by the config fetch
  // below. 'SHOP' is only the pre-fetch stand-in, not a guess about the shop.
  const [urlStyle, setUrlStyle] = useState<ProductUrlStyle>('SHOP')
  const [couponCode, setCouponCode] = useState('')
  const [couponMessage, setCouponMessage] = useState<string | null>(null)
  // Most baskets have no code to type, so the field stays behind a link until
  // somebody says they have one - and the link itself only appears once the
  // config call says there is a code out there worth typing. False until then:
  // a shop with no coupons should never flash one up mid-load.
  const [couponOpen, setCouponOpen] = useState(false)
  const [couponsAvailable, setCouponsAvailable] = useState(preview ?? false)
  const [hasLoaded, setHasLoaded] = useState(preview ?? false)
  // Whole-basket notes other modules contributed to this validate (a delivery
  // module's "everything by Fri 4 Sep"). Shop displays them, never composes them.
  const [notes, setNotes] = useState<string[]>(preview ? ['everything by Tue 12 Aug'] : [])

  // The currency symbol is fixed for the shop, so fetch it once rather than on
  // every cart re-validate - changing the delivery picker used to re-fetch it
  // alongside the validate, doubling the round-trips on every dropdown change.
  useEffect(() => {
    if (preview) return
    let cancelled = false
    fetchShopPublicConfig()
      .then((data) => {
        if (cancelled || !data) return
        setCurrencySymbol(data.currencySymbol)
        setCommerce(normaliseShopCommerceMode(data.commerce))
        // See CartDrawerClient: the product URL style decides whether a line
        // links to /shop/products/<slug> or the bare /<slug>.
        if (data.productUrlStyle === 'ROOT' || data.productUrlStyle === 'SHOP') setUrlStyle(data.productUrlStyle)
        setCouponsAvailable(data.couponsAvailable === true)
        const mode = data.priceDisplay?.displayTaxMode ?? data.taxMode
        if (mode === 'INCLUSIVE' || mode === 'EXCLUSIVE') setTaxMode(mode)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [preview])

  useEffect(() => {
    if (preview) return // editor: static sample, never fetch

    let cancelled = false
    // Monotonic guard: when the shopper flicks a delivery picker several times
    // quickly, each change re-validates; only the newest response is applied, so
    // an earlier slow one can't clobber a later choice.
    let seq = 0
    // Instant first paint: the first refresh bootstraps from the session's last
    // validated copy (when it covers the current cart exactly) instead of
    // holding the skeleton through the validate round-trip; the live response
    // then corrects anything stale in place.
    let bootstrapped = false
    async function refresh() {
      const cart = getCart()
      if (cart.length === 0) { if (!cancelled) { setLines([]); setNotes([]); setHasLoaded(true) } return }
      if (!bootstrapped) {
        bootstrapped = true
        const cached = readValidatedCartCache<ValidatedLine>(cart)
        if (cached && !cancelled) { setLines(cached); setHasLoaded(true) }
      }
      const mySeq = ++seq
      const data = await postCartValidate<ValidatedLine>(cart)
      if (cancelled || mySeq !== seq) return
      if (data) {
        setLines(data.lines)
        setNotes((data.notes ?? []).map((n) => n.text))
        writeValidatedCartCache(data.lines)
      }
      setHasLoaded(true)
    }
    refresh()
    const unsubscribe = subscribeCart(refresh)
    return () => { cancelled = true; unsubscribe() }
  }, [preview])

  // Sticky checkout bar: raised only once the cart's own totals and checkout
  // button have scrolled away, and never in the editor preview (a fixed bar
  // would float over the canvas rather than the page it belongs to).
  const footerRef = useRef<HTMLDivElement>(null)
  const stickyVisible = useOutOfView(footerRef, !preview && withFooter && yes(props.stickyBar) && hasLoaded && lines.length > 0)
  // Undo goes with the remove buttons, so the totals half never raises a toast.
  const { toast, removeLine, removeLines, undo } = useCartUndo(!preview && withItems && yes(props.undoRemove))
  // The line whose remove is waiting on the "its accessories too?" question - a
  // grouped main's removal asks before it acts, every other line removes at once.
  const [confirmingKey, setConfirmingKey] = useState<string | null>(null)

  async function applyCoupon() {
    if (preview || !couponCode) return
    const cart = getCart()
    const res = await fetch('/api/m/shop/public/checkout/apply-coupon', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lines: cart, couponCode }),
    })
    const data = await res.json()
    if (res.ok) {
      updateCheckoutState({ couponCode })
      setCouponMessage(`Discount applied: ${currencySymbol}${data.discountAmount.toFixed(2)}`)
    } else {
      setCouponMessage(data.error ?? 'Invalid coupon')
    }
  }

  // 0 still removes the line - that is what the plain number input's own
  // spinner does at the bottom of its range, and Remove by another name. Any
  // other figure is held at or above the line's minimum.
  const onQty = (id: string, q: number, min = 1) => {
    if (preview) return
    setLineQuantity(id, q <= 0 ? 0 : Math.max(min, q))
  }
  // Removal goes through the undo hook, which snapshots the line first so the
  // toast can put it back where it was. A main line with attachments still in
  // the basket asks the question first (see renderGroupConfirm) rather than
  // quietly leaving the accessories behind or quietly taking them too.
  const onRemove = (line: ValidatedLine) => {
    if (preview) return
    const key = lineKey(line)
    const members = groupMemberKeys(line, lines, lineKey)
    if (members.length > 1) { setConfirmingKey(key); return }
    removeLine(key, line.displayTitle?.name || line.name)
  }
  // The two answers to the question. "All" removes the set in one write and one
  // toast; "just this" removes only the main - its attachments degrade to flat
  // lines by themselves (see effectiveGroup).
  const onRemoveGroup = (line: ValidatedLine, all: boolean) => {
    if (preview) return
    setConfirmingKey(null)
    const key = lineKey(line)
    const name = line.displayTitle?.name || line.name
    if (!all) { removeLine(key, name); return }
    const members = groupMemberKeys(line, lines, lineKey)
    // No count in the wording: the collective label is the only word we have and
    // it is plural ("accessories"), so "and its accessories" reads right whether
    // one line or three went with it. The undo restores the exact set regardless.
    const collective = line.group?.collectiveLabel || 'attached items'
    removeLines(members, `Removed ${name} and its ${collective}.`)
  }
  // Writes a generic per-line control's choice into the line meta; the cart's
  // own subscribe/refresh then re-validates and re-prices with no extra wiring.
  // The chosen value is applied to local state at once so the <select> never
  // snaps back, and when the options carry their numeric priceAdjust the line
  // price and subtotal move in the same instant - the server re-validate then
  // merely confirms the figures rather than being what the shopper waits on.
  const onControl = (id: string, key: string, value: string) => {
    if (preview) return
    setLines((prev) => prev.map((l) => {
      if (lineKey(l) !== id || !l.control) return l
      const next = { ...l, control: { ...l.control, value } }
      const oldOpt = l.control.options.find((o) => o.value === l.control!.value)
      const newOpt = l.control.options.find((o) => o.value === value)
      if (typeof oldOpt?.priceAdjust === 'number' && typeof newOpt?.priceAdjust === 'number') {
        const delta = newOpt.priceAdjust - oldOpt.priceAdjust
        next.unitPrice = l.unitPrice + delta
        next.lineSubtotal = next.unitPrice * l.quantity
        // The charge this control feeds moves with the line price, or the
        // Subtotal/Delivery split would disagree with the Total for the moment
        // between the click and the server's confirmation. Only a single-charge
        // line can be split optimistically - with two charges there is no way to
        // know which one the control belongs to, so those wait for the validate.
        if (l.charges?.length === 1) {
          next.charges = [{ label: l.charges[0]!.label, amount: l.charges[0]!.amount + delta * l.quantity }]
        }
      }
      return next
    }))
    setLineMeta(id, { [key]: value })
  }

  // Resolved options
  const layoutStyle = props.layoutStyle ?? 'rows'
  const density = DENSITY[props.density === 'compact' || props.density === 'roomy' ? props.density : 'cosy']
  const headingSize = HEADING_SIZE[props.headingSize === 'sm' || props.headingSize === 'lg' ? props.headingSize : 'md']
  const showDivider = layoutStyle === 'rows' && (props.dividers ?? 'line') !== 'none'
  const showImage = yes(props.showImage)
  const imageSize = props.imageSize ?? 64
  const imageRadius = props.imageRadius ?? 6
  const showUnitPrice = yes(props.showUnitPrice, false)
  const showLinePrice = yes(props.showLinePrice)
  const quantityControl = props.quantityControl ?? 'stepper'
  const showRemove = yes(props.showRemove)
  const removeIcon = (props.removeStyle ?? 'icon') === 'icon'
  const showAvailability = yes(props.showAvailability)
  const showPreorder = yes(props.showPreorder)
  const showCoupon = yes(props.showCoupon)
  const showItemCount = yes(props.showItemCount)
  const showSubtotal = yes(props.showSubtotal)
  const accent = props.accentColour || 'inherit'
  const panelBg = props.panelBg || 'var(--color-surface)'
  const panelRadius = props.borderRadius ?? 12
  const maxWidth = props.maxWidth && props.maxWidth > 0 ? props.maxWidth : undefined

  // The basket's money, broken out. Every line's price already has its charges
  // inside it (a delivery service is priced into the line so the checkout can
  // never disagree with the cart), so the goods figure is the lot minus what the
  // resolvers attributed away - never a second sum that could drift from it.
  // Same-labelled charges from different lines merge into one row, in the order
  // the basket first mentions them.
  const lineTotal = lines.reduce((sum, l) => sum + l.lineSubtotal, 0)
  const chargeRows: { label: string; amount: number }[] = []
  for (const line of lines) {
    for (const charge of line.charges ?? []) {
      const row = chargeRows.find((r) => r.label === charge.label)
      if (row) row.amount += charge.amount
      else chargeRows.push({ label: charge.label, amount: charge.amount })
    }
  }
  const chargeTotal = chargeRows.reduce((sum, r) => sum + r.amount, 0)
  const subtotal = lineTotal - chargeTotal
  // Tax, per line at that line's own rate, exactly as the checkout works it out
  // - so the figure the shopper reads here is the one they meet at the end.
  // Inclusive pricing means the tax is already inside the line price and is
  // shown for information; exclusive means it is added on top.
  const taxAmount = lines.reduce((sum, l) => {
    const rate = l.taxRate ?? 0
    if (rate <= 0) return sum
    return sum + (taxMode === 'INCLUSIVE' ? l.lineSubtotal - l.lineSubtotal / (1 + rate) : l.lineSubtotal * rate)
  }, 0)
  const total = taxMode === 'INCLUSIVE' ? lineTotal : lineTotal + taxAmount
  const itemCount = lines.reduce((sum, l) => sum + l.quantity, 0)
  // Every figure on the cart goes through here, so a shop quoting by hand shows
  // its "POA" everywhere at once rather than in some rows and not others.
  const money = (n: number) => commerceModeMoney(commerce, `${currencySymbol}${n.toFixed(2)}`)
  // Where the cart leads and what the button says: shop's own checkout, or the
  // quote flow an add-on has put in its place.
  const checkoutLabel = commerceModeButtonLabel(commerce.cartCtaLabel, props.checkoutLabel, 'Proceed to checkout')
  const checkoutHref = commerce.cartCtaHref
  // A cart with a delivery column has two things to show per line, so the
  // product column is held narrow and the delivery column takes the rest. With
  // no delivery column anywhere, the product column keeps the whole row as before.
  const anyDelivery = lines.some((line) => line.control && line.control.options.length > 0)

  // Display order: each group's attachments directly beneath their main,
  // indented; everything else in basket order. Storage is untouched - see
  // lib/cart-group.ts for why the raw order cannot be trusted for display.
  const displayLines = sortLinesByGroup(lines)

  // While the client fetches the localStorage cart, show a shimmer skeleton
  // rather than a blank gap. The validate call folds every cart-line resolver
  // (delivery estimates, personalisation) so it can take a moment; a blank made
  // shoppers think the cart - and its delivery picker - had simply failed to
  // load. Live path only; the editor preview seeds hasLoaded=true.
  if (!hasLoaded) {
    return (
      <div style={{ display: 'grid', gap: density.gap, maxWidth, width: '100%' }} aria-busy="true" aria-label="Loading your basket">
        {withItems && [0, 1].map((i) => (
          <div key={i} style={{ display: 'flex', gap: '1rem', alignItems: 'center', paddingBottom: density.padY, borderBottom: '1px solid var(--color-border)' }}>
            {showImage && <div className="skeleton" style={{ width: imageSize, height: imageSize, borderRadius: imageRadius, flexShrink: 0 }} />}
            <div style={{ flex: 1, display: 'grid', gap: '0.4rem' }}>
              <div className="skeleton" style={{ height: 14, width: '65%' }} />
              <div className="skeleton" style={{ height: 12, width: '35%' }} />
            </div>
            <div className="skeleton" style={{ height: 14, width: 60 }} />
          </div>
        ))}
        {withFooter && <div className="skeleton" style={{ height: 44, width: '100%', borderRadius: props.checkoutRadius ?? 8 }} />}
      </div>
    )
  }

  // Empty cart (live only - preview always seeds samples). The undo toast is
  // rendered here too: removing the last line empties the cart, and that is
  // precisely the moment a shopper is most likely to want it back.
  if (lines.length === 0) {
    // The "empty basket" line belongs to the lines. On a split cart page the
    // totals half simply steps aside, rather than repeating the message the
    // items half already shows - or offering a checkout button with nothing
    // behind it.
    if (!withItems) return null
    return (
      <div style={{ maxWidth, color: 'var(--color-text-muted)' }}>
        <style dangerouslySetInnerHTML={{ __html: CART_LINE_CSS }} />
        <p style={{ margin: 0 }}>
          {props.emptyText || 'Your basket is empty.'}{' '}
          <Link href={props.continueHref || '/shop'}>{props.continueLabel || 'Continue shopping'}</Link>.
        </p>
        {toast && <CartUndoToast message={toast.message} leaving={toast.leaving} bottom={28} onUndo={undo} />}
      </div>
    )
  }

  function renderThumb(line: ValidatedLine) {
    if (!showImage) return null
    if (line.imageUrl) {
      // eslint-disable-next-line @next/next/no-img-element
      return <img className="scl-thumb" src={line.imageUrl} alt="" style={{ width: imageSize, height: imageSize, objectFit: 'cover', borderRadius: imageRadius, flexShrink: 0 }} />
    }
    return <div className="scl-thumb" aria-hidden style={{ width: imageSize, height: imageSize, borderRadius: imageRadius, background: 'var(--color-bg-subtle)', flexShrink: 0 }} />
  }

  // An attachment line's group for DISPLAY - null when its main is gone from
  // the basket, so a half-removed group renders flat rather than indented under
  // a heading that is not there.
  const displayGroup = (line: ValidatedLine) => {
    const group = effectiveGroup(line, lines)
    return group && group.role === 'attachment' ? group : null
  }

  // Name line, plus - when a resolver split the line's title (a variant, say) -
  // the chosen options on their own muted line beneath it, so the product name
  // and the variation no longer share one line. An attachment line leads with
  // its group caption ("Accessory for Impulse Desk") behind a connector glyph,
  // and indents by its chain depth - inside the name cell only, so the shared
  // column tracks stay aligned across every line.
  function renderName(line: ValidatedLine) {
    const style = { color: 'inherit', textDecoration: 'none', fontWeight: 600 } as const
    const title = line.displayTitle?.name || line.name
    const secondary = line.displayTitle?.secondary
    const attachment = displayGroup(line)
    const indent = attachment ? Math.max(0, (attachment.depth ?? 1) - 1) * 0.875 : 0
    const body = (
      <>
        {attachment?.caption && (
          <p className="scl-att-cap" style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', margin: '0 0 0.125rem' }}>
            <span aria-hidden="true">↳ </span>{attachment.caption}
          </p>
        )}
        {preview
          ? <span style={style}>{title}</span>
          : <a href={productHref(line.slug, urlStyle)} style={style}>{title}</a>}
        {secondary && (
          <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', margin: '0.25rem 0 0' }}>{secondary}</p>
        )}
      </>
    )
    if (!attachment) return body
    return (
      <div className="scl-att" style={{ paddingLeft: `${0.875 + indent}rem` }}>
        {body}
      </div>
    )
  }

  // True when the display line AFTER this one is an attachment of this line's
  // own group - the two are halves of one set, so the divider (and the visual
  // full stop it draws) stays out from between them.
  function groupJoinsNext(line: ValidatedLine, displayLines: ValidatedLine[], index: number): boolean {
    const next = displayLines[index + 1]
    if (!next) return false
    const nextGroup = effectiveGroup(next, lines)
    if (!nextGroup || nextGroup.role !== 'attachment') return false
    const own = effectiveGroup(line, lines)
    return !!own && own.key === nextGroup.key
  }

  // The remove-together question, rendered full-width directly under the main
  // line it belongs to. Wording comes from the group's own collective label so
  // shop never invents the word for what the attachments are.
  function renderGroupConfirm(line: ValidatedLine) {
    if (preview || confirmingKey !== lineKey(line)) return null
    const collective = line.group?.collectiveLabel || 'attached items'
    return (
      <div
        className="scl-grpconfirm"
        role="group"
        aria-label={`Remove its ${collective} too?`}
        style={{
          gridColumn: '1 / -1', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem',
          padding: '0.5rem 0.75rem', margin: '0.375rem 0 0', borderRadius: 8,
          background: 'var(--color-bg-subtle)', border: '1px solid var(--color-border)', fontSize: '0.8125rem',
        }}
      >
        <span>Remove its {collective} too?</span>
        <button type="button" onClick={() => onRemoveGroup(line, true)} style={{ background: 'var(--color-primary)', color: 'var(--color-on-primary)', border: 'none', borderRadius: 6, padding: '0.3rem 0.75rem', cursor: 'pointer', fontSize: '0.8125rem', fontWeight: 600 }}>
          Yes, remove everything
        </button>
        <button type="button" onClick={() => onRemoveGroup(line, false)} style={{ background: 'var(--color-surface)', color: 'var(--color-text)', border: '1px solid var(--color-border)', borderRadius: 6, padding: '0.3rem 0.75rem', cursor: 'pointer', fontSize: '0.8125rem' }}>
          No, keep them
        </button>
        <button type="button" aria-label="Cancel removing" onClick={() => setConfirmingKey(null)} style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', fontSize: '0.8125rem' }}>
          Cancel
        </button>
      </div>
    )
  }

  function renderMeta(line: ValidatedLine) {
    return (
      <>
        {showAvailability && !line.available && (
          <p style={{ color: 'var(--color-danger)', fontSize: '0.8125rem', margin: '0.25rem 0 0' }}>{line.availabilityReason || 'Unavailable'}</p>
        )}
        {showPreorder && line.isPreOrder && (
          <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', margin: '0.25rem 0 0' }}>Pre-order</p>
        )}
        {showUnitPrice && (
          <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', margin: '0.25rem 0 0' }}>{money(line.unitPrice)} each</p>
        )}
        {renderLineMeta(productMetaFields(line))}
      </>
    )
  }

  // A line's meta comes from two kinds of source the layout treats differently:
  // the product's own choices (a variation, engraving, an uploaded file - shown
  // under the name) and a per-line control's confirmed value (a delivery tier's
  // promised date - shown in the delivery column beside its picker). Shop names
  // no module here: it only knows a control carries a label and a line carries
  // fields, so it splits them generically - the one field that restates the
  // control's own label is the control's, every other field is the product's.
  function metaFields(line: ValidatedLine): LineMetaField[] {
    return line.lineMeta?.fields ?? []
  }
  function productMetaFields(line: ValidatedLine): LineMetaField[] {
    return line.control ? metaFields(line).filter((f) => f.label !== line.control!.label) : metaFields(line)
  }
  function deliveryMetaFields(line: ValidatedLine): LineMetaField[] {
    return line.control ? metaFields(line).filter((f) => f.label === line.control!.label) : []
  }

  // Every distinct option label offered anywhere in the cart. Each delivery
  // column renders the lot invisibly, which is what sizes the column to its
  // longest tier without a hardcoded width (see cart-line-css.ts).
  const deliveryOptionLabels = Array.from(
    new Set(lines.flatMap((l) => (l.control?.options ?? []).map((o) => o.label))),
  )

  // Generic per-line picker offered by a cart-line resolver (e.g. a delivery
  // tier). Shop renders it from plain data - it never imports the contributing
  // module's component. Changing it writes the choice to the line meta and the
  // cart re-validates, so the price and any resolver-supplied line meta update.
  // The resolver picks the shape: a compact dropdown (default) or a radio group
  // when every option should be visible at a glance.
  // The summary presentation only applies when the resolver pre-split every
  // option's wording for it. Shop never breaks a label apart itself, so a
  // resolver that supplies only some of the parts falls back to the radio group
  // rather than to a half-built card.
  const isSummaryControl = (control: CartLineControl) =>
    control.renderAs === 'summary' && control.options.length > 0 && control.options.every((o) => o.summary?.headline)

  // An option is free when the resolver says it adds nothing to the line; the
  // price then reads in the success colour rather than as another charge.
  const isFreeOption = (o: CartLineControl['options'][number]) => typeof o.priceAdjust === 'number' && o.priceAdjust <= 0

  // Chosen option confirmed in place, every other option a one-click chip
  // beneath it. The whole group is still a radio group underneath, so keyboard
  // and assistive tech treat it as the single choice it is.
  function renderSummary(line: ValidatedLine, control: CartLineControl) {
    const chosen = control.options.find((o) => o.value === control.value) ?? control.options[0]!
    const alts = control.options.filter((o) => o.value !== chosen.value)
    const groupName = `${lineKey(line)}:${control.key}`
    const card = (
      <>
        <span className="scl-tick"><TickIcon /></span>
        <span className="scl-sum-lines">
          <span className="scl-s-top">
            <span className="scl-s-date">{chosen.summary!.headline}</span>
            {chosen.summary!.secondary && <span className="scl-s-desc">{chosen.summary!.secondary}</span>}
            {chosen.summary!.priceLabel && (
              <span className={`scl-s-fee${isFreeOption(chosen) ? ' scl-free' : ''}`}>{chosen.summary!.priceLabel}</span>
            )}
          </span>
          {chosen.description && <span className="scl-s-below">{chosen.description}</span>}
        </span>
      </>
    )
    return (
      <fieldset className="scl-delgrp">
        <legend style={SR_ONLY}>{control.label}</legend>
        {/* A line with nothing to choose gets the same bar without a control in
            it - it states what happens, it does not ask. */}
        {alts.length === 0 ? (
          <div className="scl-sum">{card}</div>
        ) : (
          <label className="scl-sum">
            <input type="radio" name={groupName} value={chosen.value} checked disabled={preview} onChange={() => {}} />
            {card}
          </label>
        )}
        {alts.length > 0 && (
          <div className="scl-hints">
            <span className="scl-hints-t">Switch to:</span>
            {alts.map((o) => (
              <label key={o.value} className="scl-hint" title={o.label}>
                <input
                  type="radio" name={groupName} value={o.value} checked={false} disabled={preview}
                  onChange={() => onControl(lineKey(line), control.key, o.value)}
                />
                {o.summary!.switchLabel ?? o.label}
                {o.summary!.priceLabel && (
                  <span className={`scl-hint-fee${isFreeOption(o) ? ' scl-free' : ''}`}>{o.summary!.priceLabel}</span>
                )}
              </label>
            ))}
          </div>
        )}
      </fieldset>
    )
  }

  function renderControl(line: ValidatedLine) {
    const control = line.control
    if (!control || control.options.length === 0) return null
    if (isSummaryControl(control)) return renderSummary(line, control)
    if (control.renderAs === 'radios') {
      // One <fieldset> per line so the group is labelled for assistive tech; the
      // radio name is scoped to the line + control key so two lines of the same
      // product never share a group.
      const groupName = `${lineKey(line)}:${control.key}`
      return (
        <fieldset style={{ border: 'none', margin: '0.375rem 0 0', padding: 0, display: 'grid', gap: '0.25rem', fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
          {/* A self-labelling control needs no visible heading (each option states
              its own outcome), but the group stays labelled for assistive tech. */}
          <legend style={control.optionsSelfLabelled ? SR_ONLY : { fontWeight: 500, padding: 0 }}>{control.label}{control.optionsSelfLabelled ? '' : ':'}</legend>
          {control.options.map((o) => (
            <label key={o.value} style={{ display: 'flex', alignItems: o.description ? 'flex-start' : 'center', gap: '0.375rem', cursor: preview ? 'default' : 'pointer' }}>
              <input
                type="radio"
                name={groupName}
                value={o.value}
                checked={control.value === o.value}
                disabled={preview}
                onChange={() => onControl(lineKey(line), control.key, o.value)}
                style={{ accentColor: 'var(--color-primary)', margin: 0, marginTop: o.description ? '0.2em' : 0 }}
              />
              {o.description ? (
                <span style={{ display: 'grid', gap: '0.125rem' }}>
                  <span>{o.label}</span>
                  <span style={{ fontSize: '0.75rem', opacity: 0.8 }}>{o.description}</span>
                </span>
              ) : (
                <span>{o.label}</span>
              )}
            </label>
          ))}
        </fieldset>
      )
    }
    // The chosen option's description (if it carries one) sits under the picker
    // - a <select> has nowhere to show per-option copy of its own.
    const chosenDescription = control.options.find((o) => o.value === control.value)?.description
    return (
      <div style={{ display: 'grid', gap: '0.25rem', margin: '0.375rem 0 0' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
          {control.optionsSelfLabelled
            ? null
            : <span style={{ fontWeight: 500 }}>{control.label}:</span>}
          <select
            aria-label={control.optionsSelfLabelled ? control.label : undefined}
            value={control.value}
            disabled={preview}
            onChange={(e) => onControl(lineKey(line), control.key, e.target.value)}
            style={{ padding: '0.25rem 0.375rem', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)', fontSize: '0.8125rem' }}
          >
            {control.options.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
        {chosenDescription && (
          <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', opacity: 0.9 }}>{chosenDescription}</span>
        )}
      </div>
    )
  }

  // Generic personalisation display: label/value pairs the resolver normalised.
  // A field with an href renders as a link (e.g. an uploaded artwork file). The
  // caller decides which fields to pass (product choices under the name, the
  // control's own confirmation beside its picker).
  function renderLineMeta(fields: LineMetaField[]) {
    if (!fields.length) return null
    return (
      <ul style={{ listStyle: 'none', margin: '0.25rem 0 0', padding: 0, display: 'grid', gap: '0.125rem' }}>
        {fields.map((f, i) => (
          <li key={i} style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
            <span style={{ fontWeight: 500 }}>{f.label}:</span>{' '}
            {f.href ? <a href={f.href} target="_blank" rel="noopener noreferrer">{f.value}</a> : f.value}
          </li>
        ))}
      </ul>
    )
  }

  // The delivery column: a per-line control's picker plus its confirmed value
  // (the promised date), lifted out of the name column into a column of its own
  // between the product and the price. A self-labelling control skips the
  // confirmation line - each option already states its own outcome. Null for a
  // line no resolver offered a control for, so a plain shop's cart keeps its
  // original shape.
  function renderDelivery(line: ValidatedLine) {
    if (!line.control || line.control.options.length === 0) {
      // A basket where only some lines are offered a picker still needs the
      // column on every line, or the quantity/price/remove columns below it
      // shunt left and the cart stops lining up. Empty, and out of the
      // accessibility tree - it holds the track open, nothing more.
      return anyDelivery ? <div className="scl-deliv" aria-hidden="true" /> : null
    }
    // The summary presentation takes the width the product column leaves rather
    // than being sized to its longest label, so it wants neither the probe nor
    // the max-content rule the dropdown and radio group rely on.
    const summary = isSummaryControl(line.control)
    return (
      <div className={`scl-deliv${summary ? ' scl-deliv-sum' : ''}`} style={{ display: 'grid', gap: '0.25rem', minWidth: 0, alignContent: 'center' }}>
        {renderControl(line)}
        {!line.control.optionsSelfLabelled && renderLineMeta(deliveryMetaFields(line))}
        {/* Invisible sizing probe - paints nothing, but makes this column wide
            enough for the cart's longest option on one line, and the same width
            on every line. See .scl-deliv-probe in cart-line-css.ts. */}
        {!summary && (
          <div className="scl-deliv-probe" aria-hidden="true">
            {deliveryOptionLabels.map((label) => <span key={label}>{label}</span>)}
          </div>
        )}
      </div>
    )
  }

  function renderQty(line: ValidatedLine) {
    if (quantityControl === 'readonly') {
      return <span className="scl-qty" style={{ minWidth: 40, textAlign: 'center', color: 'var(--color-text-muted)' }}>× {line.quantity}</span>
    }
    // A pooled line goes down to 1: its minimum is the listing's, and the
    // basket makes it up out of whichever combinations the shopper picked. An
    // unpooled one stops at its own minimum, which nothing else can satisfy.
    const min = line.minOrderPooled ? 1 : minOrderQuantity(line.minOrderQuantity)
    if (quantityControl === 'stepper') {
      return (
        <QuantityStepper
          value={line.quantity}
          label={`Quantity for ${line.displayTitle?.name || line.name}`}
          disabled={preview}
          min={min}
          onChange={(next) => onQty(lineKey(line), next, min)}
        />
      )
    }
    return (
      <input
        className="scl-qty"
        type="number" min={0} step={1} value={line.quantity} readOnly={preview}
        onChange={(e) => onQty(lineKey(line), Number(e.target.value), min)}
        style={{ width: 56, padding: '0.375rem', borderRadius: 6, border: '1px solid var(--color-border)' }}
      />
    )
  }

  function renderRemove(line: ValidatedLine) {
    if (!showRemove) return null
    const label = `Remove ${line.displayTitle?.name || line.name}`
    if (removeIcon) return <RemoveCross label={label} onClick={() => onRemove(line)} disabled={preview} />
    return (
      <button
        className="scl-remove"
        type="button" aria-label={label} title="Remove" onClick={() => onRemove(line)}
        style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: preview ? 'default' : 'pointer', fontSize: '0.9375rem' }}
      >
        Remove
      </button>
    )
  }

  const renderLinePrice = (line: ValidatedLine) =>
    showLinePrice ? <span className="scl-price" style={{ minWidth: 70, textAlign: 'right', color: accent, fontWeight: 600 }}>{money(line.lineSubtotal)}</span> : null

  // ---- Line list (rows / cards) ----
  function renderItemsFlow() {
    // The list's column tracks, shared by every line through subgrid (see
    // .scl-list in cart-line-css.ts). Only the cart knows which columns the shop
    // owner has switched on, so it composes the track list and the stylesheet
    // reads it back out of --scl-cols. A track per column that is actually
    // rendered, in render order.
    //
    // The summary presentation wants the room the product column leaves, so
    // there the product column is pinned narrow and delivery takes the rest;
    // with the plainer pickers it is the other way round - delivery is sized to
    // the longest service label in the basket (capped, so a very long one wraps
    // rather than pushing the page sideways) and the product column takes the
    // rest.
    //
    // Both of those are written as a px preference capped to a share of the row
    // (`min(247px, 22%)`), not as flat pixels. A flat px track keeps its full
    // width until every flexible track has been squeezed to nothing, which is
    // exactly what went wrong: narrowing the window took the room off the
    // delivery column alone while the picture and the product name sat at their
    // full desktop size, and the delivery card's contents ran out over the
    // quantity and price. With the cap, the percentage takes over as soon as
    // the row is too short to honour the pixels, so the image, the name and the
    // delivery column all give up room together and the desktop layout at full
    // width is unchanged.
    const summaryDelivery = lines.some((line) => line.control && isSummaryControl(line.control))
    const cols = [
      showImage ? `min(${imageSize}px,8%)` : null,
      anyDelivery && summaryDelivery ? `minmax(0,min(${SUMMARY_NAME_COL}px,22%))` : 'minmax(0,1fr)',
      anyDelivery ? (summaryDelivery ? 'minmax(0,1fr)' : 'fit-content(45%)') : null,
      'max-content',                                        // quantity
      showLinePrice ? 'minmax(70px,max-content)' : null,
      showRemove ? 'max-content' : null,
    ].filter(Boolean).join(' ')

    return (
      <ul
        className="scl-list"
        // Row gap only: the column gap belongs to the shared grid, so it is set
        // in the stylesheet where the mobile restack can leave it behind.
        style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', rowGap: density.gap, ['--scl-cols' as string]: cols }}
      >
        {displayLines.map((line, index) => (
          <li
            key={lineKey(line)}
            className="scl"
            style={{
              paddingBottom: density.padY,
              ...(layoutStyle === 'cards'
                ? { background: panelBg, border: '1px solid var(--color-border)', borderRadius: panelRadius, padding: density.padY }
                // No divider between a product and its own attachments - the
                // group reads as one entry, so the line waits until the set ends.
                : showDivider && !groupJoinsNext(line, displayLines, index) ? { borderBottom: '1px solid var(--color-border)' } : {}),
            }}
          >
            {renderThumb(line)}
            {/* The flex basis is inert in the shared grid (a grid item ignores
                it) and is what sizes this column in the no-subgrid fallback. */}
            <div className="scl-main" style={anyDelivery ? { flex: `0 1 ${SUMMARY_NAME_COL}px`, minWidth: 0 } : { flex: 1, minWidth: 0 }}>
              {renderName(line)}
              {renderMeta(line)}
            </div>
            {renderDelivery(line)}
            {renderQty(line)}
            {renderLinePrice(line)}
            {renderRemove(line)}
            {renderGroupConfirm(line)}
          </li>
        ))}
      </ul>
    )
  }

  // ---- Table ----
  function renderItemsTable() {
    const th = { textAlign: 'left' as const, fontSize: '0.8125rem', color: 'var(--color-text-muted)', fontWeight: 600, padding: `0 0 ${density.padY}` }
    const td = { padding: `${density.padY} 0`, borderBottom: '1px solid var(--color-border)', verticalAlign: 'middle' as const }
    // A Delivery column only earns its place when at least one line offers a
    // delivery control; a plain shop's table keeps its original columns.
    return (
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', background: layoutStyle === 'table' ? panelBg : 'transparent', borderRadius: panelRadius }}>
          <thead>
            <tr>
              <th style={th}>Item</th>
              {anyDelivery && <th style={th}>Delivery</th>}
              {showUnitPrice && <th style={{ ...th, textAlign: 'right' }}>Price</th>}
              <th style={{ ...th, textAlign: 'center' }}>Qty</th>
              {showLinePrice && <th style={{ ...th, textAlign: 'right' }}>Total</th>}
              {showRemove && <th style={th} aria-label="Remove" />}
            </tr>
          </thead>
          <tbody>
            {displayLines.map((line, index) => {
              const columnCount = 2 + (anyDelivery ? 1 : 0) + (showUnitPrice ? 1 : 0) + (showLinePrice ? 1 : 0) + (showRemove ? 1 : 0)
              const confirm = renderGroupConfirm(line)
              // Same no-divider-inside-a-group rule as the flow layout below.
              const rowTd = groupJoinsNext(line, displayLines, index) ? { ...td, borderBottom: 'none' } : td
              return (
                <Fragment key={lineKey(line)}>
                  <tr>
                    <td style={rowTd}>
                      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                        {renderThumb(line)}
                        <div style={{ minWidth: 0 }}>{renderName(line)}{renderMeta(line)}</div>
                      </div>
                    </td>
                    {anyDelivery && <td style={{ ...rowTd, minWidth: 0 }}>{renderDelivery(line)}</td>}
                    {showUnitPrice && <td style={{ ...rowTd, textAlign: 'right', whiteSpace: 'nowrap' }}>{money(line.unitPrice)}</td>}
                    <td style={{ ...rowTd, textAlign: 'center' }}>{renderQty(line)}</td>
                    {showLinePrice && <td style={{ ...rowTd, textAlign: 'right', color: accent, fontWeight: 600, whiteSpace: 'nowrap' }}>{money(line.lineSubtotal)}</td>}
                    {showRemove && <td style={{ ...rowTd, textAlign: 'right' }}>{renderRemove(line)}</td>}
                  </tr>
                  {confirm && (
                    <tr>
                      <td colSpan={columnCount} style={{ padding: 0, border: 'none' }}>{confirm}</td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    )
  }

  const checkoutStyle = {
    display: (props.checkoutFullWidth ?? 'yes') !== 'no' ? 'block' : 'inline-block',
    background: props.checkoutBg || 'var(--color-primary)',
    color: props.checkoutText || 'var(--color-on-primary)',
    textAlign: 'center' as const, borderRadius: props.checkoutRadius ?? 8,
    padding: '0.75rem 1.25rem', fontWeight: 600, textDecoration: 'none', border: 'none', cursor: preview ? 'default' : 'pointer',
  }

  return (
    <div style={{ display: 'grid', gap: '1rem', maxWidth, width: '100%' }}>
      <style dangerouslySetInnerHTML={{ __html: CART_LINE_CSS }} />
      {props.heading && <h2 style={{ fontSize: headingSize, margin: 0 }}>{props.heading}</h2>}

      {withItems && (layoutStyle === 'table' ? renderItemsTable() : renderItemsFlow())}

      {withFooter && showCoupon && couponsAvailable && (
        couponOpen ? (
          <div style={{ display: 'grid', gap: '0.375rem' }}>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                autoFocus={!preview}
                placeholder={props.couponPlaceholder || 'Coupon code'} value={couponCode} readOnly={preview}
                onChange={(e) => setCouponCode(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void applyCoupon() } }}
                style={{ flex: 1, padding: '0.5rem 0.75rem', borderRadius: 6, border: '1px solid var(--color-border)' }}
              />
              <button type="button" onClick={applyCoupon} style={{ background: 'var(--color-bg-subtle)', border: '1px solid var(--color-border)', borderRadius: 6, padding: '0.5rem 1rem', cursor: preview ? 'default' : 'pointer' }}>
                {props.couponButtonLabel || 'Apply'}
              </button>
            </div>
            {couponMessage && <p style={{ fontSize: '0.875rem', margin: 0 }}>{couponMessage}</p>}
          </div>
        ) : (
          <div>
            <button
              type="button" onClick={() => setCouponOpen(true)} disabled={preview}
              style={{
                background: 'none', border: 'none', padding: 0, font: 'inherit', fontSize: '0.875rem',
                color: 'var(--color-text-muted)', textDecoration: 'underline', textUnderlineOffset: 3,
                cursor: preview ? 'default' : 'pointer',
              }}
            >
              {props.couponLinkLabel || 'Add coupon code'}
            </button>
          </div>
        )
      )}

      {withFooter && showItemCount && (
        <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>{itemCount} item{itemCount === 1 ? '' : 's'} in your basket</p>
      )}

      {/* The totals and the checkout button together: once this block leaves the
          viewport the sticky bar takes over, and it steps aside the moment the
          real one is back on screen. */}
      {withFooter && (
      <div ref={footerRef} style={{ display: 'grid', gap: '1rem' }}>
        {showSubtotal && (
          <dl className="scl-tot">
            <dt>{props.subtotalLabel || 'Subtotal'}</dt>
            <dd>{money(subtotal)}</dd>
            {/* One row per named charge a resolver broke out of the line prices
                - a delivery service, say. Shop prints the label it was handed;
                it never decides what the charge is called. */}
            {chargeRows.map((row) => (
              <div key={row.label} style={{ display: 'contents' }}>
                <dt>{row.label}</dt>
                <dd>{money(row.amount)}</dd>
              </div>
            ))}
            {taxAmount > 0 && (
              <>
                {/* On inclusive pricing the tax is already inside the figures
                    above, so the row says so rather than reading as another
                    charge - the column of numbers would not otherwise add up. */}
                <dt>{props.taxLabel || 'VAT'}{taxMode === 'INCLUSIVE' ? ' (included)' : ''}</dt>
                <dd>{money(taxAmount)}</dd>
              </>
            )}
            <dt className="scl-tot-t">{props.totalLabel || 'Total'}</dt>
            <dd className="scl-tot-t" style={{ color: accent }}>{money(total)}</dd>
          </dl>
        )}

        {preview
          ? <span role="button" style={checkoutStyle}>{checkoutLabel}</span>
          : <Link href={checkoutHref} style={checkoutStyle}>{checkoutLabel}</Link>}
      </div>
      )}

      {/* The bar stands in for the footer it replaced, so it carries the same
          bottom line that footer ends on - the Total, not the goods figure the
          totals block now opens with. */}
      {!preview && withFooter && yes(props.stickyBar) && (
        <CartStickyBar
          visible={stickyVisible}
          meta={[`${itemCount} item${itemCount === 1 ? '' : 's'}`, ...notes].join(' · ')}
          totalLabel={props.totalLabel || 'Total'}
          total={money(total)}
          checkoutLabel={checkoutLabel}
          checkoutHref={checkoutHref}
          checkoutStyle={{ ...checkoutStyle, display: 'inline-flex', alignItems: 'center', width: 'auto', height: 46, padding: '0 1.625rem' }}
        />
      )}

      {/* Clear of the sticky bar when that is up, so the two never overlap. */}
      {toast && <CartUndoToast message={toast.message} leaving={toast.leaving} bottom={stickyVisible ? 88 : 28} onUndo={undo} />}
    </div>
  )
}
