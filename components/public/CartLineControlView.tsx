'use client'

// The per-line control a cart-line resolver offered (a delivery tier, say),
// rendered from plain data. Shop never imports the contributing module's own
// component - it only knows a control carries a label, a chosen value and a list
// of options, and that a resolver may have pre-split each option's wording for
// the summary presentation.
//
// Lives on its own so more than one cart surface can show the same picker and
// they cannot drift: the cart page block (CartFullClient) and the header's
// slide-out basket (CartDrawerClient) both render a shopper's delivery choice,
// and a shopper who switches tier in the drawer must see exactly what the cart
// page would have shown. CartFullClient still carries its own copy of this
// markup while its layout work is in flight; it should adopt this component
// once that lands, and this file is deliberately a like-for-like lift so the
// swap is a deletion rather than a rewrite.

import type { CSSProperties } from 'react'
import type { CartLineControl } from '@/modules/shop/lib/line-meta'
import type { LineMetaField } from '@/modules/shop/lib/types'
import { TickIcon } from '@/modules/shop/components/public/CartChrome'

// Visually-hidden but present for assistive tech (screen-reader-only).
export const SR_ONLY: CSSProperties = {
  position: 'absolute', width: 1, height: 1, padding: 0, margin: -1,
  overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0,
}

// The summary presentation only applies when the resolver pre-split every
// option's wording for it. Shop never breaks a label apart itself, so a resolver
// that supplies only some of the parts falls back to the radio group rather than
// to a half-built card.
export function isSummaryControl(control: CartLineControl): boolean {
  return control.renderAs === 'summary'
    && control.options.length > 0
    && control.options.every((o) => o.summary?.headline)
}

// An option is free when the resolver says it adds nothing to the line; the
// price then reads in the success colour rather than as another charge.
export function isFreeOption(o: CartLineControl['options'][number]): boolean {
  return typeof o.priceAdjust === 'number' && o.priceAdjust <= 0
}

// A line's meta comes from two kinds of source a cart treats differently: the
// product's own choices (a variation, engraving, an uploaded file - shown under
// the name) and a per-line control's confirmed value (a delivery tier's promised
// date - shown beside its picker). Shop names no module here: it only knows a
// control carries a label and a line carries fields, so it splits them
// generically - the one field that restates the control's own label is the
// control's, every other field is the product's.
export function productMetaFields(fields: LineMetaField[], control?: CartLineControl | null): LineMetaField[] {
  return control ? fields.filter((f) => f.label !== control.label) : fields
}
export function controlMetaFields(fields: LineMetaField[], control?: CartLineControl | null): LineMetaField[] {
  return control ? fields.filter((f) => f.label === control.label) : []
}

// Generic personalisation display: label/value pairs the resolver normalised. A
// field with an href renders as a link (e.g. an uploaded artwork file).
export function LineMetaList({ fields }: { fields: LineMetaField[] }) {
  if (!fields.length) return null
  return (
    <ul style={{ listStyle: 'none', margin: '0.25rem 0 0', padding: 0, display: 'grid', gap: '0.125rem' }}>
      {fields.map((f, i) => (
        <li key={i} style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
          <span style={{ fontWeight: 500 }}>{f.label}:</span>{' '}
          {f.href ? <a href={f.href} target="_blank" rel="noopener noreferrer">{f.value}</a> : f.value}
        </li>
      ))}
    </ul>
  )
}

type ControlProps = {
  control: CartLineControl
  // Scopes the radio group to one line, so two lines of the same product never
  // share a group and picking a tier on one never moves the other.
  groupName: string
  // Editor preview: the control is shown exactly as it will look, but inert.
  preview?: boolean
  // How the summary card lays its own wording out. 'inline' is the cart page's
  // shape: promised date, service and price all across one line with the price
  // pushed to the far edge. 'stacked' is for a narrow surface (the slide-out
  // basket): the date owns the top line and the service and its price sit
  // together at the foot of the card, price beside the service rather than
  // across the card from it. Same parts, same class names, two row groupings -
  // so the panel needs no markup of its own and cannot drift from the page.
  summaryLayout?: 'inline' | 'stacked'
  onChange: (value: string) => void
}

