'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { getCart, subscribeCart } from '@/modules/shop/components/public/cart'
import { postCartValidate } from '@/modules/shop/components/public/validated-cache'
import { batchLines } from '@/modules/shop/lib/cart-group'
import type { LineMeta } from '@/modules/shop/lib/types'
import { fetchShopPublicConfig } from '@/modules/shop/lib/public-config-client'
import { CartNotes } from '@/modules/shop/components/public/CartNotes'
import { CHECKOUT_NOTE_DEFAULTS, pickCartNoteOptions, type CartNoteOptions } from '@/modules/shop/components/public/cart-note-options'

type ValidatedLine = {
  productId: string
  lineId: string | null
  name: string
  slug: string
  quantity: number
  unitPrice: number
  lineSubtotal: number
  available: boolean
  availabilityReason: string | null
  imageUrl: string | null
  lineMeta: LineMeta | null
  displayTitle: { name: string; secondary?: string } | null
}

type Note = { id: string; text: string }

// Static stand-in lines for the layout editor, where there is no real basket to
// validate. Never rendered on the storefront.
const SAMPLE_LINES: ValidatedLine[] = [
  {
    productId: 'sample-1', lineId: 'sample-1', name: 'Walnut Desk', slug: '#', quantity: 1,
    unitPrice: 349, lineSubtotal: 349, available: true, availabilityReason: null, imageUrl: null,
    lineMeta: {
      fields: [{ label: 'Delivery', value: 'Express Delivery - by Mon 11 Aug' }],
      batch: {
        id: '2026-08-11', sort: '2026-08-11', heading: 'Arrives by Mon 11 Aug',
        uniformHeading: 'Express Delivery - by Mon 11 Aug', detail: 'Express Delivery', fieldLabel: 'Delivery',
      },
    },
    displayTitle: null,
  },
  {
    productId: 'sample-2', lineId: 'sample-2', name: 'Operator Chair', slug: '#', quantity: 2,
    unitPrice: 129, lineSubtotal: 258, available: true, availabilityReason: null, imageUrl: null,
    lineMeta: {
      fields: [{ label: 'Delivery', value: 'Standard Delivery - by Thu 14 Aug' }],
      batch: {
        id: '2026-08-14', sort: '2026-08-14', heading: 'Arrives by Thu 14 Aug',
        uniformHeading: 'Standard Delivery - by Thu 14 Aug', detail: 'Standard Delivery', fieldLabel: 'Delivery',
      },
    },
    displayTitle: { name: 'Operator Chair', secondary: 'Black Fabric · Fixed Arms' },
  },
]

type ShopClientConfig = { currencySymbol: string }

export type CheckoutItemsOptions = {
  preview?: boolean
  // Off by default: in a single-column layout the summary sits ABOVE the steps
  // in the same flow, and a sticky element there would slide down over them.
  // Turn it on when the block has a column to itself (the Two Column starter's
  // left half), where it keeps the order in view while the fields scroll.
  sticky?: 'on' | 'off'
  // CSS length the sticky summary keeps clear of the top - set it to the site
  // header's height plus breathing room when the header is sticky too.
  stickyOffset?: string
  // Whether a long order scrolls inside the block instead of running down the
  // page. 'auto' (the default) and 'off' both let it run down the page: a
  // sticky block taller than the window pins by its foot (see SCI_CSS below),
  // so every item is reachable by ordinary page scrolling and a cap would only
  // put a second scrollbar inside the first. 'on' is for the owner who wants a
  // compact box regardless, scrolled with the pointer over it.
  scroll?: 'auto' | 'on' | 'off'
  // CSS length capping the scrolling list; empty means as tall as the window
  // allows under the sticky offset. Only read when the list actually scrolls.
  scrollHeight?: string
  // Wording overrides; absent = the historical strings.
  heading?: string
  editLabel?: string
  // Look of the whole-basket note - see components/public/cart-note-options.ts.
} & Partial<CartNoteOptions>

