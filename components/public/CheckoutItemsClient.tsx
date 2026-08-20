'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { getCart, subscribeCart } from '@/modules/shop/components/public/cart'
import { postCartValidate } from '@/modules/shop/components/public/validated-cache'
import { batchLines } from '@/modules/shop/lib/cart-group'
import type { LineMeta } from '@/modules/shop/lib/types'

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
  // page. 'auto' (the default) means it does exactly when the block is sticky:
  // a stuck block taller than the window has its own foot below the fold and no
  // way to reach it, since the page scroll is moving the fields, not the block.
  // A block that is not sticky scrolls with the page as it always has, and
  // capping it there would only put a second scrollbar inside the first.
  scroll?: 'auto' | 'on' | 'off'
  // CSS length capping the scrolling list; empty means as tall as the window
  // allows under the sticky offset. Only read when the list actually scrolls.
  scrollHeight?: string
  // Wording overrides; absent = the historical strings.
  heading?: string
  editLabel?: string
}

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
// The wrapper is what buys the summary its own stretch of page. A pinned block
// only travels as far as its column is tall, and a checkout's form column stops
// where the Place order button does - so on a long order the last few items had
// nowhere left to be revealed, and carrying on scrolling simply took the whole
// checkout past into the footer. The wrapper claims the order's FULL natural
// height as a floor (`--sci-fill`, measured in the browser), so the column is
// always at least as tall as the list would be if it ran down the page. That
// reserved run is where the scroll handler below feeds the list, and it is the
// only reason the summary is still pinned when the form has run out.
// `height:100%` keeps the travel the column already had: without it the wrapper
// would be its own content's height and the summary would unpin somewhere up
// the form. The floor still counts towards how tall the row grows, which is the
// whole trick.
const SCI_CSS = `
.sci-toggle{display:none;border:none;background:none;color:var(--color-primary);font-size:0.875rem;cursor:pointer;padding:0}
@media (min-width: 641px){
  .sci-fill{height:100%;min-height:var(--sci-fill,0)}
  .sci-sticky{position:sticky;top:var(--sci-top,1rem)}
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
export function CheckoutItemsClient({ preview = false, sticky = 'off', stickyOffset = '1rem', scroll = 'auto', scrollHeight, heading, editLabel }: CheckoutItemsOptions) {
  const headingText = heading || 'Your order'
  const scrolls = scroll === 'on' || (scroll !== 'off' && sticky === 'on')
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const sectionRef = useRef<HTMLElement | null>(null)
  const bodyRef = useRef<HTMLDivElement | null>(null)
  const [lines, setLines] = useState<ValidatedLine[] | null>(null)
  const [notes, setNotes] = useState<Note[]>([])
  const [symbol, setSymbol] = useState('£')
  const [empty, setEmpty] = useState(false)
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    fetch('/api/m/shop/public/config').then((r) => r.json()).then((c: ShopClientConfig) => {
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

  // Hands the page's scroll to the order list once the form beside it has run
  // out. Two halves, and both are needed:
  //
  //  1. The floor. `--sci-fill` is set to the summary's pinned height plus
  //     whatever the list still has below its own fold, so the column reserves
  //     exactly enough page for every remaining item. Without it there is no
  //     scrolling left to hand over - the checkout would simply carry on into
  //     the footer with the summary's last items never seen, which is precisely
  //     what was reported.
  //  2. The hand-over. Over the LAST stretch of the column's travel - the bit
  //     the floor reserved, which is reached only once the form has finished -
  //     every pixel the page scrolls is passed to the list as well. The block
  //     is still pinned throughout, so nothing moves on screen except the order
  //     scrolling itself, and the moment the list runs out the block unpins and
  //     the page carries on to the footer as it always did.
  //
  // Deliberately driven by page scroll rather than by intercepting the wheel:
  // a trackpad, a touchscreen, the arrow keys and a dragged scrollbar all move
  // the page, and only one of them is a wheel. Nothing is preventDefault-ed, so
  // scrolling the list directly with the pointer over it still works exactly as
  // it did - that path is the browser's, not ours.
  useEffect(() => {
    // Never in the layout editor: the canvas is not the storefront's page, and
    // a floor measured against it would only pad the column out with empty space
    // for whoever is designing the checkout.
    if (preview || !(sticky === 'on' && scrolls)) return
    const wrap = wrapRef.current
    const section = sectionRef.current
    if (!wrap || !section) return

    const desktop = () => window.matchMedia('(min-width: 641px)').matches
    // What the list still has hidden below its own fold. Zero on a short order,
    // which is the signal to do nothing at all.
    const overflow = () => {
      const body = bodyRef.current
      if (!body) return 0
      return Math.max(0, body.scrollHeight - body.clientHeight)
    }

    // The columns beside this one. Returns nothing where there is no column to
    // speak of - the single-column layout the block warns against being pinned
    // in anyway - so neither the floor nor the hold below does anything there.
    function neighbours(wrapper: HTMLElement): HTMLElement[] {
      const column = wrapper.parentElement
      const row = column?.parentElement
      if (!column || !row || row.children.length < 2) return []
      const display = getComputedStyle(row).display
      if (display !== 'grid' && display !== 'flex') return []
      return Array.from(row.children).filter((el): el is HTMLElement => el instanceof HTMLElement && el !== column)
    }

    // How tall the column beside this one actually is - its content, not its
    // box. Columns in a split stretch to the tallest of them, so every one of
    // them measures the same and measuring the box says nothing; the extent of
    // its children is the real answer.
    // Deliberately offsetTop/offsetHeight rather than rects: the hold below
    // moves that column with a transform, rects carry transforms, and measuring
    // a held column would raise the floor, which would lengthen the hold, which
    // would raise the floor again. Layout values cannot see the transform at
    // all, so there is nothing to run away with.
    function neighbourHeight(wrapper: HTMLElement): number {
      let tallest = 0
      for (const sibling of neighbours(wrapper)) {
        let top = Infinity
        let bottom = 0
        for (const child of Array.from(sibling.children)) {
          if (!(child instanceof HTMLElement)) continue
          top = Math.min(top, child.offsetTop)
          bottom = Math.max(bottom, child.offsetTop + child.offsetHeight)
        }
        if (top !== Infinity) tallest = Math.max(tallest, bottom - top)
      }
      return tallest
    }

    // Holds the column beside this one still while the order list scrolls. The
    // reserved run is page scroll like any other, so without this the form would
    // slide up and off the top exactly when the shopper is checking the order
    // against it. Moving it down by however much of the run has been used cancels
    // that out and it simply sits there.
    // A transform rather than sticky: it needs no assumption about what the
    // other column is made of (a dropzone's children are whatever blocks were
    // dropped in it), and it changes nothing about the layout, so the row keeps
    // the height the floor gave it. Held all the way to the end rather than let
    // go at the finish line - at full hold the column's foot sits exactly on the
    // row's foot, so it carries on up the page from there with nothing to snap
    // back to and nothing below it to overlap.
    let holding = -1
    function hold(px: number) {
      if (px === holding) return
      holding = px
      for (const sibling of neighbours(wrapRef.current ?? sectionRef.current!)) {
        sibling.style.transform = px > 0 ? `translateY(${px}px)` : ''
      }
    }

    // The floor: tall enough that the reserved run sits BELOW the end of the
    // column beside it, so the order starts scrolling where the form finishes
    // rather than alongside its last few fields. Falls back to the block's own
    // height where there is no neighbouring column to measure.
    function measure() {
      const w = wrapRef.current
      const el = sectionRef.current
      if (!w || !el) return
      const spare = desktop() ? overflow() : 0
      if (spare <= 0) { w.style.removeProperty('--sci-fill'); hold(0); return }
      const floor = Math.max(el.offsetHeight, neighbourHeight(w)) + spare
      w.style.setProperty('--sci-fill', `${Math.ceil(floor)}px`)
    }

    let lastY = window.scrollY
    let queued = false
    // Banked rather than dropped: scroll fires faster than frames, and a delta
    // thrown away is a pixel the list never travels, so a fast flick would leave
    // the order short of its end by however much was binned on the way down.
    let pending = 0
    function onScroll() {
      const y = window.scrollY
      pending += y - lastY
      lastY = y
      if (queued || pending === 0 || !desktop()) return
      queued = true
      requestAnimationFrame(() => {
        queued = false
        const dy = pending
        pending = 0
        const w = wrapRef.current
        const el = sectionRef.current
        const body = bodyRef.current
        if (!w || !el || !body) return
        const spare = overflow()
        if (spare <= 0) { hold(0); return }
        // How much travel the pinned block has left before its foot meets the
        // bottom of the column. Inside the reserved run, the page and the list
        // move together; above it the page is still scrolling the form, and the
        // list is left alone.
        const remaining = w.getBoundingClientRect().bottom - el.getBoundingClientRect().bottom
        // Where the list belongs for this page position, which is also how far
        // the column beside it is being held.
        const mapped = Math.min(spare, Math.max(0, Math.round(spare - remaining)))
        hold(mapped)
        // A jump rather than a scroll - Home, a back-to-top button, an anchor,
        // a restored position - has no deltas to follow, so the list is put
        // where the page now is. Without this, jumping back to the top of the
        // checkout left the order showing its last item.
        if (Math.abs(dy) > window.innerHeight) { body.scrollTop = mapped; return }
        if (remaining < 0 || remaining > spare + 1) return
        body.scrollTop += dy
      })
    }

    measure()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', measure)
    // The order itself changes height - a basket edited in another tab, an
    // arrival heading appearing once delivery is worked out - and the floor is
    // wrong the moment it does.
    const observer = new ResizeObserver(measure)
    if (bodyRef.current) observer.observe(bodyRef.current)
    observer.observe(section)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', measure)
      observer.disconnect()
      hold(0)
      wrap.style.removeProperty('--sci-fill')
    }
  }, [preview, sticky, scrolls, lines, collapsed])

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
    // The wrapper carries the reserved run (see the scroll effect above) and
    // nothing else - no width, no padding, no look of its own - so a layout that
    // never pins the block gets the same box it always had.
    <div ref={wrapRef} className={sticky === 'on' && scrolls ? 'sci-fill' : undefined}>
    {/* No max-width of its own: the block fills whatever column its layout gives
        it - a sidebar, a split's left half, or a narrow section. */}
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
      <div ref={bodyRef} className="sci-body" style={{ display: 'grid', gap: '1rem' }}>
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
        {notes.map((note) => (
          <p key={note.id} style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem', margin: 0 }}>{note.text}</p>
        ))}
      </div>
    </section>
    </div>
  )
}
