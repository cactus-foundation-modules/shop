'use client'

// The product card's picture, made interactive. Renders the current image, the
// prev/next arrows that flick through the rest (the product's own photos plus any
// variation photos a companion module folded in via `shop.card-media`), and the
// overlay slot where those modules mount a control - today the product-3d-views
// "view in 3D" icon.
//
// On a pointer device, hovering the card reveals the second picture (the classic
// storefront hover-swap), snapping back to the main on leave - but only where that
// second picture is either the product's own or one a module marked `promoted`, i.e.
// already sitting with the product's own on its page. A product whose only extra
// pictures are plain variation colours keeps its main shot on hover rather than
// flicking to an arbitrary colour - the arrows still reach those. The hover listener
// rides the `.shop-card` ancestor, not this
// island, because the stretched link covers the picture (see below), so a mouseenter
// bound here would never fire over the image the link sits on top of.
//
// Client, because the arrows and the overlay hold state and respond to taps. It
// lives inside `.shop-card-img` (a positioned box) and the whole card is a stretched
// link behind it (see card-template.tsx renderCards + shopCardCss): the arrows and
// the overlay's own controls sit ABOVE that link in the stacking order, so tapping
// one works the control instead of following the card - no anchor nesting, no
// preventDefault gymnastics. The stopPropagation on the arrows is belt-and-braces.
//
// Overlay components arrive as props (their client component + an opaque payload),
// passed down across the RSC boundary from the card context - the same way
// `shop.gallery-media` hands its Thumbs/Stage to the detail gallery.
//
// A companion module that filters the grid (filters-for-shop) may CONSTRAIN the
// carousel to particular contributed photos rather than fight this island for the
// <img> src: it writes the allowed `sourceId`s, space-separated, into
// `data-shop-media-sources` on the `.shop-card` ancestor and dispatches a
// `shop:card-media-sources` event on that element. While the attribute is present
// the carousel shows only images whose sourceId is listed (falling back to the
// full set if none match), starts from the first of them, and suspends the
// hover-swap - the shopper asked for those colours, so hover must not flick to a
// different one. Removing the attribute (plus the same event) restores everything.
// The attribute is the single source of truth; the event just says "re-read it".

import { useEffect, useMemo, useRef, useState } from 'react'
import type { PartImage } from '@/modules/shop/components/puck/parts/part-context'
import type { CardOverlay } from '@/modules/shop/lib/card-media'

function Chevron({ dir }: { dir: 'left' | 'right' }) {
  // Points left or right; drawn once, flipped for the other side.
  const d = dir === 'left' ? 'M15 4l-7 8 7 8' : 'M9 4l7 8-7 8'
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d={d} stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function ShopCardMedia({
  images,
  overlays,
  productId,
}: {
  images: PartImage[]
  overlays: CardOverlay[]
  productId: string
}) {
  const [index, setIndex] = useState(0)
  // Allowed sourceIds pushed in by a filtering module via the data attribute /
  // event contract described up top; null means unconstrained.
  const [allowed, setAllowed] = useState<string[] | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  // Read the constraint off the `.shop-card` ancestor: once on mount (the filter
  // may have dressed the cards from the URL before this island hydrated) and again
  // on every re-read event. The index snaps back to the first allowed picture.
  useEffect(() => {
    const card = rootRef.current?.closest<HTMLElement>('.shop-card')
    if (!card) return
    const read = () => {
      const raw = card.dataset.shopMediaSources
      setAllowed(raw === undefined ? null : raw.split(' ').filter(Boolean))
      setIndex(0)
    }
    read()
    card.addEventListener('shop:card-media-sources', read)
    return () => card.removeEventListener('shop:card-media-sources', read)
  }, [])

  const shown = useMemo(() => {
    if (!allowed || allowed.length === 0) return images
    const set = new Set(allowed)
    const subset = images.filter((i) => i.sourceId && set.has(i.sourceId))
    // A constraint nothing here matches (the module named variations whose photos
    // never made the carousel) falls back to the full set rather than a blank card.
    return subset.length > 0 ? subset : images
  }, [images, allowed])
  const constrained = shown !== images

  const count = shown.length
  // Guard the index against an images list that changed length under us (the
  // constraint can shrink it between renders).
  const at = Math.min(Math.max(index, 0), Math.max(count - 1, 0))
  const current = shown[at]
  // Which entity the current picture belongs to (a variation, for a contributed
  // photo), handed to the overlays so the 3D control follows the shopper's flicking.
  const activeSourceId = current?.sourceId

  // Whether the second picture is a fair thing to reveal on hover. Two kinds
  // qualify: the product's genuine second OWN photo (no sourceId), and a contributed
  // photo the module marked `promoted` - shop-variations marks the variations ticked
  // "Image up front", the ones already sitting in the product page's gallery, so the
  // card behaves the way the gallery does. A plain contributed colour does not
  // qualify: a product whose only extra pictures are variation colours keeps its main
  // shot on hover, and the arrows still reach them. While a filter constrains the
  // carousel the hover-swap is off entirely - the first allowed picture IS the point,
  // and hover must not flick away from the chosen colour.
  const second = shown[1]
  const hasHoverSecond = !constrained && count > 1 && (!second?.sourceId || second.promoted === true)

  const step = (delta: number) => (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIndex((i) => Math.min(Math.max(i + delta, 0), count - 1))
  }

  // Hover-swap to the second own photo, back to the main on leave. Bound to the
  // `.shop-card` ancestor rather than this island because the stretched navigation
  // link covers the picture (it is a sibling ABOVE it in the stacking order, see
  // card-template renderCards): a listener on the island would never hear a mouseenter
  // over the image the link sits on, while `.shop-card` is an ancestor of that link and
  // hears it. Touch devices never fire these, so a phone opens on the main photo and
  // the arrows do the flicking. Leave always returns to the main, so a shopper who
  // flicked into the colours with the arrows finds the hero back when they move off.
  useEffect(() => {
    const card = rootRef.current?.closest('.shop-card')
    if (!card) return
    const onEnter = () => { if (hasHoverSecond) setIndex(1) }
    const onLeave = () => setIndex(0)
    card.addEventListener('mouseenter', onEnter)
    card.addEventListener('mouseleave', onLeave)
    return () => {
      card.removeEventListener('mouseenter', onEnter)
      card.removeEventListener('mouseleave', onLeave)
    }
  }, [hasHoverSecond])

  return (
    <div className="shop-card-media" ref={rootRef}>
      {current && (
        // eslint-disable-next-line @next/next/no-img-element -- media library URLs are arbitrary remote hosts, not a configured next/image loader
        <img className="shop-card-media-img" src={current.url} alt={current.alt} />
      )}

      {count > 1 && (
        <div className="shop-card-nav">
          {/* Left arrow only once the shopper has moved off the first image; right
              arrow drops away on the last, so neither control is ever a dead end. */}
          {at > 0 && (
            <button type="button" className="shop-card-nav-btn shop-card-nav-prev" aria-label="Previous image" onClick={step(-1)}>
              <Chevron dir="left" />
            </button>
          )}
          {at < count - 1 && (
            <button type="button" className="shop-card-nav-btn shop-card-nav-next" aria-label="Next image" onClick={step(1)}>
              <Chevron dir="right" />
            </button>
          )}
        </div>
      )}

      {overlays.length > 0 && (
        <div className="shop-card-overlay">
          {overlays.map((o) => (
            <o.Overlay key={o.id} payload={o.payload} productId={productId} activeSourceId={activeSourceId} />
          ))}
        </div>
      )}
    </div>
  )
}
