'use client'

// The whole-basket note, drawn four ways. Every surface that shows one - the
// slide-out basket, the cart page, the checkout order summary - renders through
// here, so a note cannot look like three different features depending on which
// screen the shopper is on, and a new style is added once rather than three
// times.
//
// The TEXT is never this component's business. It arrives finished from
// whichever module contributed it (see lib/cart-summary.ts) and is printed as
// handed over. Everything below is presentation the site owner sets on the
// block that owns the surface.
import type { CSSProperties } from 'react'
import { TickIcon } from '@/modules/shop/components/public/CartChrome'
import { CART_NOTE_CSS } from '@/modules/shop/components/public/cart-note-css'
import { CART_NOTE_DEFAULTS, type CartNoteOptions } from '@/modules/shop/components/public/cart-note-options'

export function CartNotes({ notes, options }: { notes: string[]; options?: Partial<CartNoteOptions> }) {
  const o = { ...CART_NOTE_DEFAULTS, ...options }
  if (o.noteStyle === 'hidden' || notes.length === 0) return null

  // A bubble with no picture has nothing to speak out of, so it settles for the
  // coloured box rather than hanging a tail off the side of nothing.
  const style = o.noteStyle === 'bubble' && !o.noteImageUrl ? 'box' : o.noteStyle

  // Colours are only pinned when the author set one - left blank, the
  // stylesheet's own token stands, which is what an unstyled note has always
  // used. A swatch carrying a dark-mode arm passes straight through.
  const vars: Record<string, string> = {}
  if (o.noteBg) vars['--scn-bg'] = o.noteBg
  if (o.noteTextColour) vars['--scn-fg'] = o.noteTextColour
  if (o.noteBorderColour) vars['--scn-bd'] = o.noteBorderColour
  vars['--scn-r'] = `${Math.max(0, o.noteRadius ?? 0)}px`
  vars['--scn-fs'] = `${o.noteTextSize || CART_NOTE_DEFAULTS.noteTextSize}px`
  vars['--scn-img'] = `${Math.max(1, o.noteImageWidth || CART_NOTE_DEFAULTS.noteImageWidth)}px`
  vars['--scn-tail'] = `${Math.max(0, o.noteTailSize ?? 0)}px`
  vars['--scn-w'] = o.noteBold === 'yes' ? '600' : '400'

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CART_NOTE_CSS }} />
      <div className="scn" style={vars as CSSProperties}>
        {style === 'plain' && (
          <ul className="scn-plain">
            {notes.map((note, i) => (
              <li key={i}>{o.noteTick === 'yes' && <TickIcon />}{note}</li>
            ))}
          </ul>
        )}

        {style === 'box' && (
          <div className="scn-box" role="note">
            {notes.map((note, i) => <p key={i}>{note}</p>)}
          </div>
        )}

        {style === 'bubble' && (
          <div className={`scn-bub ${o.noteImageSide === 'right' ? 'scn-bub-r' : 'scn-bub-l'}`}>
            {/* Decorative: the picture repeats nothing the bubble does not
                already say, so an empty alt keeps it out of the reading. */}
            {/* eslint-disable-next-line @next/next/no-img-element -- author-chosen absolute media URL, not a build-time asset */}
            <img className="scn-bub-img" src={o.noteImageUrl} alt="" />
            <div className="scn-bub-body" role="note">
              {notes.map((note, i) => <p key={i}>{note}</p>)}
            </div>
          </div>
        )}
      </div>
    </>
  )
}