// Chosen option confirmed in place, every other option a one-click chip beneath
// it. The whole group is still a radio group underneath, so keyboard and
// assistive tech treat it as the single choice it is.
function SummaryControl({ control, groupName, preview, summaryLayout, onChange }: ControlProps) {
  const chosen = control.options.find((o) => o.value === control.value) ?? control.options[0]!
  const alts = control.options.filter((o) => o.value !== chosen.value)
  const stacked = summaryLayout === 'stacked'
  const desc = chosen.summary!.secondary && <span className="scl-s-desc">{chosen.summary!.secondary}</span>
  const fee = chosen.summary!.priceLabel && (
    <span className={`scl-s-fee${isFreeOption(chosen) ? ' scl-free' : ''}`}>{chosen.summary!.priceLabel}</span>
  )
  const card = (
    <>
      <span className="scl-tick"><TickIcon /></span>
      <span className="scl-sum-lines">
        <span className="scl-s-top">
          <span className="scl-s-date">{chosen.summary!.headline}</span>
          {!stacked && desc}
          {!stacked && fee}
          {alts.length === 0 && <span className="scl-s-only">Only option</span>}
        </span>
        {/* Stacked: the service and its price as one line at the foot of the
            card. Emitted even when only one of the two has anything in it, so
            the row the panel measures for shrink-to-fit is always there. */}
        {stacked && (desc || fee) && <span className="scl-s-foot">{desc}{fee}</span>}
        {chosen.description && <span className="scl-s-below">{chosen.description}</span>}
      </span>
    </>
  )
  return (
    <fieldset className="scl-delgrp">
      <legend style={SR_ONLY}>{control.label}</legend>
      {/* A line with nothing to choose gets the same bar without a control in
          it - it states what happens, it does not ask. */}
      {alts.length === 0 ? (
        <div className="scl-sum">{card}</div>
      ) : (
        <label className="scl-sum">
          <input type="radio" name={groupName} value={chosen.value} checked disabled={preview} onChange={() => {}} />
          {card}
        </label>
      )}
      {alts.length > 0 && (
        <div className="scl-hints">
          <span className="scl-hints-t">Switch to:</span>
          {alts.map((o) => (
            <label key={o.value} className="scl-hint" title={o.label}>
              <input
                type="radio" name={groupName} value={o.value} checked={false} disabled={preview}
                onChange={() => onChange(o.value)}
              />
              {o.summary!.switchLabel ?? o.label}
              {o.summary!.priceLabel && (
                <span className={`scl-hint-fee${isFreeOption(o) ? ' scl-free' : ''}`}>{o.summary!.priceLabel}</span>
              )}
            </label>
          ))}
        </div>
      )}
    </fieldset>
  )
}

function RadiosControl({ control, groupName, preview, onChange }: ControlProps) {
  return (
    <fieldset style={{ border: 'none', margin: '0.375rem 0 0', padding: 0, display: 'grid', gap: '0.25rem', fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
      {/* A self-labelling control needs no visible heading (each option states
          its own outcome), but the group stays labelled for assistive tech. */}
      <legend style={control.optionsSelfLabelled ? SR_ONLY : { fontWeight: 500, padding: 0 }}>
        {control.label}{control.optionsSelfLabelled ? '' : ':'}
      </legend>
      {control.options.map((o) => (
        <label key={o.value} style={{ display: 'flex', alignItems: o.description ? 'flex-start' : 'center', gap: '0.375rem', cursor: preview ? 'default' : 'pointer' }}>
          <input
            type="radio"
            name={groupName}
            value={o.value}
            checked={control.value === o.value}
            disabled={preview}
            onChange={() => onChange(o.value)}
            style={{ accentColor: 'var(--color-primary)', margin: 0, marginTop: o.description ? '0.2em' : 0 }}
          />
          {o.description ? (
            <span style={{ display: 'grid', gap: '0.125rem' }}>
              <span>{o.label}</span>
              <span style={{ fontSize: '0.75rem', opacity: 0.8 }}>{o.description}</span>
            </span>
          ) : (
            <span>{o.label}</span>
          )}
        </label>
      ))}
    </fieldset>
  )
}

function SelectControl({ control, preview, onChange }: ControlProps) {
  // The chosen option's description (if it carries one) sits under the picker -
  // a <select> has nowhere to show per-option copy of its own.
  const chosenDescription = control.options.find((o) => o.value === control.value)?.description
  return (
    <div style={{ display: 'grid', gap: '0.25rem', margin: '0.375rem 0 0' }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
        {control.optionsSelfLabelled ? null : <span style={{ fontWeight: 500 }}>{control.label}:</span>}
        <select
          aria-label={control.optionsSelfLabelled ? control.label : undefined}
          value={control.value}
          disabled={preview}
          onChange={(e) => onChange(e.target.value)}
          style={{ padding: '0.25rem 0.375rem', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)', fontSize: '0.8125rem' }}
        >
          {control.options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </label>
      {chosenDescription && (
        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', opacity: 0.9 }}>{chosenDescription}</span>
      )}
    </div>
  )
}

// The resolver picks the shape: the chosen option as a confirmed bar with the
// rest as switch chips ('summary'), a radio group when every option should be
// visible at a glance, or a compact dropdown by default.
export function CartLineControlView(props: ControlProps) {
  if (props.control.options.length === 0) return null
  if (isSummaryControl(props.control)) return <SummaryControl {...props} />
  if (props.control.renderAs === 'radios') return <RadiosControl {...props} />
  return <SelectControl {...props} />
}
