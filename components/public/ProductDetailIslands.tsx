'use client'

// Client islands for the product detail block: an image gallery with
// thumbnail swap, and the section-tabs nav strip. The styling lives in the
// scoped `spd-*` <style> emitted alongside them (RSC) on the same page, so
// these only carry behaviour and markup. Section content is server-rendered by
// the separate Product: Sections block (real product data) - these islands hold
// no product data, so no data fetching happens client-side.

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { addToCart } from '@/modules/shop/components/public/cart'
import { GalleryThumbStrip } from '@/modules/shop/components/public/GalleryThumbStrip'
import type { ShopGalleryExtra } from '@/modules/shop/lib/gallery-media'

export type GalleryImage = { url: string; alt: string }

// How far the magnifier goes in. Scaling the stage image itself (rather than
// floating a second lens over it) keeps the magnified view inside the stage's
// existing rounded, clipped box, so nothing new has to be positioned.
const ZOOM_SCALE = 2.5

// The stage is always square. It used to be shape-pickable (square/portrait/
// landscape) per Gallery instance, which meant one shop's photos could be three
// different shapes depending on which layout a page used; the ratio now lives in
// `.spd-stage` CSS only. thumbPosition still puts the strip below (default) or
// beside the stage.

function pct(offset: number, size: number): string {
  return `${Math.min(100, Math.max(0, (offset / size) * 100))}%`
}

