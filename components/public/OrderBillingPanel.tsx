'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { BILLING_COMPANY_MAX_LENGTH } from '@/modules/shop/lib/customer-billing'
import type { ShpAddress } from '@/modules/shop/lib/types'

// Who this order is invoiced to, as the customer can change it.
//
// Eligibility, and what a given change will cost, are decided on the server and
// handed back - never re-derived here. lib/customer-billing.ts is the one copy
// of those rules, so the form that appears and the route that accepts it cannot
// disagree, and the warning the customer agrees to is written by the same file
// that decides whether a warning is needed at all.
//
// The confirmation step is the point of the whole component. A change of
// address saves and that is the end of it; a change of company on an invoice
// that has already gone out comes back as `needsConfirmation` with a sentence
// to read, and only then goes through. Two documents arriving unannounced in a
// buyer's inbox is how a finance department concludes it has been charged
// twice.
//
// No country field, matching the address book: shops here post to one country
// nearly always, and the order's own country is kept as it stands.
//
// No NAME fields either, and that one is not a simplification. The checkout
// never asks for a billing name - the invoice is addressed to the company, or
// to the person who placed the order - so there is no billing name here for
// anybody to be putting right. The route will not accept one either: it takes
// the name, the country and the telephone number off the order itself, so this
// form cannot change who an invoice is addressed to under cover of moving it.

type Props = {
  orderId: string
  /** What this shop calls a company - "Company name", "Practice name". */
  companyLabel: string
  /** What is on the order now. */
  company: string
  /** The address the paperwork goes to today. On an order with no billing
   *  address of its own this is the delivery address, which is what the invoice
   *  is printing. */
  address: ShpAddress
  /** Whether they may change any of it, and what to say where they may not. */
  editable: { allowed: boolean; reason?: string }
  /** Whether an invoice has already gone out, which decides the hint under the
   *  form rather than any of the rules. */
  invoiced: boolean
}

type Draft = {
  company: string
  line1: string
  line2: string
  city: string
  county: string
  postcode: string
}

function draftFrom(company: string, address: ShpAddress): Draft {
  return {
    company,
    line1: address.line1 ?? '',
    line2: address.line2 ?? '',
    city: address.city ?? '',
    county: address.county ?? '',
    postcode: address.postcode ?? '',
  }
}

const FIELD_GAP = { display: 'grid', gap: 'var(--space-2)' } as const

export default function OrderBillingPanel({ orderId, companyLabel, company, address, editable, invoiced }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<Draft>(() => draftFrom(company, address))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [warning, setWarning] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  function field<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  async function save(confirm: boolean) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/m/shop/member/orders/${orderId}/billing`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organisation: draft.company.trim(),
          billingAddress: {
            line1: draft.line1.trim(),
            line2: draft.line2.trim() || undefined,
            city: draft.city.trim(),
            county: draft.county.trim() || undefined,
            postcode: draft.postcode.trim(),
          },
          ...(confirm ? { confirm: true } : {}),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error ?? 'That did not go through. Try again in a moment.')
        return
      }
      // The server has decided this change costs a credit note and a
      // replacement invoice. Nothing has been written yet.
      if (data.needsConfirmation) {
        setWarning(data.warning ?? 'Changing the company means cancelling your invoice and issuing a new one. Go ahead?')
        return
      }
      setWarning(null)
      setOpen(false)
      setDone(
        data.outcome === 'reissued'
          ? `Done. Credit note ${data.creditNoteNumber} cancels your old invoice, and invoice ${data.invoiceNumber} replaces it.`
          : data.outcome === 'amended'
            ? 'Done. Your invoice has been updated with the new address.'
            : data.outcome === 'unchanged'
              ? 'Nothing to change - that is what we had already.'
              : 'Done. Your invoice details are updated.',
      )
      // The saved details show on the order, on the invoice and on the
      // paperwork links, so the page is asked for again rather than three
      // corners of it patched by hand.
      router.refresh()
    } catch {
      setError('That did not go through. Try again in a moment.')
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <div style={FIELD_GAP}>
        <div style={{ display: 'grid', gap: '0.125rem', color: 'var(--color-text-muted)' }}>
          {company.trim() && <strong style={{ color: 'var(--color-text)' }}>{company.trim()}</strong>}
          {[address.line1, address.line2, address.city, address.county, address.postcode]
            .filter((line): line is string => Boolean(line && line.trim()))
            .map((line, i) => <span key={i}>{line}</span>)}
        </div>

        {done && <p style={{ margin: 0, color: 'var(--color-success)', fontSize: 'var(--text-sm)' }}>{done}</p>}

        {editable.allowed ? (
          <>
            <div>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => { setDraft(draftFrom(company, address)); setError(null); setWarning(null); setDone(null); setOpen(true) }}
              >
                Change these
              </button>
            </div>
            <p style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>
              {invoiced
                ? 'This is what your invoice is made out to. A change of address goes straight onto it; a change of company means we have to cancel it and send a new one.'
                : 'This is what your invoice will be made out to when we raise it.'}
            </p>
          </>
        ) : (
          editable.reason && (
            <p style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>{editable.reason}</p>
          )
        )}
      </div>
    )
  }

  return (
    <div style={FIELD_GAP}>
      <div className="field">
        <label htmlFor="shp-billing-company">{companyLabel}</label>
        <input
          id="shp-billing-company"
          type="text"
          value={draft.company}
          maxLength={BILLING_COMPANY_MAX_LENGTH}
          onChange={(e) => field('company', e.target.value)}
          disabled={busy}
        />
        <p className="field-hint">Leave it blank if the invoice is in your own name.</p>
      </div>

      <div className="field">
        <label htmlFor="shp-billing-line1">Address</label>
        <input id="shp-billing-line1" type="text" value={draft.line1} onChange={(e) => field('line1', e.target.value)} disabled={busy} />
      </div>
      <div className="field">
        <label htmlFor="shp-billing-line2">Address line 2</label>
        <input id="shp-billing-line2" type="text" value={draft.line2} onChange={(e) => field('line2', e.target.value)} disabled={busy} />
      </div>

      <div style={{ display: 'grid', gap: 'var(--space-2)', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))' }}>
        <div className="field">
          <label htmlFor="shp-billing-city">Town or city</label>
          <input id="shp-billing-city" type="text" value={draft.city} onChange={(e) => field('city', e.target.value)} disabled={busy} />
        </div>
        <div className="field">
          <label htmlFor="shp-billing-county">County</label>
          <input id="shp-billing-county" type="text" value={draft.county} onChange={(e) => field('county', e.target.value)} disabled={busy} />
        </div>
        <div className="field">
          <label htmlFor="shp-billing-postcode">Postcode</label>
          <input id="shp-billing-postcode" type="text" value={draft.postcode} onChange={(e) => field('postcode', e.target.value)} disabled={busy} />
        </div>
      </div>

      {/* The one thing on this page worth stopping somebody over. Shown only
          when the server has said so, and worded by the server. */}
      {warning && (
        <div className="alert alert-warning" style={{ margin: 0 }}>
          <strong>Before we do that.</strong> {warning}
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => save(Boolean(warning))} disabled={busy}>
          {busy ? 'Saving…' : warning ? 'Yes, go ahead' : 'Save'}
        </button>
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => { setOpen(false); setError(null); setWarning(null) }}
          disabled={busy}
        >
          Cancel
        </button>
      </div>

      {error && <p style={{ margin: 0, color: 'var(--color-error)', fontSize: 'var(--text-sm)' }}>{error}</p>}
    </div>
  )
}
