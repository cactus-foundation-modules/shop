'use client'

// The header's "prices with or without VAT" switch: a pill-shaped toggle drawn
// to sit beside the cart, account and contrast icons, about twice as wide as
// one of them. It drives the same shopper switch as the link on a product page
// (pattern: lib/tax-view-shared.ts), so flipping it changes every price on the
// site at once.
//
// Like every figure that follows the switch, the pill is printed on BOTH sides
// as a span pair and the page's one stylesheet shows the right one. That is what
// lets a cached page paint the shopper's own choice rather than the shop's
// default, with no state and no flash. It also means the knob jumps rather than
// slides - a transition would need script that runs after paint.

import type { CSSProperties } from 'react'
import { SharedStyle } from '@/components/SharedStyle'
import { applyTaxViewSide, currentTaxViewSide } from '@/modules/shop/lib/tax-view-client'
import { otherTaxViewSide, type TaxViewSwitch } from '@/modules/shop/lib/tax-view-shared'
import { TaxViewText } from '@/modules/shop/components/public/TaxViewText'

export type VatSwitchOptions = {
  /** Height of the pill in px; its width is twice that, as the icons beside it are square. */
  iconSize: number
  iconColour: string
  hoverColour: string
  showLabel: 'yes' | 'no'
  /** Words beside the pill while figures are shown without / with VAT. */
  labelExcluding: string
  labelIncluding: string
}

export const VAT_SWITCH_DEFAULTS: VatSwitchOptions = {
  iconSize: 20,
  iconColour: '',
  hoverColour: '',
  showLabel: 'no',
  labelExcluding: 'ex. VAT',
  labelIncluding: 'inc. VAT',
}

// Same shape as the cart trigger's chrome: colour from a custom property so the
// hover rule can swap it, a tooltip hanging below (the header has no room
// above), and `data-cactus-unstyled` on the button so core's Styles > Buttons
// fill is not painted behind the pill (see TaxViewToggle for the full story).
const VAT_SWITCH_CSS = `.shop-vat-switch{appearance:none;-webkit-appearance:none;background:none;border:0;padding:0;margin:0;font:inherit;line-height:1;display:inline-flex;align-items:center;gap:0.5rem;position:relative;cursor:pointer;color:var(--vs-fg,var(--color-text));transition:color var(--dur-base) var(--ease-in-out)}
.shop-vat-switch:hover,.shop-vat-switch:focus-visible{background:none;color:var(--vs-fg-hover,var(--color-primary))}
.shop-vat-switch:focus-visible{outline:2px solid var(--color-primary);outline-offset:3px;border-radius:999px}
.shop-vat-switch[data-preview]{cursor:default}
.shop-vat-switch svg{display:block}
.shop-vat-label{font-size:var(--text-sm);font-weight:var(--font-medium);white-space:nowrap}
.shop-vat-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.shop-vat-tip{position:absolute;top:calc(100% + 6px);left:50%;transform:translateX(-50%) translateY(-2px);background:var(--color-surface);color:var(--color-text);border:1px solid var(--color-border);border-radius:var(--radius-sm);box-shadow:var(--shadow-md);padding:2px 8px;font-size:var(--text-xs);font-weight:var(--font-medium);line-height:1.5;white-space:nowrap;pointer-events:none;opacity:0;visibility:hidden;z-index:10}
.shop-vat-switch:hover .shop-vat-tip,.shop-vat-switch:focus-visible .shop-vat-tip{opacity:1;visibility:visible;transform:translateX(-50%) translateY(0);transition:opacity var(--dur-base),transform var(--dur-base)}`

/** The pill itself. Drawn in the icons' own language: a 2px round-capped line
 *  on a 24-unit grid (here 48 wide, so it scales to exactly twice an icon).
 *  Hollow with the knob left is "without VAT"; filled with the knob right and
 *  cut out of the fill is "with VAT". */
function VatPill({ including, size }: { including: boolean; size: number }) {
  return (
    <svg width={size * 2} height={size} viewBox="0 0 48 24" fill="none" aria-hidden="true">
      <rect
        x="1" y="1" width="46" height="22" rx="11"
        stroke="currentColor" strokeWidth="2"
        fill={including ? 'currentColor' : 'none'}
      />
      <circle
        cx={including ? 36 : 12} cy="12" r="7"
        fill={including ? 'var(--color-bg, var(--color-surface))' : 'currentColor'}
      />
    </svg>
  )
}

export type VatSwitchClientProps = Partial<VatSwitchOptions> & {
  /** The shop's switch. The editor passes a sample, the site passes the real one. */
  view: TaxViewSwitch
  /** Editor canvas: draws the switch but leaves it inert. */
  preview?: boolean
}

export function VatSwitchClient({ view, preview, ...opts }: VatSwitchClientProps) {
  const o = { ...VAT_SWITCH_DEFAULTS, ...opts }
  const size = o.iconSize > 0 ? o.iconSize : VAT_SWITCH_DEFAULTS.iconSize
  const vars: Record<string, string> = {}
  if (o.iconColour) vars['--vs-fg'] = o.iconColour
  if (o.hoverColour) vars['--vs-fg-hover'] = o.hoverColour

  const flip = () => {
    if (preview) return
    applyTaxViewSide(otherTaxViewSide(currentTaxViewSide(view.defaultSide)))
  }

  return (
    <>
      <SharedStyle id="shop-vat-switch" css={VAT_SWITCH_CSS} />
      <button
        type="button"
        className="shop-vat-switch"
        data-cactus-unstyled=""
        data-preview={preview ? '' : undefined}
        style={vars as CSSProperties}
        onClick={flip}
      >
        <TaxViewText
          defaultSide={view.defaultSide}
          excluding={<VatPill including={false} size={size} />}
          including={<VatPill including size={size} />}
        />
        {o.showLabel === 'yes' && (
          <span className="shop-vat-label">
            <TaxViewText defaultSide={view.defaultSide} excluding={o.labelExcluding} including={o.labelIncluding} />
          </span>
        )}
        {/* The accessible name and the tooltip are the same wording as the link on
            a product page: while figures are shown without VAT it offers them with it. */}
        <span className="shop-vat-sr">
          <TaxViewText defaultSide={view.defaultSide} excluding={view.showIncludingLabel} including={view.showExcludingLabel} />
        </span>
        {o.showLabel !== 'yes' && (
          <span className="shop-vat-tip" aria-hidden="true">
            <TaxViewText defaultSide={view.defaultSide} excluding={view.showIncludingLabel} including={view.showExcludingLabel} />
          </span>
        )}
      </button>
    </>
  )
}
