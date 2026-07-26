'use client'

// The product card's picture, made interactive. Renders the current image, the
// prev/next arrows that flick through the rest (the product's own photos plus any
// variation photos a companion module folded in via `shop.card-media`), and the
// overlay slot where those modules mount a control - today the product-3d-views
// "view in 3D" icon.
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

import { useState } from 'react'
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
  const count = images.length
  // Guard the index against an images list that changed length under us (defensive;
  // the list is fixed per render today).
  const at = Math.min(Math.max(index, 0), Math.max(count - 1, 0))
  const current = images[at]

  const step = (delta: number) => (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIndex((i) => Math.min(Math.max(i + delta, 0), count - 1))
  }

  return (
    <>
      {current && (
        // eslint-disable-next-line @next/next/no-img-element -- media library URLs are arbitrary remote hosts, not a configured next/image loader
        <img src={current.url} alt={current.alt} />
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
            <o.Overlay key={o.id} payload={o.payload} productId={productId} />
          ))}
        </div>
      )}
    </>
  )
}
