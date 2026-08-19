'use client'

// Slide-out basket. The header's cart widget can either link to the cart page
// (as it always has) or open this panel over the page, so a shopper can see what
// they have, change quantity, switch delivery service and go to checkout without
// leaving the product they were looking at.
//
// It shows the same things the cart page shows, from the same data: the server's
// cart validate, including any per-line control a cart-line resolver offered
// (the delivery tier picker) and any whole-basket notes another module
// contributed. The picker itself is CartLineControlView, shared with the cart
// page, so a tier switched here reads exactly as it would there.
//
// Rendered into document.body through a portal: the widget lives in the site
// header, which is very often a positioned/overflow-clipped stacking context of
// its own, and a panel that has to cover the whole viewport cannot be born
// inside one.
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { getCart, setLineMeta, setLineQuantity, subscribeCart } from '@/modules/shop/components/public/cart'
import { minOrderQuantity } from '@/modules/shop/lib/min-order'
import { postCartValidate, readValidatedCartCache, writeValidatedCartCache } from '@/modules/shop/components/public/validated-cache'
import { CART_LINE_CSS } from '@/modules/shop/components/public/cart-line-css'
import { CART_DRAWER_CSS } from '@/modules/shop/components/public/cart-drawer-css'
import { CartUndoToast, QuantityStepper, TickIcon } from '@/modules/shop/components/public/CartChrome'
import { useCartUndo } from '@/modules/shop/components/public/use-cart-undo'
import { CartLineControlView, LineMetaList, productMetaFields } from '@/modules/shop/components/public/CartLineControlView'
import { useFitLines } from '@/modules/shop/components/public/fit-line'
import { DRAWER_DEFAULTS, type CartDrawerOptions } from '@/modules/shop/components/public/cart-drawer-options'
import {
  commerceModeButtonLabel,
  commerceModeMoney,
  normaliseShopCommerceMode,
  SHOP_DEFAULT_COMMERCE_MODE,
} from '@/modules/shop/lib/commerce-mode-shared'
import type { LineMeta } from '@/modules/shop/lib/types'
import type { CartLineControl, CartLineGroup, CartLineTitle } from '@/modules/shop/lib/line-meta'
import { effectiveGroup, groupMemberKeys, sortLinesByGroup } from '@/modules/shop/lib/cart-group'

// The cart validate's line shape, as the cart page reads it too. Kept in step
// with CartFullClient's copy by hand: the response is the module's own, so a
// field added there is added here only if this panel means to show it.
type ValidatedLine = {
  productId: string; name: string; slug: string; quantity: number; unitPrice: number
  lineSubtotal: number; available: boolean; availabilityReason: string | null
  isPreOrder: boolean; imageUrl: string | null
  // The fewest of this line the shop sells in one go; absent reads as 1.
  minOrderQuantity?: number
  lineId?: string | null; lineMeta?: LineMeta | null
  control?: CartLineControl | null
  displayTitle?: CartLineTitle | null
  group?: CartLineGroup | null
}

const lineKey = (l: Pick<ValidatedLine, 'productId' | 'lineId'>) => l.lineId ?? l.productId

const SR_ONLY: CSSProperties = {
  position: 'absolute', width: 1, height: 1, padding: 0, margin: -1,
  overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0,
}

function CloseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}

// Keeps Tab inside the open panel. A modal that lets focus wander onto the page
// behind it is a modal in looks only - a keyboard shopper tabs straight out of
// the basket and cannot tell where they are.
function trapTab(panel: HTMLElement, e: KeyboardEvent) {
  if (e.key !== 'Tab') return
  const focusable = panel.querySelectorAll<HTMLElement>(
    'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
  )
  const items = Array.from(focusable).filter((el) => el.offsetParent !== null || el === document.activeElement)
  if (items.length === 0) return
  const first = items[0]!
  const last = items[items.length - 1]!
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
}

