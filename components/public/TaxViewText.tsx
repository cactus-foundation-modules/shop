// Markup for the shopper's VAT switch (pattern: lib/tax-view-shared.ts).
//
// No 'use client' and no hooks, on purpose: the same components print a price
// in a server-rendered product card and in a variation picker running in the
// browser, and both have to write identical markup for the one stylesheet to
// act on. Anything interactive lives in ./TaxViewToggle.

import type { ReactNode } from 'react'
import {
  TAX_VIEW_FIGURE_ATTRIBUTE,
  taxViewAmounts,
  type ProductTaxView,
  type TaxViewSide,
  type TaxViewSwitch,
} from '@/modules/shop/lib/tax-view-shared'

function sideAttributes(side: TaxViewSide, defaultSide: TaxViewSide) {
  // `hidden` rather than a class: it needs no stylesheet to be right, so a page
  // whose boot script never ran still shows the shop's own side and only that.
  return { [TAX_VIEW_FIGURE_ATTRIBUTE]: side, hidden: side !== defaultSide }
}

export type TaxViewTextProps = {
  /** The side the shop shows before a shopper chooses. */
  defaultSide: TaxViewSide
  /** What to print while figures are shown without tax. */
  excluding: ReactNode
  /** What to print while figures are shown with tax in them. */
  including: ReactNode
}

/** Both copies of a piece of text, one per side of tax, only one of them shown. */
export function TaxViewText({ defaultSide, excluding, including }: TaxViewTextProps) {
  return (
    <>
      <span {...sideAttributes('ex', defaultSide)}>{excluding}</span>
      <span {...sideAttributes('inc', defaultSide)}>{including}</span>
    </>
  )
}

export type TaxViewMoneyProps = {
  /** The figure as the shop prints it by default. */
  amount: number
  /** This product's switch, or null/undefined where the shop has it off - in
   *  which case this prints `format(amount)` and nothing else, exactly as the
   *  price did before the switch existed. */
  view: ProductTaxView | null | undefined
  /** The surface's own money formatter, so a figure keeps its usual spelling
   *  ("£1,600.00", or "£246" in a price hint). */
  format: (amount: number) => ReactNode
}

/** A price that follows the shopper's VAT switch. */
export function TaxViewMoney({ amount, view, format }: TaxViewMoneyProps) {
  if (!view) return <>{format(amount)}</>
  const amounts = taxViewAmounts(amount, view)
  return <TaxViewText defaultSide={view.defaultSide} excluding={format(amounts.ex)} including={format(amounts.inc)} />
}

export type TaxViewNoteProps = {
  view: TaxViewSwitch | null | undefined
  /** The shop's single wording, used where the switch is off. */
  suffix: string | null | undefined
  className?: string
}

/**
 * The wording beside a price ("+ VAT", "inc. VAT"). With the switch on it is the
 * pair of notes, one per side; with it off, the shop's own suffix as before.
 * Nothing at all where there is no wording to print, so a price row never
 * carries an empty element holding a gap open.
 */
export function TaxViewNote({ view, suffix, className }: TaxViewNoteProps) {
  if (!view) return suffix ? <span className={className}>{suffix}</span> : null
  if (!view.excludingNote && !view.includingNote) return null
  return (
    <span className={className}>
      <TaxViewText defaultSide={view.defaultSide} excluding={view.excludingNote} including={view.includingNote} />
    </span>
  )
}
