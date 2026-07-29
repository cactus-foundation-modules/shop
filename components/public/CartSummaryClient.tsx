'use client'

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { usePathname } from 'next/navigation'
import { getCart, subscribeCart, subscribeCartAdd } from '@/modules/shop/components/public/cart'
import { postCartValidate } from '@/modules/shop/components/public/validated-cache'
import { DRAWER_DEFAULTS, type CartDrawerOptions } from '@/modules/shop/components/public/cart-drawer-options'

// The panel is a whole cart renderer - lines, delivery pickers, the undo toast
// and the shared cart stylesheet - and most visitors never open it. Loading it
// on first click keeps all of that out of the bundle every page pays for just to
// show a cart icon in the header. `ssr: false` because it only ever exists in
// response to a click, so there is nothing to render on the server.
const CartDrawer = dynamic(
  () => import('@/modules/shop/components/public/CartDrawerClient').then((m) => m.CartDrawerClient),
  { ssr: false },
)

// Look/behaviour options for the header cart-summary widget. The block
// (ShopCartSummary) wires these in as plain Puck props; every value has a sane
// default so the widget still renders if handed a partial bag.
export type CartSummaryOptions = {
  icon: 'cart' | 'bag' | 'basket' | 'tag' | 'none'
  iconSize: number
  iconColour: string
  label: string
  variant: 'bordered' | 'filled' | 'plain'
  bgColour: string
  borderColour: string
  textColour: string
  borderRadius: number
  showCount: 'yes' | 'no'
  countStyle: 'badge' | 'inline'
  itemWord: string
  itemWordPlural: string
  badgeBg: string
  badgeText: string
  hideBadgeWhenZero: 'yes' | 'no'
  showSubtotal: 'yes' | 'no'
  hideWhenEmpty: 'yes' | 'no'
  // Frontend audience. 'everyone' shows the widget to all visitors; 'admin' hides
  // it from the public and only renders it when a site admin is signed in. The
  // gate is enforced server-side (ShopCartSummary.rsc), never here - this island
  // is client-only and its markup is trivially inspectable, so it can't be a
  // security boundary. This field is carried purely so the type stays complete.
  // NB: NOT named `visibility` - core injects a responsive-visibility field of
  // that exact name into every Puck block and strips it from render props, which
  // silently swallowed the gate. See ShopCartSummary.rsc.
  audience: 'everyone' | 'admin'
  // What clicking the widget does. 'link' goes to the cart page, exactly as this
  // widget always has. 'drawer' keeps the shopper where they are and slides the
  // basket in over the page instead - same lines, same delivery pickers, same
  // whole-basket notes as the cart page, plus a way through to it.
  clickAction: 'link' | 'drawer'
} & CartDrawerOptions

const DEFAULTS: CartSummaryOptions = {
  icon: 'cart', iconSize: 20, iconColour: '', label: '',
  variant: 'bordered', bgColour: '', borderColour: '', textColour: '', borderRadius: 8,
  showCount: 'yes', countStyle: 'badge', itemWord: 'item', itemWordPlural: 'items',
  badgeBg: 'var(--color-primary)', badgeText: 'var(--color-on-primary)', hideBadgeWhenZero: 'yes',
  showSubtotal: 'no', hideWhenEmpty: 'no', audience: 'everyone',
  clickAction: 'link', ...DRAWER_DEFAULTS,
}

