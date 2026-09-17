'use client'

// The "Show prices including VAT" link beside a price (pattern:
// lib/tax-view-shared.ts). A button rather than an anchor, because it goes
// nowhere: it flips every switchable figure on the page and remembers the
// choice. Its own wording is a span pair like any figure, so it reads right
// from the first paint whichever side the shopper chose last time.

import { SharedStyle } from '@/components/SharedStyle'
import { applyTaxViewSide, currentTaxViewSide } from '@/modules/shop/lib/tax-view-client'
import { otherTaxViewSide, type TaxViewSwitch } from '@/modules/shop/lib/tax-view-shared'
import { TaxViewText } from '@/modules/shop/components/public/TaxViewText'

// Link-like, in the theme's own link colour, and never broken over two lines:
// it sits in a row of prices that wraps whole items rather than words. Sized in
// em so it tracks whichever note it sits beside.
const TAX_VIEW_TOGGLE_CSS = `.shop-tax-toggle{appearance:none;background:none;border:0;padding:0;margin:0;font:inherit;font-size:13px;line-height:inherit;color:var(--color-primary);text-decoration:underline;text-underline-offset:2px;cursor:pointer;white-space:nowrap}
.shop-tax-toggle:hover{text-decoration-thickness:2px}
.shop-tax-toggle:focus-visible{outline:2px solid var(--color-primary);outline-offset:2px;border-radius:2px}`

export type TaxViewToggleProps = {
  /** The shop's switch, or null/undefined where it is off - renders nothing. */
  view: TaxViewSwitch | null | undefined
  /** Added to the button's own class, for a surface that needs to size it. */
  className?: string
}

export function TaxViewToggle({ view, className }: TaxViewToggleProps) {
  if (!view) return null
  const flip = () => applyTaxViewSide(otherTaxViewSide(currentTaxViewSide(view.defaultSide)))
  return (
    <>
      <SharedStyle id="shop-tax-toggle" css={TAX_VIEW_TOGGLE_CSS} />
      <button type="button" className={className ? `shop-tax-toggle ${className}` : 'shop-tax-toggle'} onClick={flip}>
        {/* While figures are shown without tax the link offers them with it, and
            the other way about. */}
        <TaxViewText defaultSide={view.defaultSide} excluding={view.showIncludingLabel} including={view.showExcludingLabel} />
      </button>
    </>
  )
}
