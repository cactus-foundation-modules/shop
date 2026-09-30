'use client'

import { useEffect, useRef } from 'react'

// A picture with a holographic foil over it - the "shiny trading card" look -
// that shifts as the shopper moves. Used by the order confirmation's hero, where
// a shop can swap the plain tick for its own celebration image.
//
// Three things move it, whichever the device has:
//   - the pointer, anywhere on the page, not only over the picture;
//   - the phone itself, via deviceorientation. Android sends it unasked. iOS
//     will not send a single reading until the page asks, and it only lets the
//     page ask from inside a tap - so a tap on the picture asks, and nothing
//     else ever pops a permission prompt at somebody who has just paid;
//   - scrolling, which needs no permission at all and so is the one every
//     phone gets. It keeps contributing on top of the other two, so the foil
//     rolls as the page moves under it.
//
// The foil is painted on a canvas laid over the picture, not with CSS masks.
// It has to follow the picture's own outline - a cut-out on a transparent
// background should shimmer where something is drawn, not in a box around it -
// and a CSS mask made from an image on another host (the media worker, an image
// CDN) needs CORS headers nobody can promise. A canvas draws any-origin images
// without them; it only refuses to let script read the pixels back, which
// nothing here does.
//
// Motion is written straight onto the element and the canvas from a
// requestAnimationFrame loop, never React state: a re-render per pointer move,
// on a page that is also polling its order, would be a poor trade for a
// shimmer. The loop eases towards its target and stops once it arrives.

type Props = {
  src: string
  alt: string
  width: number
}

// Pointer input counts as "recent" for this long; after that a phone's tilt
// (or nothing) takes over again. Stops a stray mouse event on a hybrid laptop
// pinning the foil in place for good.
const POINTER_FRESH_MS = 1500
// Degrees of phone tilt, from however it was first held, that reach the end of
// the range. Nobody tips their phone 90 degrees to look at a picture.
const TILT_RANGE_DEG = 25
// How far the picture itself leans in 3D at the end of the range.
const MAX_LEAN_DEG = 14
// Share of the remaining gap closed each frame. Lower is floatier.
const EASE = 0.12
// The foil's direction across the picture.
const FOIL_ANGLE = (115 * Math.PI) / 180

// The rainbow is the effect itself, not page chrome - it is painted onto the
// picture, so it is the same foil in light and dark mode. Spelled out as hues
// here, and read back from --holo-c1..c6 on the element first, so a theme that
// wants a different foil can set those without touching this file.
const DEFAULT_FOIL = [
  'hsl(0 90% 80%)', 'hsl(50 95% 78%)', 'hsl(140 80% 78%)',
  'hsl(190 90% 78%)', 'hsl(260 85% 82%)', 'hsl(320 85% 82%)',
]

type OrientationCtor = { requestPermission?: () => Promise<'granted' | 'denied'> }

const clamp = (n: number) => Math.max(-1, Math.min(1, n))

// Fine diagonal lines, tiled over the foil: the grooves that make it read as
// foil rather than a gradient.
function makeGrooves(scale: number): HTMLCanvasElement {
  const size = Math.max(4, Math.round(7 * scale))
  const tile = document.createElement('canvas')
  tile.width = size
  tile.height = size
  const ctx = tile.getContext('2d')
  if (ctx) {
    ctx.strokeStyle = 'hsl(0 0% 100%)'
    ctx.lineWidth = Math.max(1, scale)
    ctx.beginPath()
    ctx.moveTo(0, size)
    ctx.lineTo(size, 0)
    ctx.moveTo(-size / 2, size / 2)
    ctx.lineTo(size / 2, -size / 2)
    ctx.moveTo(size / 2, size * 1.5)
    ctx.lineTo(size * 1.5, size / 2)
    ctx.stroke()
  }
  return tile
}