// Sticky only above the cart breakpoint: below it the layout collapses to one
// column, where a sticky summary would ride down over the checkout fields.
// The toggle is the reverse - mobile only - where the summary starts collapsed
// so the shopper lands on the fields, with the order one tap away (the count
// and total stay visible in the heading either way). Injected <style> string,
// never a core globals.css edit, matching the cart's convention.
// The scroll cap is desktop-only for the same reason the stickiness is: below
// the breakpoint the page itself scrolls the summary, and a box scrolling inside
// a scrolling page is a trap for a thumb. Its default height leaves room for the
// heading, the item count and a little air beneath - the owner can name an exact
// height instead when their own header maths says otherwise.
// The list deliberately does NOT contain its overscroll: a pointer sitting over
// the summary is the common case on a two-column checkout, and containing it
// meant that reaching the end of the order list froze the page under the mouse.
// Chaining on means the wheel runs the list to its end and then carries on down
// the page, taking the summary with it - one continuous scroll either way.
// An order taller than the window pins by its FOOT, not its head. The `top` is
// the nearer of the owner's offset and `100vh - the block's own height - 1rem`:
// a summary that fits under the header pins where it always did, and a longer
// one simply flows with the page - every item revealed by ordinary scrolling -
// until its last line is just above the bottom edge, and pins there. Nothing
// here reserves page height, measures the column next door, or moves anything
// by transform. A previous version did all three (a measured `--sci-fill`
// floor, a scroll handler feeding the page's scroll into the list, and a
// translateY hold on the form column), and every one of them was a drift
// source: the held transform outlived its measurements, painting the form over
// the footer and stretching the document's scrollable overflow past it - the
// "scrolls past the footer" bug - and a list scrolled directly under the
// pointer desynced the hand-over so the whole screen froze mid-wheel. The
// block's own height is the only thing measured now, and only into `--sci-h`.
const SCI_CSS = `
.sci-toggle{display:none;border:none;background:none;color:var(--color-primary);font-size:0.875rem;cursor:pointer;padding:0}
@media (min-width: 641px){
  .sci-sticky{position:sticky;top:min(var(--sci-top,1rem),calc(100vh - var(--sci-h,0px) - 1rem))}
  .sci-scrolls .sci-body{max-height:var(--sci-max,calc(100vh - var(--sci-top,1rem) - 6rem));overflow-y:auto;overscroll-behavior-y:auto;padding-right:0.5rem;scrollbar-width:thin;scrollbar-color:var(--color-border) transparent}
  .sci-scrolls .sci-body::-webkit-scrollbar{width:8px}
  .sci-scrolls .sci-body::-webkit-scrollbar-thumb{background:var(--color-border);border-radius:4px}
}
@media (max-width: 640px){
  .sci-toggle{display:inline-block}
  .sci-collapsed .sci-body{display:none}
}
`

