'use client'

import { useEffect, useState, type CSSProperties } from 'react'
import Link from 'next/link'
import { getCart, setLineQuantity, setLineMeta, removeFromCart, subscribeCart } from '@/modules/shop/components/public/cart'
import { postCartValidate, readValidatedCartCache, writeValidatedCartCache } from '@/modules/shop/components/public/validated-cache'
import { updateCheckoutState } from '@/modules/shop/components/public/checkout-state'
import type { LineMeta, LineMetaField } from '@/modules/shop/lib/types'
import type { CartLineControl, CartLineTitle } from '@/modules/shop/lib/line-meta'
import { CART_LINE_CSS } from '@/modules/shop/components/public/cart-line-css'

// Full cart-display island. ONE render path, shared by the Puck editor preview
// (seeded with SAMPLE_LINES, no fetch, controls inert) and the live frontend
// (real localStorage cart, wired controls). Editor and frontend therefore emit
// identical markup - only the data source and handler wiring differ.

type ValidatedLine = {
  productId: string; name: string; slug: string; quantity: number; unitPrice: number
  lineSubtotal: number; available: boolean; availabilityReason: string | null
  isPreOrder: boolean; imageUrl: string | null
  lineId?: string | null; lineMeta?: LineMeta | null
  control?: CartLineControl | null
  displayTitle?: CartLineTitle | null
}

// A personalised line is keyed by its lineId so two of the same product with
// different options are targeted/removed independently; plain lines fall back
// to productId exactly as before.
const lineKey = (l: Pick<ValidatedLine, 'productId' | 'lineId'>) => l.lineId ?? l.productId

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
  showItemCount?: string
  showSubtotal?: string
  subtotalLabel?: string
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
    control: { key: 'shippingTier', label: 'Delivery', value: 'standard', optionsSelfLabelled: true, options: [{ value: 'standard', label: 'Standard by Tuesday (included)' }, { value: 'express', label: 'Express by Monday (+£4.95)' }] },
  },
  { productId: 'sample-2', name: 'Watering Can (Brass)', slug: 'watering-can-brass', quantity: 1, unitPrice: 42.5, lineSubtotal: 42.5, available: true, availabilityReason: null, isPreOrder: true, imageUrl: null },
]

const yes = (v: string | undefined, dflt = true) => (v == null ? dflt : v !== 'no')

const DENSITY = {
  compact: { gap: '0.5rem', padY: '0.5rem' },
  cosy: { gap: '0.75rem', padY: '0.75rem' },
  roomy: { gap: '1.25rem', padY: '1.1rem' },
} as const
const HEADING_SIZE = { sm: '1.25rem', md: '1.75rem', lg: '2.25rem' } as const

