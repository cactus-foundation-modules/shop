'use client'

// Client islands for the product detail block: an image gallery with
// thumbnail swap, and a tabbed detail area. The styling lives in the scoped
// `spd-*` <style> emitted by ShopProductDetail (RSC) on the same page, so
// these only carry behaviour and markup. The tab panels are server-rendered
// (real product data) and passed in as ReactNode `content` across the RSC
// boundary - the "slots" pattern - so no data fetching happens client-side.

import { useState, type ReactNode } from 'react'

export type GalleryImage = { url: string; alt: string }

// shape sets the stage aspect ratio (square/portrait/landscape); thumbPosition
// puts the thumbnail strip below (default) or beside the stage. Both are set
// per-instance on the Gallery part in the Product Detail layout editor.
function stageAspect(shape?: string): string {
  return shape === 'portrait' ? '3 / 4' : shape === 'landscape' ? '4 / 3' : '1 / 1'
}

export function ProductGallery({ images, productName, shape, thumbPosition }: { images: GalleryImage[]; productName: string; shape?: string; thumbPosition?: string }) {
  const [active, setActive] = useState(0)
  const colClass = `spd-stage-col${thumbPosition === 'beside' ? ' beside' : ''}`
  const aspect = stageAspect(shape)

  if (images.length === 0) {
    return (
      <div className={colClass}>
        <div className="spd-stage spd-stage-empty" style={{ aspectRatio: aspect }} aria-hidden="true" />
      </div>
    )
  }

  const current = images[Math.min(active, images.length - 1)]
  if (!current) return null

  return (
    <div className={colClass}>
      <div className="spd-stage" style={{ aspectRatio: aspect }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="spd-stage-img" src={current.url} alt={current.alt || productName} />
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
              onClick={() => setActive(i)}
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
