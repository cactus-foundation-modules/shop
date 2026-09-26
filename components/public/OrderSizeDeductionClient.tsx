'use client'

// The order-size deduction line, kept in step with the combination the shopper
// has settled on.
//
// The page is server-rendered against the LISTING, and on a shop that sells
// variations the listing's own row is very nearly never the combination the
// shopper lands on - so the sentence the page opens with is the listing's, and
// this replaces it the moment a real combination is known.
//
// The seam is deliberately a plain browser one, with no import in either
// direction: shop must not import from '@/modules/shop-variations/...' (that path
// does not exist on an install without it, and a static import would break the
// build there), and the variations module must not know this exists. So it reads
// the documented window event the picker already publishes - see
// shop-variations/lib/selection-broadcast.ts, which is written up as exactly this
// seam - plus the latest state parked on `window` for a block that mounts late.
//
// The FIGURE is never worked out here. The browser is handed a finished sentence
// by /api/m/shop/public/order-size-deduction, composed by the same code that
// composed the server-rendered one, so the two can never word it differently and
// nothing about the shop's prices has to be trusted to the client.

import { useEffect, useRef, useState } from 'react'
import type { OrderSizeDeductionFigures, OrderSizeDeductionLineView, SupplierLink } from '@/modules/shop/lib/order-size-deduction'
import { TaxViewText } from '@/modules/shop/components/public/TaxViewText'
import { SupplierLinkText } from '@/modules/shop/components/public/SupplierLinkText'

// Mirrors VariantSelectionDetail in shop-variations. Declared rather than
// imported for the reason above; only the three fields this needs are named, so
// a field added there needs no change here.
type VariantSelection = {
  slug: string
  productId: string | null
  allOptionsChosen: boolean
}

const VARIANT_SELECTION_EVENT = 'cactus-shop-variant-selection'

function currentSelection(): VariantSelection | null {
  if (typeof window === 'undefined') return null
  const parked = (window as unknown as { __cactusVariantSelection?: VariantSelection }).__cactusVariantSelection
  return parked ?? null
}

export function OrderSizeDeductionClient({
  slug,
  seed,
}: {
  /** This page's product slug, so a stray event from somewhere else is ignored. */
  slug: string
  /** The line the page was server-rendered with, shown until a combination is
   *  settled. Null where the listing itself carries nothing. */
  seed: OrderSizeDeductionLineView | null
}) {
  const [line, setLine] = useState<OrderSizeDeductionLineView | null>(seed)
  // One answer per variation, kept for the visit: a shopper flicking between two
  // colours should not re-ask the server about a combination it has already
  // priced. `null` is a real answer (this combination carries nothing) and is
  // cached like any other.
  const cache = useRef(new Map<string, OrderSizeDeductionLineView | null>())
  // Which request is the live one. A shopper clicking through options faster than
  // the network answers would otherwise land on whichever reply arrived last
  // rather than the one they actually chose.
  const latest = useRef(0)

  useEffect(() => {
    let cancelled = false

    const apply = (selection: VariantSelection | null) => {
      // Not this page's picker. Two product pages never share a document, but the
      // event is a window one and being strict costs nothing.
      if (selection && selection.slug !== slug) return
      // No combination settled yet: back to whatever the listing itself said.
      if (!selection?.productId || !selection.allOptionsChosen) {
        setLine(seed)
        return
      }
      const productId = selection.productId
      const cached = cache.current.get(productId)
      if (cached !== undefined) {
        setLine(cached)
        return
      }
      const ticket = ++latest.current
      fetch(`/api/m/shop/public/order-size-deduction?productId=${encodeURIComponent(productId)}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data: { line?: OrderSizeDeductionLineView | null } | null) => {
          const answer = data?.line ?? null
          cache.current.set(productId, answer)
          // Stale reply, or the component has gone: drop it on the floor.
          if (cancelled || ticket !== latest.current) return
          setLine(answer)
        })
        .catch(() => {
          // Chrome. A line that fails to load simply does not appear - it must
          // never take the product page down with it.
        })
    }

    apply(currentSelection())
    const onSelection = (event: Event) => apply((event as CustomEvent<VariantSelection>).detail)
    window.addEventListener(VARIANT_SELECTION_EVENT, onSelection)
    return () => {
      cancelled = true
      window.removeEventListener(VARIANT_SELECTION_EVENT, onSelection)
    }
  }, [slug, seed])

  if (!line) return null
  // The sentence arrives already broken into its parts, so nothing here composes
  // or searches - it only dresses what the server worked out. `was` is what the
  // shopper pays today and is struck; `now` is what the offer takes it to.
  //
  // Where the shopper's VAT switch is on, the figured half is printed once per
  // side of tax and the stylesheet shows one (lib/tax-view-shared.ts).
  return (
    <div className="spd-osd-box">
      <p className="spd-osd-line">
        {line.lead}
        {line.taxSides
          ? <TaxViewText defaultSide={line.taxSides.defaultSide} excluding={<LineFigures figures={line.taxSides.ex} supplierLink={line.supplierLink} />} including={<LineFigures figures={line.taxSides.inc} supplierLink={line.supplierLink} />} />
          : <LineFigures figures={line} supplierLink={line.supplierLink} />}
      </p>
    </div>
  )
}

// The supplier's name sits in the tail ("on Dynamic Office Solutions orders of
// £350 or more") and links to their page where the shop publishes one.
function LineFigures({ figures, supplierLink }: { figures: OrderSizeDeductionFigures; supplierLink?: SupplierLink | null }) {
  return (
    <>
      {figures.was && <s className="spd-osd-was">{figures.was}</s>}
      {figures.was && ' '}
      <span className="spd-osd-amount">{figures.now}</span>
      <SupplierLinkText text={figures.tail} link={supplierLink} className="spd-osd-supplier" />
    </>
  )
}