export function CartFullClient(props: CartFullOptions & { preview?: boolean }) {
  const { preview } = props
  const [lines, setLines] = useState<ValidatedLine[]>(preview ? SAMPLE_LINES : [])
  const [currencySymbol, setCurrencySymbol] = useState('£')
  const [couponCode, setCouponCode] = useState('')
  const [couponMessage, setCouponMessage] = useState<string | null>(null)
  const [hasLoaded, setHasLoaded] = useState(preview ?? false)

  // The currency symbol is fixed for the shop, so fetch it once rather than on
  // every cart re-validate - changing the delivery picker used to re-fetch it
  // alongside the validate, doubling the round-trips on every dropdown change.
  useEffect(() => {
    if (preview) return
    let cancelled = false
    fetch('/api/m/shop/public/config')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (!cancelled && data) setCurrencySymbol(data.currencySymbol) })
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
      if (cart.length === 0) { if (!cancelled) { setLines([]); setHasLoaded(true) } return }
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
        writeValidatedCartCache(data.lines)
      }
      setHasLoaded(true)
    }
    refresh()
    const unsubscribe = subscribeCart(refresh)
    return () => { cancelled = true; unsubscribe() }
  }, [preview])

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

  const onQty = (id: string, q: number) => { if (!preview) setLineQuantity(id, Math.max(0, q)) }
  const onRemove = (id: string) => { if (!preview) removeFromCart(id) }
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
        next.unitPrice = l.unitPrice - oldOpt.priceAdjust + newOpt.priceAdjust
        next.lineSubtotal = next.unitPrice * l.quantity
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
  const quantityControl = props.quantityControl ?? 'input'
  const showRemove = yes(props.showRemove)
  const removeIcon = (props.removeStyle ?? 'text') === 'icon'
  const showAvailability = yes(props.showAvailability)
  const showPreorder = yes(props.showPreorder)
  const showCoupon = yes(props.showCoupon)
  const showItemCount = yes(props.showItemCount)
  const showSubtotal = yes(props.showSubtotal)
  const accent = props.accentColour || 'inherit'
  const panelBg = props.panelBg || 'var(--color-surface)'
  const panelRadius = props.borderRadius ?? 12
  const maxWidth = props.maxWidth && props.maxWidth > 0 ? props.maxWidth : undefined

  const subtotal = lines.reduce((sum, l) => sum + l.lineSubtotal, 0)
  const itemCount = lines.reduce((sum, l) => sum + l.quantity, 0)
  const money = (n: number) => `${currencySymbol}${n.toFixed(2)}`

  // While the client fetches the localStorage cart, show a shimmer skeleton
  // rather than a blank gap. The validate call folds every cart-line resolver
  // (delivery estimates, personalisation) so it can take a moment; a blank made
  // shoppers think the cart - and its delivery picker - had simply failed to
  // load. Live path only; the editor preview seeds hasLoaded=true.
  if (!hasLoaded) {
    return (
      <div style={{ display: 'grid', gap: density.gap, maxWidth, width: '100%' }} aria-busy="true" aria-label="Loading your cart">
        {[0, 1].map((i) => (
          <div key={i} style={{ display: 'flex', gap: '1rem', alignItems: 'center', paddingBottom: density.padY, borderBottom: '1px solid var(--color-border)' }}>
            {showImage && <div className="skeleton" style={{ width: imageSize, height: imageSize, borderRadius: imageRadius, flexShrink: 0 }} />}
            <div style={{ flex: 1, display: 'grid', gap: '0.4rem' }}>
              <div className="skeleton" style={{ height: 14, width: '65%' }} />
              <div className="skeleton" style={{ height: 12, width: '35%' }} />
            </div>
            <div className="skeleton" style={{ height: 14, width: 60 }} />
          </div>
        ))}
        <div className="skeleton" style={{ height: 44, width: '100%', borderRadius: props.checkoutRadius ?? 8 }} />
      </div>
    )
  }

  // Empty cart (live only - preview always seeds samples)
  if (lines.length === 0) {
    return (
      <div style={{ maxWidth, color: 'var(--color-text-muted)' }}>
        <p style={{ margin: 0 }}>
          {props.emptyText || 'Your cart is empty.'}{' '}
          <Link href={props.continueHref || '/shop'}>{props.continueLabel || 'Continue shopping'}</Link>.
        </p>
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

  // Name line, plus - when a resolver split the line's title (a variant, say) -
  // the chosen options on their own muted line beneath it, so the product name
  // and the variation no longer share one line.
  function renderName(line: ValidatedLine) {
    const style = { color: 'inherit', textDecoration: 'none', fontWeight: 600 } as const
    const title = line.displayTitle?.name || line.name
    const secondary = line.displayTitle?.secondary
    return (
      <>
        {preview
          ? <span style={style}>{title}</span>
          : <a href={`/shop/products/${line.slug}`} style={style}>{title}</a>}
        {secondary && (
          <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', margin: '0.25rem 0 0' }}>{secondary}</p>
        )}
      </>
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

  // Generic per-line picker offered by a cart-line resolver (e.g. a delivery
  // tier). Shop renders it from plain data - it never imports the contributing
  // module's component. Changing it writes the choice to the line meta and the
  // cart re-validates, so the price and any resolver-supplied line meta update.
  // The resolver picks the shape: a compact dropdown (default) or a radio group
  // when every option should be visible at a glance.
  function renderControl(line: ValidatedLine) {
    const control = line.control
    if (!control || control.options.length === 0) return null
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
            <label key={o.value} style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', cursor: preview ? 'default' : 'pointer' }}>
              <input
                type="radio"
                name={groupName}
                value={o.value}
                checked={control.value === o.value}
                disabled={preview}
                onChange={() => onControl(lineKey(line), control.key, o.value)}
                style={{ accentColor: 'var(--color-primary)', margin: 0 }}
              />
              <span>{o.label}</span>
            </label>
          ))}
        </fieldset>
      )
    }
    return (
      <label style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', margin: '0.375rem 0 0', fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
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
    if (!line.control || line.control.options.length === 0) return null
    return (
      <div className="scl-deliv" style={{ display: 'grid', gap: '0.25rem', minWidth: 0, alignContent: 'center' }}>
        {renderControl(line)}
        {!line.control.optionsSelfLabelled && renderLineMeta(deliveryMetaFields(line))}
      </div>
    )
  }

  function renderQty(line: ValidatedLine) {
    if (quantityControl === 'readonly') {
      return <span className="scl-qty" style={{ minWidth: 40, textAlign: 'center', color: 'var(--color-text-muted)' }}>× {line.quantity}</span>
    }
    if (quantityControl === 'stepper') {
      const btn = { width: 28, height: 28, borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-bg-subtle)', cursor: preview ? 'default' : 'pointer', lineHeight: 1 } as const
      return (
        <div className="scl-qty" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
          <button type="button" aria-label="Decrease quantity" onClick={() => onQty(lineKey(line), line.quantity - 1)} style={btn}>−</button>
          <span style={{ minWidth: 24, textAlign: 'center' }}>{line.quantity}</span>
          <button type="button" aria-label="Increase quantity" onClick={() => onQty(lineKey(line), line.quantity + 1)} style={btn}>＋</button>
        </div>
      )
    }
    return (
      <input
        className="scl-qty"
        type="number" min={0} value={line.quantity} readOnly={preview}
        onChange={(e) => onQty(lineKey(line), Number(e.target.value))}
        style={{ width: 56, padding: '0.375rem', borderRadius: 6, border: '1px solid var(--color-border)' }}
      />
    )
  }

  function renderRemove(line: ValidatedLine) {
    if (!showRemove) return null
    return (
      <button
        className="scl-remove"
        type="button" aria-label="Remove item" title="Remove" onClick={() => onRemove(lineKey(line))}
        style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: preview ? 'default' : 'pointer', fontSize: removeIcon ? '1.1rem' : '0.9375rem' }}
      >
        {removeIcon ? '🗑' : 'Remove'}
      </button>
    )
  }

  const renderLinePrice = (line: ValidatedLine) =>
    showLinePrice ? <span className="scl-price" style={{ minWidth: 70, textAlign: 'right', color: accent, fontWeight: 600 }}>{money(line.lineSubtotal)}</span> : null

  // ---- Line list (rows / cards) ----
  function renderItemsFlow() {
    return (
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: density.gap }}>
        {lines.map((line) => (
          <li
            key={lineKey(line)}
            className="scl"
            style={{
              display: 'flex', gap: '1rem', alignItems: 'center', paddingBottom: density.padY,
              ...(layoutStyle === 'cards'
                ? { background: panelBg, border: '1px solid var(--color-border)', borderRadius: panelRadius, padding: density.padY }
                : showDivider ? { borderBottom: '1px solid var(--color-border)' } : {}),
            }}
          >
            {renderThumb(line)}
            <div className="scl-main" style={{ flex: 1, minWidth: 0 }}>
              {renderName(line)}
              {renderMeta(line)}
            </div>
            {renderDelivery(line)}
            {renderQty(line)}
            {renderLinePrice(line)}
            {renderRemove(line)}
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
    const anyDelivery = lines.some((line) => line.control && line.control.options.length > 0)
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
            {lines.map((line) => (
              <tr key={lineKey(line)}>
                <td style={td}>
                  <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                    {renderThumb(line)}
                    <div style={{ minWidth: 0 }}>{renderName(line)}{renderMeta(line)}</div>
                  </div>
                </td>
                {anyDelivery && <td style={{ ...td, minWidth: 0 }}>{renderDelivery(line)}</td>}
                {showUnitPrice && <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>{money(line.unitPrice)}</td>}
                <td style={{ ...td, textAlign: 'center' }}>{renderQty(line)}</td>
                {showLinePrice && <td style={{ ...td, textAlign: 'right', color: accent, fontWeight: 600, whiteSpace: 'nowrap' }}>{money(line.lineSubtotal)}</td>}
                {showRemove && <td style={{ ...td, textAlign: 'right' }}>{renderRemove(line)}</td>}
              </tr>
            ))}
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

      {layoutStyle === 'table' ? renderItemsTable() : renderItemsFlow()}

      {showCoupon && (
        <div style={{ display: 'grid', gap: '0.375rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              placeholder={props.couponPlaceholder || 'Coupon code'} value={couponCode} readOnly={preview}
              onChange={(e) => setCouponCode(e.target.value)}
              style={{ flex: 1, padding: '0.5rem 0.75rem', borderRadius: 6, border: '1px solid var(--color-border)' }}
            />
            <button type="button" onClick={applyCoupon} style={{ background: 'var(--color-bg-subtle)', border: '1px solid var(--color-border)', borderRadius: 6, padding: '0.5rem 1rem', cursor: preview ? 'default' : 'pointer' }}>
              {props.couponButtonLabel || 'Apply'}
            </button>
          </div>
          {couponMessage && <p style={{ fontSize: '0.875rem', margin: 0 }}>{couponMessage}</p>}
        </div>
      )}

      {showItemCount && (
        <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>{itemCount} item{itemCount === 1 ? '' : 's'} in your cart</p>
      )}

      {showSubtotal && (
        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, fontSize: '1.125rem' }}>
          <span>{props.subtotalLabel || 'Subtotal'}</span>
          <span style={{ color: accent }}>{money(subtotal)}</span>
        </div>
      )}

      {preview
        ? <span role="button" style={checkoutStyle}>{props.checkoutLabel || 'Proceed to checkout'}</span>
        : <Link href="/shop/checkout" style={checkoutStyle}>{props.checkoutLabel || 'Proceed to checkout'}</Link>}
    </div>
  )
}