// `zoom` is the shop-wide setting (shop settings > General > Product images).
// Mouse: the magnifier follows the pointer while it's over the stage. Touch: a
// tap magnifies at the tapped point and a drag then moves the magnified area
// around, a second tap zooms back out. Touch deliberately isn't wired to
// pointerenter/leave - a passing finger would magnify and drop the image on
// every scroll past it.
// `extras` are items contributed by another module through `shop.gallery-media`
// (see lib/gallery-media.ts) - a 3D model, say. They render as further thumbnails
// in this strip, and picking one hands the stage to the contributing module. Shop
// owns the strip, the stage box and the class names; it never learns what the
// item is. Empty on a shop-only site, where everything below behaves as before.
export function ProductGallery({ images, productName, thumbPosition, zoom, extras = [] }: { images: GalleryImage[]; productName: string; thumbPosition?: string; zoom?: boolean; extras?: ShopGalleryExtra[] }) {
  const [active, setActive] = useState(0)
  const [hovering, setHovering] = useState(false)
  const [tapped, setTapped] = useState(false)
  const [origin, setOrigin] = useState('50% 50%')
  // Which contributed item is on the stage, as { provider id, item key }, or null
  // when a plain image is showing. The provider id is part of it because two
  // modules could contribute items keyed the same way without knowing it.
  const [picked, setPicked] = useState<{ id: string; key: string } | null>(null)
  const colClass = `spd-stage-col${thumbPosition === 'beside' ? ' beside' : ''}`

  // An empty gallery is still worth rendering when a module has contributed
  // something to it: a product whose only picture is a 3D model would otherwise
  // show the empty-stage box and none of the thumbnails offering the model.
  if (images.length === 0 && extras.length === 0) {
    return (
      <div className={colClass}>
        <div className="spd-stage spd-stage-empty" aria-hidden="true" />
      </div>
    )
  }

  const current = images[Math.min(active, images.length - 1)] ?? null
  const activeExtra = picked ? extras.find((e) => e.id === picked.id) ?? null : null
  // Magnifying applies to shop's own image. A contributed stage owns its whole
  // box - a 3D viewer does its own zooming, with its own controls - so the
  // pointer must reach it untouched rather than through a transform of ours.
  const magnified = Boolean(zoom) && !activeExtra && (hovering || tapped)
  const zoomable = Boolean(zoom) && !activeExtra

  function track(e: ReactPointerEvent<HTMLDivElement>) {
    const box = e.currentTarget.getBoundingClientRect()
    setOrigin(`${pct(e.clientX - box.left, box.width)} ${pct(e.clientY - box.top, box.height)}`)
  }

  const zoomHandlers = zoomable
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

  // The strip earns its place with more than one thing to pick between - an
  // image plus a contributed item counts, which is why this is not the old
  // images.length > 1.
  const showThumbs = images.length + extras.length > 1

  return (
    <div className={colClass}>
      <div
        className={`spd-stage${zoomable ? ' zoomable' : ''}${magnified ? ' zoomed' : ''}`}
        {...zoomHandlers}
      >
        {activeExtra && picked ? (
          <activeExtra.Stage payload={activeExtra.payload} itemKey={picked.key} activeProductId={null} />
        ) : current ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            className="spd-stage-img"
            src={current.url}
            alt={current.alt || productName}
            draggable={false}
            // Origin stays put while zoomed out, so releasing settles back into
            // the spot the shopper was looking at rather than snapping to centre.
            style={zoom ? { transformOrigin: origin, transform: magnified ? `scale(${ZOOM_SCALE})` : undefined } : undefined}
          />
        ) : null}
      </div>
      {showThumbs ? (
        <GalleryThumbStrip beside={thumbPosition === 'beside'}>
          {/* Contributed media (a 3D model, say) leads the strip, so the richer
              view sits first rather than trailing behind the photos - it is also
              what the stage opens on, and the two should agree. */}
          {extras.map((extra) => (
            <extra.Thumbs
              key={extra.id}
              payload={extra.payload}
              // Shop has no notion of a chosen combination, so every contributed
              // item shows here. A gallery that does know (shop-variations')
              // replaces this one wholesale and passes the chosen child instead.
              activeProductId={null}
              activeKey={picked?.id === extra.id ? picked.key : null}
              onPick={(key) => {
                setPicked(key === null ? null : { id: extra.id, key })
                setTapped(false)
              }}
              thumbClass="spd-thumb"
              thumbOnClass="spd-thumb on"
            />
          ))}
          {images.map((img, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={i === active && !picked}
              aria-label={`Show image ${i + 1} of ${images.length}`}
              className={`spd-thumb${i === active && !picked ? ' on' : ''}`}
              onClick={() => {
                setActive(i)
                setTapped(false)
                setPicked(null)
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.url} alt={img.alt || `${productName} thumbnail ${i + 1}`} />
            </button>
          ))}
        </GalleryThumbStrip>
      ) : (
        // A lone contributed item still has to mount: unlike a lone photo (already
        // showing via `current`, no click required), a lone extra's stage only
        // ever appears once its Thumbs component's own effect calls onPick - that
        // is where "lead with the model" lives (see Gallery3dThumbs). No picker is
        // needed with nothing to pick between, so it mounts invisibly rather than
        // inside the visible strip.
        extras.map((extra) => (
          <div key={extra.id} style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }} aria-hidden="true">
            <extra.Thumbs
              payload={extra.payload}
              activeProductId={null}
              activeKey={picked?.id === extra.id ? picked.key : null}
              onPick={(key) => {
                setPicked(key === null ? null : { id: extra.id, key })
                setTapped(false)
              }}
              thumbClass="spd-thumb"
              thumbOnClass="spd-thumb on"
            />
          </div>
        ))
      )}
    </div>
  )
}

export type ProductTab = { id: string; label: string; content: ReactNode }

