'use client'

// Client islands for the product detail block: an image gallery with
// thumbnail swap, and a tabbed detail area. The styling lives in the scoped
// `spd-*` <style> emitted by ShopProductDetail (RSC) on the same page, so
// these only carry behaviour and markup. The tab panels are server-rendered
// (real product data) and passed in as ReactNode `content` across the RSC
// boundary - the "slots" pattern - so no data fetching happens client-side.

import { useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'

export type GalleryImage = { url: string; alt: string }

// How far the magnifier goes in. Scaling the stage image itself (rather than
// floating a second lens over it) keeps the magnified view inside the stage's
// existing rounded, clipped box, so nothing new has to be positioned.
const ZOOM_SCALE = 2.5

// shape sets the stage aspect ratio (square/portrait/landscape); thumbPosition
// puts the thumbnail strip below (default) or beside the stage. Both are set
// per-instance on the Gallery part in the Product Detail layout editor.
function stageAspect(shape?: string): string {
  return shape === 'portrait' ? '3 / 4' : shape === 'landscape' ? '4 / 3' : '1 / 1'
}

function pct(offset: number, size: number): string {
  return `${Math.min(100, Math.max(0, (offset / size) * 100))}%`
}

// `zoom` is the shop-wide setting (shop settings > General > Product images).
// Mouse: the magnifier follows the pointer while it's over the stage. Touch: a
// tap magnifies at the tapped point and a drag then moves the magnified area
// around, a second tap zooms back out. Touch deliberately isn't wired to
// pointerenter/leave - a passing finger would magnify and drop the image on
// every scroll past it.
export function ProductGallery({ images, productName, shape, thumbPosition, zoom }: { images: GalleryImage[]; productName: string; shape?: string; thumbPosition?: string; zoom?: boolean }) {
  const [active, setActive] = useState(0)
  const [hovering, setHovering] = useState(false)
  const [tapped, setTapped] = useState(false)
  const [origin, setOrigin] = useState('50% 50%')
  const colClass = `spd-stage-col${thumbPosition === 'beside' ? ' beside' : ''}`
  const aspect = stageAspect(shape)
  const magnified = Boolean(zoom) && (hovering || tapped)

  if (images.length === 0) {
    return (
      <div className={colClass}>
        <div className="spd-stage spd-stage-empty" style={{ aspectRatio: aspect }} aria-hidden="true" />
      </div>
    )
  }

  const current = images[Math.min(active, images.length - 1)]
  if (!current) return null

  function track(e: ReactPointerEvent<HTMLDivElement>) {
    const box = e.currentTarget.getBoundingClientRect()
    setOrigin(`${pct(e.clientX - box.left, box.width)} ${pct(e.clientY - box.top, box.height)}`)
  }

  const zoomHandlers = zoom
    ? {
        onPointerEnter: (e: ReactPointerEvent<HTMLDivElement>) => {
          if (e.pointerType === 'touch') return
          track(e)
          setHovering(true)
        },
        onPointerMove: (e: ReactPointerEvent<HTMLDivElement>) => {
          if (e.pointerType === 'touch' && !tapped) return
          track(e)
        },
        onPointerLeave: (e: ReactPointerEvent<HTMLDivElement>) => {
          if (e.pointerType === 'touch') return
          setHovering(false)
        },
        onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => {
          if (e.pointerType !== 'touch') return
          track(e)
          setTapped((t) => !t)
        },
      }
    : {}

  return (
    <div className={colClass}>
      <div
        className={`spd-stage${zoom ? ' zoomable' : ''}${magnified ? ' zoomed' : ''}`}
        style={{ aspectRatio: aspect }}
        {...zoomHandlers}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="spd-stage-img"
          src={current.url}
          alt={current.alt || productName}
          draggable={false}
          // Origin stays put while zoomed out, so releasing settles back into
          // the spot the shopper was looking at rather than snapping to centre.
          style={zoom ? { transformOrigin: origin, transform: magnified ? `scale(${ZOOM_SCALE})` : undefined } : undefined}
        />
      </div>
      {images.length > 1 && (
        <div className="spd-thumbs" role="tablist" aria-label="Product images">
          {images.map((img, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={i === active}
              aria-label={`Show image ${i + 1} of ${images.length}`}
              className={`spd-thumb${i === active ? ' on' : ''}`}
              onClick={() => {
                setActive(i)
                setTapped(false)
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.url} alt={img.alt || `${productName} thumbnail ${i + 1}`} />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export type ProductTab = { id: string; label: string; content: ReactNode }

export function ProductTabs({ tabs }: { tabs: ProductTab[] }) {
  const [active, setActive] = useState(tabs[0]?.id)

  const current = tabs.find((t) => t.id === active) ?? tabs[0]
  if (!current) return null

  return (
    <div className="spd-tabs">
      <div className="spd-tab-nav" role="tablist" aria-label="Product information">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={t.id === current.id}
            className={`spd-tab-btn${t.id === current.id ? ' on' : ''}`}
            onClick={() => setActive(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="spd-panel" role="tabpanel">
        {current.content}
      </div>
    </div>
  )
}