// Client island for the checkout order summary: the basket lines themselves,
// each with its quantity, price and per-line choices - including the chosen
// delivery service and promised date a cart-line resolver persisted into
// lineMeta.fields. The review block stays a totals table; this block is the
// "what am I actually buying, and how does each thing arrive" half, so a
// shopper never has to trek back to the basket to check.
//
// Registered Puck block wrapper (ShopCheckoutItems) is a server component that
// renders this, so Puck's RSC <Render> never serialises its renderDropZone
// function bag into the client.
export function CheckoutItemsClient({ preview = false, sticky = 'off', stickyOffset = '1rem', scroll = 'auto', scrollHeight, heading, editLabel, ...noteProps }: CheckoutItemsOptions) {
  const headingText = heading || 'Your order'
  const scrolls = scroll === 'on'
  const sectionRef = useRef<HTMLElement | null>(null)
  const [lines, setLines] = useState<ValidatedLine[] | null>(null)
  // Seeded in the editor so an author can see the note they are styling - the
  // sample basket never reaches a validate, so no module contributes one.
  const [notes, setNotes] = useState<Note[]>(preview ? [{ id: 'sample', text: 'Everything gets to you by Tue 12 Aug' }] : [])
  const [symbol, setSymbol] = useState('£')
  const [empty, setEmpty] = useState(false)
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    fetchShopPublicConfig<ShopClientConfig>().then((c) => {
      if (c?.currencySymbol) setSymbol(c.currencySymbol)
    }).catch(() => {})
  }, [])

  // Collapsed by default on a phone only, decided once at mount - the fields
  // are what a mobile shopper is here to fill in, and the heading keeps the
  // count and total visible while the list is folded away.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- seeding from matchMedia must wait for the client; a lazy initialiser would mismatch the SSR markup
    if (!preview && window.matchMedia('(max-width: 640px)').matches) setCollapsed(true)
  }, [preview])

  // Feeds the block's own height into `--sci-h`, which is the only measurement
  // stickiness needs: the CSS above pins a summary taller than the window by
  // its foot instead of its head, and CSS cannot ask an element how tall it is.
  // Nothing else on the page is observed, held, or reserved - the block sits in
  // normal flow at its natural height, so it can neither lengthen the document
  // past the footer nor paint anything over it.
  useEffect(() => {
    if (sticky !== 'on') return
    const el = sectionRef.current
    if (!el) return
    const set = () => el.style.setProperty('--sci-h', `${Math.ceil(el.offsetHeight)}px`)
    set()
    // The order changes height - a basket edited in another tab, an arrival
    // heading appearing once delivery is worked out - and the pin point is
    // stale the moment it does. Changing `top` never changes the element's
    // size, so this cannot feed itself.
    const observer = new ResizeObserver(set)
    observer.observe(el)
    return () => {
      observer.disconnect()
      el.style.removeProperty('--sci-h')
    }
  }, [sticky, lines, collapsed])

  useEffect(() => {
    let cancelled = false
    function load() {
      const cart = getCart()
      if (cart.length === 0) {
        if (preview) { setLines(SAMPLE_LINES); setEmpty(false); return }
        setLines(null)
        setEmpty(true)
        return
      }
      setEmpty(false)
      postCartValidate<ValidatedLine>(cart).then((res) => {
        if (cancelled || !res) return
        setLines(res.lines)
        setNotes(res.notes ?? [])
      })
    }
    load()
    const unsubscribe = subscribeCart(load)
    return () => { cancelled = true; unsubscribe() }
  }, [preview])

  const money = (n: number) => `${symbol}${n.toFixed(2)}`

  if (empty) {
    return (
      <section style={{ display: 'grid', gap: '0.75rem' }}>
        <h2 style={{ fontSize: '1.125rem', margin: 0 }}>{headingText}</h2>
        <p style={{ color: 'var(--color-text-muted)', margin: 0 }}>
          Your basket is empty. <Link href="/shop" style={{ color: 'var(--color-primary)' }}>Continue shopping</Link>
        </p>
      </section>
    )
  }
  if (!lines) return null

  // The cart held lines but none still resolve to a live product - everything
  // in it has been removed from the catalogue since. Say so, rather than a
  // bare "Your order" heading over nothing.
  if (lines.length === 0) {
    return (
      <section style={{ display: 'grid', gap: '0.75rem' }}>
        <h2 style={{ fontSize: '1.125rem', margin: 0 }}>{headingText}</h2>
        <p style={{ color: 'var(--color-text-muted)', margin: 0 }}>
          The items in your basket are no longer available.{' '}
          <Link href="/shop" style={{ color: 'var(--color-primary)' }}>Continue shopping</Link>
        </p>
      </section>
    )
  }

  const itemCount = lines.reduce((sum, line) => sum + line.quantity, 0)
  const goodsTotal = lines.reduce((sum, line) => sum + line.lineSubtotal, 0)
  const batches = batchLines(lines.map((l) => ({ ...l, group: l.lineMeta?.group ?? null, batch: l.lineMeta?.batch ?? null })))

  return (
    // No max-width of its own: the block fills whatever column its layout gives
    // it - a sidebar, a split's left half, or a narrow section.
    <section
      ref={sectionRef}
      className={`${sticky === 'on' ? 'sci-sticky' : ''}${scrolls ? ' sci-scrolls' : ''}${collapsed ? ' sci-collapsed' : ''}`}
      style={{
        display: 'grid',
        gap: '0.75rem',
        '--sci-top': stickyOffset,
        ...(scrollHeight ? { '--sci-max': scrollHeight } : {}),
      } as React.CSSProperties}
    >
      <style>{SCI_CSS}</style>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '1rem' }}>
        <h2 style={{ fontSize: '1.125rem', margin: 0 }}>{headingText}</h2>
        <span style={{ display: 'flex', gap: '0.75rem', alignItems: 'baseline' }}>
          <button type="button" className="sci-toggle" aria-expanded={!collapsed} onClick={() => setCollapsed((c) => !c)}>
            {collapsed ? 'Show' : 'Hide'}
          </button>
          {/* Changes happen in the basket, not here - checkout stays a straight
              line and the basket keeps its pickers, quantities and undo. */}
          <Link href="/shop/cart" style={{ color: 'var(--color-primary)', fontSize: '0.875rem' }}>{editLabel || 'Edit basket'}</Link>
        </span>
      </div>
      <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem', margin: 0 }}>
        {itemCount} {itemCount === 1 ? 'item' : 'items'} · {money(goodsTotal)}
      </p>
      <div className="sci-body" style={{ display: 'grid', gap: '1rem' }}>
        {/* One list per arrival, soonest first, with everything that lands
            together under its own heading - via the persisted meta's batch, so
            shop states what it was handed and never dates anything itself.
            Inside a batch, grouped lines (a product and its accessories) keep
            the order the basket showed them in. */}
        {batches.map((batch) => (
          <div key={batch.id || '_unbatched'} style={{ display: 'grid', gap: '0.5rem' }}>
            {batch.heading && (
              <h3 className="sci-batch" style={{ margin: 0, fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-primary)' }}>
                {batch.heading}
              </h3>
            )}
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.75rem' }}>
              {batch.lines.map((line) => {
                const title = line.displayTitle?.name ?? line.name
                const caption = line.group?.role === 'attachment' ? line.group.caption : undefined
                // A line sitting in its own batch has already been spoken for by
                // the heading above (and, in a mixed batch, by its own detail
                // beneath), so the field that says the same thing is dropped -
                // the resolver names that field itself, so shop is never guessing
                // which row to drop. A line carried in behind its main keeps
                // every field it has: nothing up there was said about it.
                const own = line.batch?.id === batch.id ? line.batch : null
                const fields = (line.lineMeta?.fields ?? []).filter((f) => !own || !batch.fieldLabel || f.label !== batch.fieldLabel)
                const detail = !batch.uniform ? own?.detail : undefined
                return (
                  <li key={line.lineId ?? line.productId} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: '0.75rem', alignItems: 'start', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.75rem' }}>
                    {line.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- module-supplied absolute media URL, not a build-time asset
                      <img src={line.imageUrl} alt="" width={56} height={56} style={{ borderRadius: 6, objectFit: 'cover', background: 'var(--color-bg-subtle)' }} />
                    ) : (
                      <span aria-hidden style={{ width: 56, height: 56, borderRadius: 6, background: 'var(--color-bg-subtle)', display: 'block' }} />
                    )}
                    <div style={{ display: 'grid', gap: '0.125rem', minWidth: 0 }}>
                      {caption && (
                        <span style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem' }}><span aria-hidden="true">↳ </span>{caption}</span>
                      )}
                      <span style={{ fontWeight: 600 }}>{title}</span>
                      {line.displayTitle?.secondary && (
                        <span style={{ color: 'var(--color-text-muted)', fontSize: '0.8125rem' }}>{line.displayTitle.secondary}</span>
                      )}
                      <span style={{ color: 'var(--color-text-muted)', fontSize: '0.8125rem' }}>Qty {line.quantity}</span>
                      {/* One date, more than one service: the heading can only
                          state the date, so each line says which service it is
                          on. In a batch where they all agree, the heading has
                          said it once and this is absent. */}
                      {detail && (
                        <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.8125rem' }}>{detail}</span>
                      )}
                      {/* Per-line choices a resolver persisted, minus the one the
                          heading above already carries. */}
                      {fields.map((field) => (
                        <span key={`${field.label}:${field.value}`} style={{ color: 'var(--color-text-secondary)', fontSize: '0.8125rem' }}>
                          {field.label}: {field.value}
                        </span>
                      ))}
                      {!line.available && (
                        <span style={{ color: 'var(--color-danger)', fontSize: '0.8125rem' }}>{line.availabilityReason ?? 'No longer available'}</span>
                      )}
                    </div>
                    <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{money(line.lineSubtotal)}</span>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
        {/* Whole-basket notes another module contributed to this validate.
            Shop displays them, it never composes them - only how they look is
            the block's business. */}
        <CartNotes notes={notes.map((note) => note.text)} options={{ ...CHECKOUT_NOTE_DEFAULTS, ...pickCartNoteOptions(noteProps) }} />
      </div>
    </section>
  )
}