// The Tabs block is a navigation strip, not a panel: it carries no content of
// its own, it points at the sections the separate Product: Sections block
// renders. Each link jumps to that section's `spd-sec-<id>` anchor (native
// hash scroll, with scroll-margin-top set on the sections so a sticky header
// doesn't cover the landing), and a scroll-spy lights the link whose section is
// nearest the top of the viewport as the shopper reads down the page.
//
// It has to be a client island only for that active-highlight; the jump itself
// is a plain anchor and works with JS off. `align`/`sticky`/`divider` are the
// layout-editor choices, passed through as class flags so the styling stays in
// the scoped `spd-*` <style> beside them. There is no wrapping `.spd-tabs` div
// (unlike the Sections block): the nav must be a direct child of the layout
// zone so a `position:sticky` on it can travel past the sibling Sections block
// rather than being trapped inside a wrapper only as tall as itself.
// The CTA that closes the strip. `add` puts the product straight in the basket
// (no options to pick), `configure` jumps to the buy area so the shopper can
// choose a combination first. Undefined leaves the strip links-only.
export type TabAction =
  | { kind: 'add'; productId: string; label: string }
  | { kind: 'configure'; anchor: string; label: string }

export function ProductSectionTabs({ tabs, align, sticky, divider = true, action }: { tabs: { label: string; anchor: string }[]; align?: string; sticky?: boolean; divider?: boolean; action?: TabAction }) {
  const [active, setActive] = useState(tabs[0]?.anchor)
  const [added, setAdded] = useState(false)
  const navRef = useRef<HTMLElement>(null)

  // When the strip is pinned it sits below the header, so a jump-link landing
  // must clear the header AND the strip's own height or the section title lands
  // behind it. The sections' scroll-margin-top reads --spd-tabnav-h; publish the
  // measured strip height there (0 when not sticky, so non-sticky pages are
  // unaffected). Re-measure on resize since the strip wraps taller when narrow.
  useEffect(() => {
    const root = document.documentElement
    if (!sticky || !navRef.current) {
      root.style.removeProperty('--spd-tabnav-h')
      return
    }
    const nav = navRef.current
    const publish = () => root.style.setProperty('--spd-tabnav-h', `${nav.offsetHeight}px`)
    publish()
    const ro = new ResizeObserver(publish)
    ro.observe(nav)
    return () => {
      ro.disconnect()
      root.style.removeProperty('--spd-tabnav-h')
    }
  }, [sticky, tabs])

  useEffect(() => {
    const anchors = tabs.map((t) => t.anchor)
    const els = anchors
      .map((a) => document.getElementById(a))
      .filter((el): el is HTMLElement => el !== null)
    if (els.length === 0) return

    // A section counts as "current" while it crosses a thin band near the top of
    // the viewport; of those in the band, the topmost in document order wins, so
    // the highlight advances one link at a time as the reader scrolls down.
    const inBand = new Set<string>()
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) inBand.add(e.target.id)
          else inBand.delete(e.target.id)
        }
        const first = anchors.find((a) => inBand.has(a))
        if (first) setActive(first)
      },
      { rootMargin: '-15% 0px -75% 0px', threshold: 0 },
    )
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [tabs])

  if (tabs.length === 0) return null

  const navClass = `spd-tab-nav${align === 'center' ? ' align-center' : align === 'right' ? ' align-right' : ''}${sticky ? ' sticky' : ''}${divider ? ' divider' : ''}`

  return (
    <nav ref={navRef} className={navClass} aria-label="Product information">
      {tabs.map((t) => (
        <a
          key={t.anchor}
          href={`#${t.anchor}`}
          className={`spd-tab-btn${t.anchor === active ? ' on' : ''}`}
          aria-current={t.anchor === active ? 'true' : undefined}
          onClick={() => setActive(t.anchor)}
        >
          {t.label}
        </a>
      ))}
      {action?.kind === 'configure' && (
        <a href={`#${action.anchor}`} className="spd-tab-btn spd-tab-action">
          {action.label}
        </a>
      )}
      {action?.kind === 'add' && (
        <button
          type="button"
          className="spd-tab-btn spd-tab-action"
          onClick={() => {
            addToCart(action.productId, 1)
            setAdded(true)
            setTimeout(() => setAdded(false), 2000)
          }}
        >
          {added ? 'Added to basket' : action.label}
        </button>
      )}
    </nav>
  )
}
