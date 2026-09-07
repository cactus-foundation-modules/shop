'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { getCart, subscribeCart } from '@/modules/shop/components/public/cart'
import { DRAWER_DEFAULTS } from '@/modules/shop/components/public/cart-drawer-options'
import type { ModuleMobileBarItemProps } from '@/lib/puck/mobileBar'

// The shop's cell in core's Mobile Bar (`core.mobile-bar-items`): a basket icon
// with a live count on it, opening the basket panel up from the bottom of the
// screen, full width.
//
// It draws none of its own chrome. The .cmb-* classes are core's, published by
// the bar itself, so this button is exactly the size, colour and shape of the
// Home and Menu cells beside it with nothing coordinated between the two. All
// this file owns is the icon, the number on it and what a press does.
//
// The panel is the same CartDrawerClient the header widget opens - same lines,
// same delivery pickers, same notes - loaded on the first press rather than on
// every page, because most visitors never open it. It is opened with the panel's
// stock wording: a bar cell has no settings panel of its own to dress it from,
// which is the trade for a cell that needs no setting up at all.
const CartDrawer = dynamic(
  () => import('@/modules/shop/components/public/CartDrawerClient').then((m) => m.CartDrawerClient),
  { ssr: false },
)

function BasketIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="9" cy="20" r="1.5" />
      <circle cx="18" cy="20" r="1.5" />
      <path d="M2 3h3l2.6 12.1a1.5 1.5 0 0 0 1.5 1.2h8.2a1.5 1.5 0 0 0 1.5-1.2L21 7H6" />
    </svg>
  )
}

export function CartMobileBarItem({ label, showLabels }: ModuleMobileBarItemProps) {
  const [count, setCount] = useState(0)
  // Fetched on the first press and then kept, so a second press has no beat of
  // nothing while the chunk loads. Same two-flag arrangement the header widget
  // uses, and for the same reason.
  const [open, setOpen] = useState(false)
  const [requested, setRequested] = useState(false)

  useEffect(() => {
    const refresh = () => setCount(getCart().reduce((sum, line) => sum + line.quantity, 0))
    refresh()
    return subscribeCart(refresh)
  }, [])

  const caption = (label || '').trim()

  return (
    <>
      <button
        type="button"
        className="cmb-item"
        aria-label={caption || 'Basket'}
        aria-expanded={open}
        onClick={() => { setRequested(true); setOpen(true) }}
      >
        <span className="cmb-icon">
          <BasketIcon />
          {count > 0 && <span className="cmb-badge">{count > 99 ? '99+' : count}</span>}
        </span>
        {showLabels === 'yes' && caption ? <span className="cmb-label">{caption}</span> : null}
      </button>
      {requested && (
        <CartDrawer
          open={open}
          onClose={() => setOpen(false)}
          options={{ ...DRAWER_DEFAULTS, drawerSide: 'bottom' }}
        />
      )}
    </>
  )
}