// One frame. x and y run -1..1; 0,0 is looking at it straight on.
function paintFoil(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  w: number,
  h: number,
  x: number,
  y: number,
  foil: string[],
  grooves: CanvasPattern | null,
) {
  const strength = 0.55 + Math.min(1, Math.hypot(x, y)) * 0.45

  ctx.globalCompositeOperation = 'source-over'
  ctx.globalAlpha = 1
  ctx.clearRect(0, 0, w, h)
  ctx.drawImage(img, 0, 0, w, h)

  // The rainbow, slid along its own direction as the viewer moves. Multiply
  // rather than the usual colour-dodge: a mostly white picture is exactly where
  // dodge and overlay do nothing at all, while multiply tints white with the
  // foil and leaves dark line work dark.
  const dx = Math.cos(FOIL_ANGLE)
  const dy = Math.sin(FOIL_ANGLE)
  const span = Math.hypot(w, h)
  const shift = (x + y) * 0.5 * span
  const cx = w / 2 + dx * shift
  const cy = h / 2 + dy * shift
  const gradient = ctx.createLinearGradient(cx - dx * span * 1.5, cy - dy * span * 1.5, cx + dx * span * 1.5, cy + dy * span * 1.5)
  const bands = foil.length * 4
  for (let i = 0; i <= bands; i++) gradient.addColorStop(i / bands, foil[i % foil.length]!)
  ctx.globalCompositeOperation = 'multiply'
  ctx.globalAlpha = 0.85 * strength
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, w, h)

  if (grooves) {
    grooves.setTransform(new DOMMatrix().translate(x * 12, y * 12))
    ctx.globalCompositeOperation = 'screen'
    ctx.globalAlpha = 0.3 * strength
    ctx.fillStyle = grooves
    ctx.fillRect(0, 0, w, h)
  }

  // The glare: a soft bloom where the light would catch it.
  const gx = (0.5 + x * 0.5) * w
  const gy = (0.5 + y * 0.5) * h
  const glare = ctx.createRadialGradient(gx, gy, 0, gx, gy, span * 0.55)
  glare.addColorStop(0, 'hsl(0 0% 100% / 0.9)')
  glare.addColorStop(0.45, 'hsl(0 0% 100% / 0.3)')
  glare.addColorStop(1, 'hsl(0 0% 100% / 0)')
  ctx.globalCompositeOperation = 'soft-light'
  ctx.globalAlpha = strength
  ctx.fillStyle = glare
  ctx.fillRect(0, 0, w, h)

  // Cut the lot back to the picture's own outline.
  ctx.globalCompositeOperation = 'destination-in'
  ctx.globalAlpha = 1
  ctx.drawImage(img, 0, 0, w, h)
}