export function CartDrawerClient({
  open, onClose, options,
}: { open: boolean; onClose: () => void; options: Partial<CartDrawerOptions> }) {
  const o = { ...DRAWER_DEFAULTS, ...options }

  // Open and shut are one class on a panel that stays mounted, not a mount and
  // an unmount: a panel that only exists while it is open has nothing to animate
  // from on the way in, and nothing left to animate on the way out. The widget
  // only renders this component once the shopper has opened the basket at all,
  // so nothing is in the DOM until it is wanted.
  const panelRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  const [lines, setLines] = useState<ValidatedLine[]>([])
  const [notes, setNotes] = useState<string[]>([])
  const [currencySymbol, setCurrencySymbol] = useState('£')
  // How this shop is transacted with (see lib/commerce-mode-shared.ts). Shop's
  // own basket-and-checkout until the config lands.
  const [commerce, setCommerce] = useState(SHOP_DEFAULT_COMMERCE_MODE)
  const [hasLoaded, setHasLoaded] = useState(false)
  const { toast, removeLine, removeLines, undo } = useCartUndo(true)
  // The line whose remove is waiting on the "its accessories too?" question -
  // same behaviour as the cart page, phrased to fit the panel.
  const [confirmingKey, setConfirmingKey] = useState<string | null>(null)

  // The portal target. Safe to read while rendering because this component is
  // only ever reached through a client-side dynamic import with ssr:false (see
  // CartSummaryClient) - it never renders on the server, so there is no markup
  // for this to disagree with.
  const host = typeof document === 'undefined' ? null : document.body

  // Escape closes, Tab stays inside, and the page behind stops scrolling while
  // the panel is up (the panel's own list scrolls instead).
  useEffect(() => {
    if (!open) return
    const panel = panelRef.current
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); return }
      if (panel) trapTab(panel, e)
    }
    document.addEventListener('keydown', onKeyDown, true)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      document.body.style.overflow = previousOverflow
    }
  }, [open, onClose])

  // Focus lands on the close button as the panel opens, so a keyboard or screen
  // reader user is inside the dialog rather than still back on the trigger.
  useEffect(() => {
    if (open) closeRef.current?.focus()
  }, [open])

  useEffect(() => {
    let cancelled = false
    fetch('/api/m/shop/public/config')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return
        setCurrencySymbol(data.currencySymbol)
        setCommerce(normaliseShopCommerceMode(data.commerce))
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  // Same validate the cart page runs, and the same guards: bootstrap from the
  // session's last validated copy for an instant first paint, and apply only the
  // newest response so flicking the delivery picker cannot land an earlier slow
  // one on top of a later choice.
  useEffect(() => {
    let cancelled = false
    let seq = 0
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
  }, [])

  // The delivery card's two unwrappable lines - the promised date, and the
  // service with its price - shrunk to fit the panel whenever they would
  // otherwise run past the edge of the card. The wording is the shop owner's and
  // the courier's, so no fixed size is safe for every basket: see fit-line.ts.
  // Re-measured whenever the cards' own content could have changed (a line in or
  // out, a service switched); the hook watches the panel's width itself.
  const deliveryRevision = `${open ? 'open' : 'shut'}:${lines
    .map((l) => `${lineKey(l)}|${l.control?.value ?? ''}`)
    .join(',')}`
  useFitLines(panelRef, '.scd-deliv .scl-s-top, .scd-deliv .scl-s-foot', deliveryRevision)

  // Picking a delivery option is applied to local state at once so the control
  // never snaps back, and when the options carry their numeric priceAdjust the
  // line price moves in the same instant; the re-validate then merely confirms
  // the figures rather than being what the shopper waits on.
  function onControl(id: string, key: string, value: string) {
    setLines((prev) => prev.map((l) => {
      if (lineKey(l) !== id || !l.control) return l
      const next = { ...l, control: { ...l.control, value } }
      const oldOpt = l.control.options.find((opt) => opt.value === l.control!.value)
      const newOpt = l.control.options.find((opt) => opt.value === value)
      if (typeof oldOpt?.priceAdjust === 'number' && typeof newOpt?.priceAdjust === 'number') {
        next.unitPrice = l.unitPrice - oldOpt.priceAdjust + newOpt.priceAdjust
        next.lineSubtotal = next.unitPrice * l.quantity
      }
      return next
    }))
    setLineMeta(id, { [key]: value })
  }

  if (!host) return null

  const money = (n: number) => commerceModeMoney(commerce, `${currencySymbol}${n.toFixed(2)}`)
  const subtotal = lines.reduce((sum, l) => sum + l.lineSubtotal, 0)
  const showImage = o.drawerShowImage !== 'no'
  const showDelivery = o.drawerShowDelivery !== 'no'

  const checkoutStyle: CSSProperties = {
    background: o.drawerCheckoutBg || 'var(--color-primary)',
    color: o.drawerCheckoutText || 'var(--color-on-primary)',
    borderRadius: o.drawerRadius,
  }
  const ghostStyle: CSSProperties = {
    color: o.drawerCheckoutBg || 'var(--color-primary)',
    borderRadius: o.drawerRadius,
  }

  const body = (() => {
    if (!hasLoaded) {
      return (
        <div style={{ display: 'grid', gap: '1.125rem' }} aria-busy="true" aria-label="Loading your basket">
          {[0, 1].map((i) => (
            <div key={i} style={{ display: 'flex', gap: '0.875rem', alignItems: 'center' }}>
              {showImage && <div className="skeleton" style={{ width: 64, height: 64, borderRadius: 6, flexShrink: 0 }} />}
              <div style={{ flex: 1, display: 'grid', gap: '0.4rem' }}>
                <div className="skeleton" style={{ height: 14, width: '70%' }} />
                <div className="skeleton" style={{ height: 12, width: '40%' }} />
              </div>
            </div>
          ))}
        </div>
      )
    }
    if (lines.length === 0) {
      return (
        <div className="scd-empty">
          <p style={{ margin: 0 }}>{o.drawerEmptyText}</p>
          <Link href="/shop" onClick={onClose}>{o.drawerContinueLabel}</Link>
        </div>
      )
    }
    // Attachments beneath their main, indented - same ordering the cart page
    // shows, from the same helper, so the two never disagree about a group.
    const displayLines = sortLinesByGroup(lines)
    return (
      <ul className="scd-list">
        {displayLines.map((line, index) => {
          const title = line.displayTitle?.name || line.name
          const secondary = line.displayTitle?.secondary
          const key = lineKey(line)
          const grp = effectiveGroup(line, lines)
          const attachment = grp && grp.role === 'attachment' ? grp : null
          const members = groupMemberKeys(line, lines, lineKey)
          const collective = line.group?.collectiveLabel || 'attached items'
          // No divider between a product and its own attachments - the group
          // reads as one entry, so the rule waits until the set ends.
          const next = displayLines[index + 1]
          const nextGroup = next ? effectiveGroup(next, lines) : null
          const joinsNext = !!grp && !!nextGroup && nextGroup.role === 'attachment' && nextGroup.key === grp.key
          return (
            <li
              key={key}
              className="scd-line"
              style={{
                ...(attachment ? { paddingLeft: `${0.875 + Math.max(0, (attachment.depth ?? 1) - 1) * 0.75}rem` } : {}),
                ...(joinsNext ? { borderBottom: 'none', paddingBottom: '0.375rem' } : {}),
              }}
            >
              {showImage && (line.imageUrl
                // eslint-disable-next-line @next/next/no-img-element -- module-supplied absolute media URL, not a build-time asset
                ? <img className="scd-thumb" src={line.imageUrl} alt="" width={64} height={64} style={{ borderRadius: 6 }} />
                : <div className="scd-thumb" aria-hidden style={{ width: 64, height: 64, borderRadius: 6 }} />)}
              <div className="scd-main">
                {attachment?.caption && (
                  <p className="scd-sec" style={{ margin: '0 0 0.125rem' }}><span aria-hidden="true">↳ </span>{attachment.caption}</p>
                )}
                <a className="scd-name" href={`/shop/products/${line.slug}`}>{title}</a>
                {secondary && <p className="scd-sec">{secondary}</p>}
                {!line.available && <p className="scd-warn">{line.availabilityReason || 'Unavailable'}</p>}
                {line.isPreOrder && <p className="scd-note">Pre-order</p>}
                <LineMetaList fields={productMetaFields(line.lineMeta?.fields ?? [], line.control)} />
              </div>
              {/* Price, quantity and Remove are one stacked column in the panel
                  rather than three grid areas of their own: they then share a
                  single track, so the stepper and the Remove link sit exactly as
                  wide as the price above them whatever the figure reads. */}
              <div className="scd-side">
                <span className="scd-price">{money(line.lineSubtotal)}</span>
                <div className="scd-qty">
                  <QuantityStepper
                    value={line.quantity}
                    label={`Quantity for ${title}`}
                    min={minOrderQuantity(line.minOrderQuantity)}
                    onChange={(next) => setLineQuantity(key, Math.max(0, next))}
                  />
                </div>
                <button
                  type="button" className="scd-removetxt" aria-label={`Remove ${title}`}
                  onClick={() => (members.length > 1 ? setConfirmingKey(key) : removeLine(key, title))}
                >
                  Remove
                </button>
              </div>
              {confirmingKey === key && members.length > 1 && (
                <div
                  role="group" aria-label={`Remove its ${collective} too?`}
                  style={{ gridColumn: '1 / -1', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.4rem', padding: '0.45rem 0.6rem', borderRadius: 8, background: 'var(--color-bg-subtle)', border: '1px solid var(--color-border)', fontSize: '0.8rem' }}
                >
                  <span>Remove its {collective} too?</span>
                  <button type="button" onClick={() => { setConfirmingKey(null); removeLines(members, `Removed ${title} and its ${collective}.`) }} style={{ background: 'var(--color-primary)', color: 'var(--color-on-primary)', border: 'none', borderRadius: 6, padding: '0.25rem 0.6rem', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>
                    Yes, remove everything
                  </button>
                  <button type="button" onClick={() => { setConfirmingKey(null); removeLine(key, title) }} style={{ background: 'var(--color-surface)', color: 'var(--color-text)', border: '1px solid var(--color-border)', borderRadius: 6, padding: '0.25rem 0.6rem', cursor: 'pointer', fontSize: '0.8rem' }}>
                    No, keep them
                  </button>
                  <button type="button" aria-label="Cancel removing" onClick={() => setConfirmingKey(null)} style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', fontSize: '0.8rem' }}>
                    Cancel
                  </button>
                </div>
              )}
              {/* Full width beneath the thumbnail and the name, not beside them:
                  a delivery tier's options are the widest thing on a line and a
                  420px panel has no side column to spare for them. */}
              {showDelivery && line.control && line.control.options.length > 0 && (
                <div className="scd-deliv">
                  <CartLineControlView
                    control={line.control}
                    groupName={`drawer:${key}:${line.control.key}`}
                    summaryLayout="stacked"
                    onChange={(value) => onControl(key, line.control!.key, value)}
                  />
                </div>
              )}
            </li>
          )
        })}
      </ul>
    )
  })()

  return createPortal(
    <>
      <style dangerouslySetInnerHTML={{ __html: CART_LINE_CSS + CART_DRAWER_CSS }} />
      {/* Pointer dismissal only - the same job is done for the keyboard by
          Escape, so this needs no role of its own. */}
      <div className={`scd-overlay${open ? ' scd-in' : ''}`} onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        className={`scd-panel scd-${o.drawerSide === 'left' ? 'left' : 'right'}${open ? ' scd-in' : ''}`}
        style={{ ['--scd-w' as string]: `${o.drawerWidth || DRAWER_DEFAULTS.drawerWidth}px` }}
        role="dialog"
        aria-modal="true"
        aria-label={o.drawerHeading}
      >
        <div className="scd-head">
          <h2 className="scd-title">{o.drawerHeading}</h2>
          <button ref={closeRef} type="button" className="scd-close" aria-label="Close basket" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>

        <div className="scd-body">{body}</div>

        {hasLoaded && lines.length > 0 && (
          <div className="scd-foot">
            <div className="scd-sub">
              <span>{o.drawerSubtotalLabel}</span>
              <span>{money(subtotal)}</span>
            </div>
            {/* Whole-basket lines other modules contributed to this validate (a
                delivery module's "everything by Fri 4 Sep"). Shop displays them,
                it never composes them. */}
            {notes.length > 0 && (
              <ul className="scd-notes">
                {notes.map((note, i) => (
                  <li key={i}><TickIcon />{note}</li>
                ))}
              </ul>
            )}
            <Link href={commerce.cartCtaHref} className="scd-btn" style={checkoutStyle} onClick={onClose}>
              {commerceModeButtonLabel(commerce.cartCtaLabel, o.drawerCheckoutLabel, DRAWER_DEFAULTS.drawerCheckoutLabel)}
            </Link>
            {o.drawerViewCartLabel && (
              <Link href="/shop/cart" className="scd-ghost" style={ghostStyle} onClick={onClose}>
                {o.drawerViewCartLabel}
              </Link>
            )}
          </div>
        )}

        <p style={SR_ONLY} aria-live="polite">
          {hasLoaded ? `${lines.reduce((s, l) => s + l.quantity, 0)} items in your basket` : ''}
        </p>
      </div>
      {/* The toast is wrapped in a stacking context of its own so it sits over
          the panel and its overlay rather than under them. */}
      {open && toast && (
        <div style={{ position: 'relative', zIndex: 950 }}>
          <CartUndoToast message={toast.message} leaving={toast.leaving} bottom={28} onUndo={undo} />
        </div>
      )}
    </>,
    host,
  )
}
