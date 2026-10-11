'use client'

import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { AdminTooltip } from '@/components/admin/Tooltip'
import { MoreIcon } from '@/modules/shop/components/admin/order-icons'

/** One row of the menu. `separated` rules it off from the rows above it - the
 *  inbox's way of putting the weightier things (money, here) a step apart. */
export type OrderMoreItem = { key: string; label: string; onSelect: () => void; separated?: boolean }

// The three dots at the end of the order's action row, and the actions wanted
// now and then rather than every day. Drawn to match the inbox's own "more"
// menu - the same glass panel, plain rows, arrow keys walking them - so the
// two screens people keep open side by side behave as one. A button and a
// panel rather than a <details>, because a <details> stays open when you press
// elsewhere, and a menu that has to be closed by hand is a menu left open.
export function OrderMoreMenu({ items }: { items: OrderMoreItem[] }) {
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    // Focus lands on the first row, so the arrow keys have somewhere to start.
    panel.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus()
    function onPointer(e: PointerEvent) {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      setOpen(false)
      trigger.current?.focus()
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  function walk(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Home' && e.key !== 'End') return
    const rows = Array.from(panel.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])
    if (rows.length === 0) return
    e.preventDefault()
    const at = rows.indexOf(document.activeElement as HTMLButtonElement)
    const next = e.key === 'Home' ? 0
      : e.key === 'End' ? rows.length - 1
        : e.key === 'ArrowDown' ? (at + 1) % rows.length
          : (at - 1 + rows.length) % rows.length
    rows[next]?.focus()
  }

  if (items.length === 0) return null

  return (
    <div className="sod-more" ref={wrap}>
      <AdminTooltip body="More actions" disabled={open}>
        <button
          ref={trigger}
          type="button"
          className="sod-icon-btn"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((was) => !was)}
        >
          {MoreIcon}
          <span className="sr-only">More actions</span>
        </button>
      </AdminTooltip>
      {open && (
        <div className="sod-menu" role="menu" aria-label="More actions" ref={panel} onKeyDown={walk}>
          {items.map((item, i) => (
            <div key={item.key} style={{ display: 'contents' }}>
              {item.separated && i > 0 && <div className="sod-menu-sep" role="separator" />}
              <button
                type="button"
                role="menuitem"
                className="sod-menu-item"
                onClick={() => { setOpen(false); item.onSelect() }}
              >
                {item.label}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