export function HoloImage({ src, alt, width }: Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // Set inside the effect; the tap handler calls it to ask iOS for the tilt.
  const enableTiltRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    const root = rootRef.current
    const img = imgRef.current
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!root || !img || !canvas || !ctx) return

    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const styles = getComputedStyle(root)
    const foil = DEFAULT_FOIL.map((fallback, i) => styles.getPropertyValue(`--holo-c${i + 1}`).trim() || fallback)

    let pointer: { x: number; y: number; at: number } | null = null
    let tilt: { x: number; y: number } | null = null
    // The first reading is taken as level, so however the phone happens to be
    // held is the resting position.
    let tiltBase: { beta: number; gamma: number } | null = null
    let orientationOn = false
    let grooves: CanvasPattern | null = null
    let size = { w: 0, h: 0 }
    const current = { x: 0, y: 0 }
    let frame = 0
    let cancelled = false

    function fitCanvas(): boolean {
      if (!img!.complete || !img!.naturalWidth) return false
      const scale = window.devicePixelRatio || 1
      const w = Math.round(img!.clientWidth * scale)
      const h = Math.round(img!.clientHeight * scale)
      if (!w || !h) return false
      if (w !== size.w || h !== size.h) {
        canvas!.width = w
        canvas!.height = h
        size = { w, h }
        grooves = ctx!.createPattern(makeGrooves(scale), 'repeat')
      }
      return true
    }

    function scrollOffset(): number {
      const rect = root!.getBoundingClientRect()
      const half = window.innerHeight / 2
      return clamp((rect.top + rect.height / 2 - half) / half)
    }

    function target(): { x: number; y: number } {
      if (still) return { x: 0, y: 0 }
      const fresh = pointer && performance.now() - pointer.at < POINTER_FRESH_MS ? pointer : null
      const source = fresh ?? tilt ?? { x: 0, y: 0 }
      return { x: source.x, y: clamp(source.y + scrollOffset() * 0.6) }
    }

    function paint() {
      frame = 0
      if (cancelled || !fitCanvas()) return
      const t = target()
      current.x += (t.x - current.x) * EASE
      current.y += (t.y - current.y) * EASE
      const settled = Math.abs(t.x - current.x) < 0.001 && Math.abs(t.y - current.y) < 0.001
      if (settled) { current.x = t.x; current.y = t.y }
      root!.style.setProperty('--holo-rx', `${-current.y * MAX_LEAN_DEG}deg`)
      root!.style.setProperty('--holo-ry', `${current.x * MAX_LEAN_DEG}deg`)
      paintFoil(ctx!, img!, size.w, size.h, current.x, current.y, foil, grooves)
      if (!settled) frame = requestAnimationFrame(paint)
    }

    function kick() {
      if (!frame && !cancelled) frame = requestAnimationFrame(paint)
    }

    function onResize() {
      size = { w: 0, h: 0 }
      kick()
    }

    function onPointerMove(e: PointerEvent) {
      // A finger dragging the page is a scroll, which the scroll offset already
      // covers. Only a real pointer steers.
      if (e.pointerType === 'touch') return
      const rect = root!.getBoundingClientRect()
      pointer = {
        x: clamp((e.clientX - (rect.left + rect.width / 2)) / (window.innerWidth / 2)),
        y: clamp((e.clientY - (rect.top + rect.height / 2)) / (window.innerHeight / 2)),
        at: performance.now(),
      }
      kick()
    }

    function onOrientation(e: DeviceOrientationEvent) {
      if (e.beta == null || e.gamma == null) return
      if (!tiltBase) tiltBase = { beta: e.beta, gamma: e.gamma }
      tilt = {
        x: clamp((e.gamma - tiltBase.gamma) / TILT_RANGE_DEG),
        y: clamp((e.beta - tiltBase.beta) / TILT_RANGE_DEG),
      }
      kick()
    }

    function startOrientation() {
      if (orientationOn || cancelled) return
      orientationOn = true
      window.addEventListener('deviceorientation', onOrientation)
    }

    // Watches the picture rather than the window: the block's width setting,
    // the editor's preview pane and a late-loading image all change its size
    // without the window moving at all.
    const observer = new ResizeObserver(onResize)
    observer.observe(img)
    img.addEventListener('load', onResize)
    kick()

    if (!still) {
      const Orientation = (typeof DeviceOrientationEvent === 'undefined' ? null : DeviceOrientationEvent) as OrientationCtor | null
      if (Orientation && typeof Orientation.requestPermission !== 'function') startOrientation()
      enableTiltRef.current = () => {
        if (!Orientation?.requestPermission || orientationOn) return
        Orientation.requestPermission()
          .then((answer) => { if (answer === 'granted') startOrientation() })
          // Refused, or asked outside a tap. The scroll still moves it.
          .catch(() => {})
      }
      window.addEventListener('pointermove', onPointerMove, { passive: true })
      window.addEventListener('scroll', kick, { passive: true })
    }

    return () => {
      cancelled = true
      if (frame) cancelAnimationFrame(frame)
      observer.disconnect()
      img.removeEventListener('load', onResize)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('scroll', kick)
      if (orientationOn) window.removeEventListener('deviceorientation', onOrientation)
      enableTiltRef.current = null
    }
  }, [src])

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: HOLO_IMAGE_CSS }} />
      <div
        ref={rootRef}
        className="holo"
        style={{ width: `min(${width}px, 100%)` }}
        onClick={() => enableTiltRef.current?.()}
      >
        <div className="holo-card">
          {/* eslint-disable-next-line @next/next/no-img-element -- a media-library url on any host, sized by the block; next/image would need every storage host allow-listed */}
          <img ref={imgRef} className="holo-img" src={src} alt={alt} draggable={false} />
          <canvas ref={canvasRef} className="holo-foil" aria-hidden="true" />
        </div>
      </div>
    </>
  )
}

// Class prefix `holo-*`. The canvas sits exactly over the picture and is only
// ever painted inside the picture's outline, so nothing shows through to the
// page behind a transparent cut-out.
const HOLO_IMAGE_CSS = `
.holo{--holo-rx:0deg;--holo-ry:0deg;perspective:800px;margin:0 auto;-webkit-tap-highlight-color:transparent}
.holo-card{position:relative;transform-style:preserve-3d;
  transform:rotateX(var(--holo-rx)) rotateY(var(--holo-ry));will-change:transform}
.holo-img{display:block;width:100%;height:auto;user-select:none;-webkit-user-select:none}
.holo-foil{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
@media (prefers-reduced-motion:reduce){
  .holo-card{transform:none;will-change:auto}
}
`
