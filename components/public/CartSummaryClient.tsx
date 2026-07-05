'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getCart, subscribeCart } from '@/modules/shop/components/public/cart'

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
}

const DEFAULTS: CartSummaryOptions = {
  icon: 'cart', iconSize: 20, iconColour: '', label: '',
  variant: 'bordered', bgColour: '', borderColour: '', textColour: '', borderRadius: 8,
  showCount: 'yes', countStyle: 'badge', itemWord: 'item', itemWordPlural: 'items',
  badgeBg: 'var(--color-primary)', badgeText: 'var(--color-on-primary)', hideBadgeWhenZero: 'yes',
  showSubtotal: 'no', hideWhenEmpty: 'no',
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

  useEffect(() => {
    if (preview) return
    let cancelled = false

    async function refresh() {
      const lines = getCart()
      setCount(lines.reduce((sum, l) => sum + l.quantity, 0))
      if (lines.length === 0) { setSubtotal(0); return }

      const [validateRes, configRes] = await Promise.all([
        fetch('/api/m/shop/public/cart/validate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lines }) }),
        fetch('/api/m/shop/public/config'),
      ])
      if (cancelled) return
      if (validateRes.ok) {
        const data = await validateRes.json()
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

  if (!preview && o.hideWhenEmpty === 'yes' && count === 0) return null

  const showBadge = o.showCount === 'yes' && o.countStyle === 'badge' && o.icon !== 'none'
    && !(count === 0 && o.hideBadgeWhenZero === 'yes')
  // With no icon there's nothing to pin a badge to, so any count falls back to inline text.
  const showInlineCount = o.showCount === 'yes' && (o.countStyle === 'inline' || o.icon === 'none')

  const padding = o.variant === 'plain' ? '0' : '0.5rem 0.875rem'
  const background = o.variant === 'filled'
    ? (o.bgColour || 'var(--color-surface)')
    : (o.variant === 'bordered' ? (o.bgColour || 'transparent') : 'transparent')
  const border = o.variant === 'bordered' ? `1px solid ${o.borderColour || 'var(--color-border)'}` : 'none'

  return (
    <Link
      href="/shop/cart"
      aria-label="View cart"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '0.5rem', textDecoration: 'none',
        color: o.textColour || 'var(--color-text)', background, border,
        borderRadius: o.borderRadius, padding, lineHeight: 1,
      }}
    >
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
    </Link>
  )
}
