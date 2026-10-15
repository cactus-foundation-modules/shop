'use client'

import { startTransition, useRef, useState, type ReactNode } from 'react'

// The sticky category pills above a product grid. The server hands over the
// unfiltered cards it already rendered plus one server function; a pill swaps in
// the cards the server renders for that category. Cards stay server-rendered React
// nodes (the card carries client islands that markup would leave dead), so this
// only decides which set is on screen.
//
// Fetched sets are remembered, so flicking back to a pill already visited is
// instant and costs the server nothing.
export type ShopGridCategoryPill = { slug: string; name: string }

export type ShopGridCategoryBarProps = {
  allLabel: string
  categories: ShopGridCategoryPill[]
  /** Cards for the unfiltered shelf, already rendered by the server. */
  allCards: ReactNode[]
  /** Server function: the cards for one category slug. Passed as a prop, not
   *  imported, so this file never has an edge to the database. */
  loadCategory: (slug: string | null) => Promise<ReactNode[]>
  gridClassName: string
  gridStyle?: React.CSSProperties
  emptyText: string
  /** Gap left under a fixed site header, in px. */
  stickyTop: number
}

export function ShopGridCategoryBar({ allLabel, categories, allCards, loadCategory, gridClassName, gridStyle, emptyText, stickyTop }: ShopGridCategoryBarProps) {
  const [active, setActive] = useState<string | null>(null)
  const [cards, setCards] = useState<ReactNode[]>(allCards)
  const [busy, setBusy] = useState(false)
  const cache = useRef(new Map<string, ReactNode[]>([['', allCards]]))
  // Latest click wins: a slow answer for a pill the shopper has already left must
  // not overwrite the one they are now looking at.
  const latest = useRef('')

  function choose(slug: string | null) {
    const key = slug ?? ''
    latest.current = key
    setActive(slug)
    const hit = cache.current.get(key)
    if (hit) {
      setBusy(false)
      setCards(hit)
      return
    }
    setBusy(true)
    loadCategory(slug)
      .then((next) => {
        cache.current.set(key, next)
        if (latest.current !== key) return
        startTransition(() => {
          setCards(next)
          setBusy(false)
        })
      })
      .catch(() => {
        if (latest.current === key) setBusy(false)
      })
  }

  const barStyle = { ['--shop-catbar-top' as string]: `${stickyTop}px` } as React.CSSProperties

  return (
    <div className="shop-catbar-wrap" style={barStyle}>
      <nav className="shop-catbar" aria-label="Filter products by category">
        <button type="button" className="shop-catbar-pill" aria-pressed={active === null} onClick={() => choose(null)}>{allLabel}</button>
        {categories.map((c) => (
          <button key={c.slug} type="button" className="shop-catbar-pill" aria-pressed={active === c.slug} onClick={() => choose(c.slug)}>{c.name}</button>
        ))}
      </nav>
      <div className="shop-catbar-body" aria-live="polite" aria-busy={busy}>
        {cards.length === 0 ? (
          <p style={{ color: 'var(--color-text-muted)' }}>{emptyText}</p>
        ) : (
          <div className={gridClassName} style={gridStyle}>{cards}</div>
        )}
      </div>
    </div>
  )
}
