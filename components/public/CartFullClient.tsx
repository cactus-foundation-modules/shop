'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getCart, setLineQuantity, removeFromCart, subscribeCart } from '@/modules/shop/components/public/cart'
import { updateCheckoutState } from '@/modules/shop/components/public/checkout-state'
import type { LineMeta } from '@/modules/shop/lib/types'

// Full cart-display island. ONE render path, shared by the Puck editor preview
// (seeded with SAMPLE_LINES, no fetch, controls inert) and the live frontend
// (real localStorage cart, wired controls). Editor and frontend therefore emit
// identical markup - only the data source and handler wiring differ.

type ValidatedLine = {
  productId: string; name: string; slug: string; quantity: number; unitPrice: number
  lineSubtotal: number; available: boolean; availabilityReason: string | null
  isPreOrder: boolean; imageUrl: string | null
  lineId?: string | null; lineMeta?: LineMeta | null
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

const SAMPLE_LINES: ValidatedLine[] = [
  { productId: 'sample-1', name: 'Terracotta Plant Pot', slug: 'terracotta-plant-pot', quantity: 2, unitPrice: 18, lineSubtotal: 36, available: true, availabilityReason: null, isPreOrder: false, imageUrl: null },
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

  useEffect(() => {
    if (preview) return // editor: static sample, never fetch

    let cancelled = false
    async function refresh() {
      const cart = getCart()
      if (cart.length === 0) { if (!cancelled) { setLines([]); setHasLoaded(true) } return }
      const [validateRes, configRes] = await Promise.all([
        fetch('/api/m/shop/public/cart/validate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lines: cart }) }),
        fetch('/api/m/shop/public/config'),
      ])
      if (cancelled) return
      if (validateRes.ok) setLines((await validateRes.json()).lines)
      if (configRes.ok) setCurrencySymbol((await configRes.json()).currencySymbol)
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

  if (!hasLoaded) return null

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
      return <img src={line.imageUrl} alt="" style={{ width: imageSize, height: imageSize, objectFit: 'cover', borderRadius: imageRadius, flexShrink: 0 }} />
    }
    return <div aria-hidden style={{ width: imageSize, height: imageSize, borderRadius: imageRadius, background: 'var(--color-bg-subtle)', flexShrink: 0 }} />
  }

  function renderName(line: ValidatedLine) {
    const style = { color: 'inherit', textDecoration: 'none', fontWeight: 600 } as const
    return preview
      ? <span style={style}>{line.name}</span>
      : <a href={`/shop/products/${line.slug}`} style={style}>{line.name}</a>
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
        {renderLineMeta(line)}
      </>
    )
  }

  // Generic personalisation display: label/value pairs the resolver normalised.
  // A field with an href renders as a link (e.g. an uploaded artwork file).
  function renderLineMeta(line: ValidatedLine) {
    if (!line.lineMeta?.fields?.length) return null
    return (
      <ul style={{ listStyle: 'none', margin: '0.25rem 0 0', padding: 0, display: 'grid', gap: '0.125rem' }}>
        {line.lineMeta.fields.map((f, i) => (
          <li key={i} style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
            <span style={{ fontWeight: 500 }}>{f.label}:</span>{' '}
            {f.href ? <a href={f.href} target="_blank" rel="noopener noreferrer">{f.value}</a> : f.value}
          </li>
        ))}
      </ul>
    )
  }

  function renderQty(line: ValidatedLine) {
    if (quantityControl === 'readonly') {
      return <span style={{ minWidth: 40, textAlign: 'center', color: 'var(--color-text-muted)' }}>× {line.quantity}</span>
    }
    if (quantityControl === 'stepper') {
      const btn = { width: 28, height: 28, borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-bg-subtle)', cursor: preview ? 'default' : 'pointer', lineHeight: 1 } as const
      return (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
          <button type="button" aria-label="Decrease quantity" onClick={() => onQty(lineKey(line), line.quantity - 1)} style={btn}>−</button>
          <span style={{ minWidth: 24, textAlign: 'center' }}>{line.quantity}</span>
          <button type="button" aria-label="Increase quantity" onClick={() => onQty(lineKey(line), line.quantity + 1)} style={btn}>＋</button>
        </div>
      )
    }
    return (
      <input
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
        type="button" aria-label="Remove item" title="Remove" onClick={() => onRemove(lineKey(line))}
        style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: preview ? 'default' : 'pointer', fontSize: removeIcon ? '1.1rem' : '0.9375rem' }}
      >
        {removeIcon ? '🗑' : 'Remove'}
      </button>
    )
  }

  const renderLinePrice = (line: ValidatedLine) =>
    showLinePrice ? <span style={{ minWidth: 70, textAlign: 'right', color: accent, fontWeight: 600 }}>{money(line.lineSubtotal)}</span> : null

  // ---- Line list (rows / cards) ----
  function renderItemsFlow() {
    return (
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: density.gap }}>
        {lines.map((line) => (
          <li
            key={lineKey(line)}
            style={{
              display: 'flex', gap: '1rem', alignItems: 'center', paddingBottom: density.padY,
              ...(layoutStyle === 'cards'
                ? { background: panelBg, border: '1px solid var(--color-border)', borderRadius: panelRadius, padding: density.padY }
                : showDivider ? { borderBottom: '1px solid var(--color-border)' } : {}),
            }}
          >
            {renderThumb(line)}
            <div style={{ flex: 1, minWidth: 0 }}>
              {renderName(line)}
              {renderMeta(line)}
            </div>
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
    return (
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', background: layoutStyle === 'table' ? panelBg : 'transparent', borderRadius: panelRadius }}>
          <thead>
            <tr>
              <th style={th}>Item</th>
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
