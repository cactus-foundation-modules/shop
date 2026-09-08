'use client'

// Shared cart chrome: the small pieces both cart renderers use - the quantity
// stepper pill, the remove cross, the sticky checkout bar and the undo toast.
// They live here rather than in either component so the designable Puck cart
// block (CartFullClient) and the fallback cart page (CartPageClient) can never
// drift apart on look or behaviour. Styling comes entirely from CART_LINE_CSS,
// which each caller already injects.
import Link from 'next/link'
import type { CSSProperties } from 'react'

export function TickIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  )
}

/**
 * What a line cost before the order-size deduction came off it, or null when
 * nothing did. The per-unit figure the server sent, multiplied out, rather than
 * the line subtotal plus the deduction: both figures are rounded to the penny
 * on the shop's display side of tax, and adding two rounded numbers is how the
 * struck figure ends up a penny out from the one that was actually struck.
 */
export function lineSubtotalBeforeDeduction(line: {
  quantity: number
  orderSizeDeduction?: number | null
  unitPriceBeforeDeduction?: number | null
}): number | null {
  if (!line.orderSizeDeduction || line.unitPriceBeforeDeduction == null) return null
  return line.unitPriceBeforeDeduction * line.quantity
}

/**
 * A line's price, with what it was before the order-size deduction struck
 * through beside it (see lib/order-size-deduction.ts).
 *
 * One place for it because all three basket renderers show it and a struck
 * figure that appeared in the drawer but not on the cart page would read as one
 * of the two being wrong. `was` is null on every line that lost nothing, which
 * is every line on a shop that has not switched the feature on - so the ordinary
 * case renders exactly the single span it always did.
 *
 * Both figures arrive already converted to whichever side of tax the shop prints
 * on; nothing here does arithmetic.
 */
export function CartLinePrice({ now, was, className, style }: { now: string; was: string | null; className?: string; style?: CSSProperties }) {
  if (was == null) return <span className={className} style={style}>{now}</span>
  return (
    <span className={className} style={style}>
      <span className="scl-price-was">{was}</span>
      {now}
    </span>
  )
}

// Remove control: a plain cross, sized for a fingertip on touch (see the
// pointer:coarse rules in CART_LINE_CSS).
export function RemoveCross({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button className="scl-remove scl-removebtn" type="button" aria-label={label} title="Remove" onClick={onClick} disabled={disabled}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
        <path d="M6 6l12 12M18 6L6 18" />
      </svg>
    </button>
  )
}

// Quantity stepper. The box is a text input with a numeric keypad rather than
// type="number" - the browser spinners would fight the − / + buttons for the
// same job and land the row's width all over the place. Non-digits are dropped
// as typed, and an emptied box is left alone until it's blurred, so backspacing
// to retype doesn't remove the line under the shopper.
//
// `min` is the smallest the shop will sell of this line, 1 for all but a handful
// of products. It is the floor the − button and the typed value both stop at, so
// a shopper cannot walk a line down to a quantity the checkout would then refuse
// - Remove is still how a line leaves the basket.
export function QuantityStepper({
  value, label, onChange, disabled, min = 1,
}: { value: number; label: string; onChange: (next: number) => void; disabled?: boolean; min?: number }) {
  const floor = Number.isFinite(min) && min > 1 ? Math.floor(min) : 1
  return (
    <div className="scl-qty scl-qtybox">
      <button type="button" aria-label="Decrease quantity" disabled={disabled || value <= floor} onClick={() => onChange(Math.max(floor, value - 1))}>−</button>
      <input
        type="text"
        inputMode="numeric"
        aria-label={label}
        value={value}
        readOnly={disabled}
        onChange={(e) => {
          const digits = e.target.value.replace(/[^0-9]/g, '')
          if (digits === '') return
          onChange(Math.max(floor, Number(digits)))
        }}
      />
      <button type="button" aria-label="Increase quantity" disabled={disabled} onClick={() => onChange(value + 1)}>+</button>
    </div>
  )
}

// Sticky checkout bar. Mirrors the cart's own total and checkout button, and
// slides up only once the real ones have scrolled out of view - so it is never
// a second button sitting beside the first.
export function CartStickyBar({
  visible, meta, totalLabel, total, checkoutLabel, checkoutHref = '/shop/checkout', checkoutStyle, preview,
}: {
  visible: boolean
  meta: string
  totalLabel: string
  total: string
  checkoutLabel: string
  // Where the bar's button leads. Defaults to shop's own checkout; a quote-only
  // shop passes its own destination so the sticky bar and the real button in the
  // totals block can never point at two different places.
  checkoutHref?: string
  checkoutStyle: CSSProperties
  preview?: boolean
}) {
  return (
    <div className={`scb${visible ? ' scb-in' : ''}`} aria-hidden={!visible}>
      <div className="scb-inner">
        <span className="scb-meta">{meta}</span>
        <div className="scb-right">
          <span className="scb-total"><span>{totalLabel}</span><b>{total}</b></span>
          {preview
            ? <span role="button" style={checkoutStyle}>{checkoutLabel}</span>
            : <Link href={checkoutHref} style={checkoutStyle} tabIndex={visible ? undefined : -1}>{checkoutLabel}</Link>}
        </div>
      </div>
    </div>
  )
}

// Undo toast. Sits bottom-centre, clear of the sticky bar when that is up, and
// fades out rather than vanishing. `aria-live` announces the removal without
// stealing focus; the Undo button is reachable by tab while it is on screen.
export function CartUndoToast({
  message, leaving, bottom, onUndo,
}: { message: string; leaving: boolean; bottom: number; onUndo: () => void }) {
  return (
    <div className={`sct${leaving ? ' sct-out' : ''}`} style={{ bottom }} role="status" aria-live="polite">
      <span>{message}</span>
      <button type="button" onClick={onUndo}>Undo</button>
    </div>
  )
}