// Stroked line icons (feather / lucide geometry), drawn in currentColor so they
// inherit the widget's text colour unless an explicit icon colour is set.
function CartIcon({ name, size, colour }: { name: CartSummaryOptions['icon']; size: number; colour: string }) {
  if (name === 'none') return null
  const common = {
    width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
    stroke: colour || 'currentColor', strokeWidth: 2,
    strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true,
  }
  switch (name) {
    case 'bag':
      return (<svg {...common}><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" /><path d="M3 6h18" /><path d="M16 10a4 4 0 0 1-8 0" /></svg>)
    case 'basket':
      return (<svg {...common}><path d="m5 11 4-7" /><path d="m19 11-4-7" /><path d="M2 11h20" /><path d="m3.5 11 1.6 7.4a2 2 0 0 0 2 1.6h9.8a2 2 0 0 0 2-1.6l1.7-7.4" /><path d="M4.5 15.5h15" /><path d="m9 11 1 9" /><path d="m15 11-1 9" /></svg>)
    case 'tag':
      return (<svg {...common}><path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82Z" /><path d="M7 7h.01" /></svg>)
    case 'cart':
    default:
      return (<svg {...common}><circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" /></svg>)
  }
}

// Client island for the header cart widget. Registered Puck block wrapper
// (ShopCartSummary) is a server component that renders this, so Puck's RSC
// <Render> never serialises its renderDropZone function bag into the client.
// In `preview` (editor) it seeds a sample cart so the widget shows populated
// without fetching; live, it reads the real cart from localStorage.
export function CartSummaryClient(opts: Partial<CartSummaryOptions> & { preview?: boolean }) {
  const o = { ...DEFAULTS, ...opts }
  const preview = opts.preview === true

  const [count, setCount] = useState(preview ? 3 : 0)
  const [subtotal, setSubtotal] = useState<number | null>(preview ? 42 : null)
  const [currencySymbol, setCurrencySymbol] = useState('£')
  const [hasLoaded, setHasLoaded] = useState(preview)
  // Drawer mode only. `drawerOpen` is the panel's state; `drawerRequested` stays
  // true once it has been opened at all, so the lazily-loaded panel is fetched on
  // the first click and then kept around (a shopper who opens the basket once
  // usually opens it again, and re-fetching the chunk each time would show a
  // beat of nothing).
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerRequested, setDrawerRequested] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const pathname = usePathname()
  // The cart page is the basket, in full, already on screen - a basket icon in
  // the header above it is one basket too many. Hidden on the page itself only;
  // checkout and everything else keep theirs. The editor always shows it, or the
  // block would vanish out of the header while that page is being designed.
  const onCartPage = !preview && (pathname === '/shop/cart' || pathname === '/shop/cart/')

  useEffect(() => {
    if (preview) return
    let cancelled = false

    async function refresh() {
      const lines = getCart()
      setCount(lines.reduce((sum, l) => sum + l.quantity, 0))
      setHasLoaded(true)
      if (lines.length === 0) { setSubtotal(0); return }

      // postCartValidate single-flights with any other cart island validating
      // the same cart in the same beat (the full cart page, say), so this badge
      // no longer doubles the server work on every cart event.
      const [data, configRes] = await Promise.all([
        postCartValidate<{ lineSubtotal: number }>(lines),
        fetch('/api/m/shop/public/config'),
      ])
      if (cancelled) return
      if (data) {
        setSubtotal(data.lines.reduce((sum: number, l: { lineSubtotal: number }) => sum + l.lineSubtotal, 0))
      }
      if (configRes.ok) {
        const config = await configRes.json()
        setCurrencySymbol(config.currencySymbol)
      }
    }

    refresh()
    const unsubscribe = subscribeCart(refresh)
    return () => { cancelled = true; unsubscribe() }
  }, [preview])

  // Adding something opens the panel on its own, so the shopper sees what they
  // have just done and can go straight to checkout without hunting for the
  // basket. Only in drawer mode (link mode has no panel to open), and only for
  // the widget the visitor can actually see: a theme with a desktop header and a
  // phone header renders this island twice, and the panel portals to
  // document.body, so a hidden copy reacting too would put two panels on screen.
  // The add is counted rather than acted on where it lands, because the same
  // event has just changed the count and a widget hidden while the basket was
  // empty is only in the DOM one render later. Deciding in an effect means the
  // visibility test looks at the button as it now is, not as it was.
  const [addSignal, setAddSignal] = useState(0)
  useEffect(() => {
    if (preview || o.clickAction !== 'drawer') return
    return subscribeCartAdd(() => setAddSignal((n) => n + 1))
  }, [preview, o.clickAction])
  useEffect(() => {
    if (addSignal === 0) return
    const trigger = triggerRef.current
    if (!trigger || trigger.offsetParent === null) return
    setDrawerRequested(true)
    setDrawerOpen(true)
  }, [addSignal])

  if (onCartPage) return null
  if (!preview && hasLoaded && o.hideWhenEmpty === 'yes' && count === 0) return null

  const showBadge = o.showCount === 'yes' && o.countStyle === 'badge' && o.icon !== 'none'
    && !(count === 0 && o.hideBadgeWhenZero === 'yes')
  // With no icon there's nothing to pin a badge to, so any count falls back to inline text.
  const showInlineCount = o.showCount === 'yes' && (o.countStyle === 'inline' || o.icon === 'none')

  const padding = o.variant === 'plain' ? '0' : '0.5rem 0.875rem'
  const background = o.variant === 'filled'
    ? (o.bgColour || 'var(--color-surface)')
    : (o.variant === 'bordered' ? (o.bgColour || 'transparent') : 'transparent')
  const border = o.variant === 'bordered' ? `1px solid ${o.borderColour || 'var(--color-border)'}` : 'none'

  const boxStyle: CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: '0.5rem', textDecoration: 'none',
    color: o.textColour || 'var(--color-text)', background, border,
    borderRadius: o.borderRadius, padding, lineHeight: 1,
  }

  const inner = (
    <>
      {o.icon !== 'none' && (
        <span style={{ position: 'relative', display: 'inline-flex' }}>
          <CartIcon name={o.icon} size={o.iconSize} colour={o.iconColour} />
          {showBadge && (
            <span
              aria-hidden
              style={{
                position: 'absolute', top: -8, right: -10, minWidth: 16, height: 16, padding: '0 4px',
                borderRadius: 999, background: o.badgeBg, color: o.badgeText, fontSize: 10, fontWeight: 700,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box',
              }}
            >
              {count}
            </span>
          )}
        </span>
      )}
      {o.label && <span>{o.label}</span>}
      {showInlineCount && <span>{count} {count === 1 ? o.itemWord : o.itemWordPlural}</span>}
      {o.showSubtotal === 'yes' && subtotal != null && (
        <span style={{ fontWeight: 600 }}>{currencySymbol}{subtotal.toFixed(2)}</span>
      )}
    </>
  )

  // Drawer mode: the same box, holding the same things, but it is now the control
  // that opens the slide-out basket rather than a link to the cart page. Both the
  // editor and the frontend render this button, so the two paths still emit the
  // same markup; only the editor's is inert, because a panel portalled to
  // document.body would cover the whole Puck canvas rather than the page it
  // belongs to.
  if (o.clickAction === 'drawer') {
    return (
      <>
        <button
          ref={triggerRef}
          type="button"
          aria-label="View basket"
          aria-haspopup="dialog"
          aria-expanded={drawerOpen}
          onClick={() => {
            if (preview) return
            setDrawerRequested(true)
            setDrawerOpen(true)
          }}
          style={{ ...boxStyle, font: 'inherit', cursor: preview ? 'default' : 'pointer', WebkitAppearance: 'none', appearance: 'none' }}
        >
          {inner}
        </button>
        {drawerRequested && (
          <CartDrawer
            open={drawerOpen}
            // Focus goes back to the widget that opened the panel, so a keyboard
            // shopper is put back where they were rather than at the top of the page.
            onClose={() => { setDrawerOpen(false); triggerRef.current?.focus() }}
            options={o}
          />
        )}
      </>
    )
  }

  return (
    <Link href="/shop/cart" aria-label="View cart" style={boxStyle}>
      {inner}
    </Link>
  )
}
