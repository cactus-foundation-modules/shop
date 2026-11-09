'use client'

import { useEffect, useState } from 'react'
import { InfoTip } from '@/components/admin/InfoTip'
import {
  blankCourier,
  CourierEditModal,
  TRACKING_SOURCE_LABELS,
  type Courier,
  type SaveOptions,
} from '@/modules/shop/components/admin/CourierEditModal'
import { ArrowDownIcon, ArrowUpIcon } from '@/modules/shop/components/admin/courier-icons'
import { couriersCss } from '@/modules/shop/components/admin/couriers-css'
import { AlertIcon } from '@/modules/shop/components/admin/order-icons'
import { missingStageLists, type StageListKey } from '@/modules/shop/lib/tracking/known-stages'
import type { ShpConfig } from '@/modules/shop/lib/config'

// The Couriers tab on Tax & shipping.
//
// It lives here rather than among the shop's settings because that is where
// somebody looks for it: couriers are how the goods get there, which is the same
// question as the shipping rates on the tab beside them. It was briefly buried
// under Settings > Checkout, between "Order history" and "Cancellations", where
// nobody found it.
//
// A list, one row per courier; adding or editing one opens a modal. It used to
// be every courier's every setting stacked down one page, which took a fair
// bit of scrolling to find the one box you came for.
//
// The list's order is the order dispatch offers them in, so the arrows on each
// row move a courier up or down and save at once.
//
// A followed courier whose stage lists leave something undone - orders that
// never complete, a van never "out" - says so on its row. Nothing else would:
// the shop simply never does the thing, which looks exactly like it working.
//
// Each Save writes straight away, and writes only the one courier. It re-reads
// the config immediately before saving and changes ONLY that courier on the
// fresh copy. Saving a whole snapshot taken minutes ago would quietly undo
// anything another tab, or another person, had saved in between - and settings
// that silently revert are the hardest kind of bug to be believed about.

type Editing = { courier: Courier; isNew: boolean }

const MISSING_LABEL: Record<StageListKey, string> = {
  deliveredStages: 'Never marks orders complete',
  outForDeliveryStages: 'Never says out for delivery',
  failedStages: 'Won\u2019t spot failed deliveries',
}

async function writeCouriers(change: (current: Courier[]) => Courier[]): Promise<{ couriers?: Courier[]; error?: string }> {
  try {
    const current = await fetch('/api/m/shop/admin/settings')
    if (!current.ok) return { error: `Couldn't load your settings (error ${current.status}). Please try again.` }
    const { config } = (await current.json()) as { config: ShpConfig }

    const res = await fetch('/api/m/shop/admin/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...config, deliveryCouriers: change(config.deliveryCouriers ?? []) }),
    })
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null
      return { error: data?.error ?? `Couldn't save (error ${res.status}). Please try again.` }
    }
    const saved = (await res.json()) as { config: ShpConfig }
    return { couriers: saved.config.deliveryCouriers ?? [] }
  } catch {
    return { error: "Couldn't reach the server. Check your connection and try again." }
  }
}

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  return (words.length === 1 ? words[0]!.slice(0, 2) : `${words[0]![0]}${words[1]![0]}`).toUpperCase()
}

export function CourierSettingsPanel() {
  const [couriers, setCouriers] = useState<Courier[] | null>(null)
  const [loadError, setLoadError] = useState('')
  const [editing, setEditing] = useState<Editing | null>(null)
  const [message, setMessage] = useState('')
  const [moveError, setMoveError] = useState('')
  const [moving, setMoving] = useState(false)

  useEffect(() => {
    let live = true
    fetch('/api/m/shop/admin/settings')
      .then(async (res) => {
        if (!res.ok) throw new Error('load')
        const { config } = (await res.json()) as { config: ShpConfig }
        if (live) setCouriers(config.deliveryCouriers ?? [])
      })
      .catch(() => live && setLoadError('Could not load your couriers. Refresh the page and try again.'))
    return () => { live = false }
  }, [])

  function open(next: Editing) {
    setMessage('')
    setMoveError('')
    setEditing(next)
  }

  async function saveCourier(courier: Courier, isNew: boolean, { close }: SaveOptions): Promise<string | null> {
    const result = await writeCouriers((current) => (
      current.some((c) => c.id === courier.id)
        ? current.map((c) => (c.id === courier.id ? courier : c))
        : [...current, courier]
    ))
    if (result.error) return result.error
    setCouriers(result.couriers ?? [])
    if (close) {
      setEditing(null)
      setMessage(isNew ? `${courier.name} added.` : `${courier.name} saved.`)
    }
    return null
  }

  // Shown moved at once, saved behind it, and put back if the save fails.
  async function move(id: string, by: -1 | 1) {
    if (!couriers || moving) return
    const from = couriers.findIndex((c) => c.id === id)
    const to = from + by
    if (from < 0 || to < 0 || to >= couriers.length) return
    const before = couriers
    const next = [...couriers]
    ;[next[from], next[to]] = [next[to]!, next[from]!]
    const order = next.map((c) => c.id)
    setCouriers(next)
    setMessage('')
    setMoveError('')
    setMoving(true)
    // Against the fresh copy: anything added elsewhere since keeps its place
    // at the end rather than being dropped by a list this screen never saw.
    const result = await writeCouriers((current) => [
      ...order.flatMap((cid) => current.filter((c) => c.id === cid)),
      ...current.filter((c) => !order.includes(c.id)),
    ])
    setMoving(false)
    if (result.error) {
      setCouriers(before)
      setMoveError(result.error)
      return
    }
    setCouriers(result.couriers ?? next)
  }

  async function removeCourier(courier: Courier): Promise<string | null> {
    const result = await writeCouriers((current) => current.filter((c) => c.id !== courier.id))
    if (result.error) return result.error
    setCouriers(result.couriers ?? [])
    setEditing(null)
    setMessage(`${courier.name.trim() || 'Courier'} removed.`)
    return null
  }

  if (loadError && !couriers) return <div className="alert alert-danger">{loadError}</div>
  if (!couriers) return null

  return (
    <div className="card">
      <style dangerouslySetInnerHTML={{ __html: couriersCss }} />

      <div className="scr-head">
        <div>
          <h3>
            Couriers
            <InfoTip>
              The couriers you actually use, so dispatch is a pick from a list rather than a name typed
              out again on every parcel. Leave it empty and dispatch keeps the plain box it has always
              had. Each courier carries its own delivery questions, and its own answer to whether
              customers should be shown its tracking page.
            </InfoTip>
          </h3>
          <p>Who takes your parcels, and what customers are told about each one.</p>
        </div>
        {couriers.length > 0 && (
          <button type="button" className="btn btn-primary btn-sm" onClick={() => open({ courier: blankCourier(), isNew: true })}>
            + Add courier
          </button>
        )}
      </div>

      {couriers.length === 0 ? (
        <div className="scr-empty">
          <strong>No couriers yet</strong>
          Dispatch will ask you to type the courier&rsquo;s name each time until you add one.
          <div>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => open({ courier: blankCourier(), isNew: true })}>
              + Add your first courier
            </button>
          </div>
        </div>
      ) : (
        <ul className="scr-list">
          {couriers.map((c, i) => (
            <li key={c.id} className="scr-row">
              {couriers.length > 1 && (
                <div className="scr-order">
                  <button
                    type="button"
                    className="scr-icon-btn"
                    aria-label={`Move ${c.name} up`}
                    title="Move up"
                    disabled={moving || i === 0}
                    onClick={() => move(c.id, -1)}
                  >
                    {ArrowUpIcon}
                  </button>
                  <button
                    type="button"
                    className="scr-icon-btn"
                    aria-label={`Move ${c.name} down`}
                    title="Move down"
                    disabled={moving || i === couriers.length - 1}
                    onClick={() => move(c.id, 1)}
                  >
                    {ArrowDownIcon}
                  </button>
                </div>
              )}
              <span className="scr-avatar" aria-hidden="true">{initials(c.name)}</span>
              <div className="scr-main">
                <div className="scr-name">{c.name}</div>
                <div className="scr-meta">
                  {c.trackingSource === 'none'
                    ? <span className="badge badge-default">Updated by hand</span>
                    : <span className="badge badge-success">Tracked automatically · {TRACKING_SOURCE_LABELS[c.trackingSource]}</span>}
                  <span className="badge badge-default">
                    {c.showTrackingLink ? 'Tracking page shown' : 'Tracking page hidden'}
                  </span>
                  {missingStageLists(c).map((key) => (
                    <span key={key} className="badge badge-warning scr-badge-warn">{AlertIcon}{MISSING_LABEL[key]}</span>
                  ))}
                  {c.faqs.length > 0 && (
                    <span className="badge badge-default">
                      {c.faqs.length} delivery question{c.faqs.length === 1 ? '' : 's'}
                    </span>
                  )}
                </div>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                aria-label={`Edit ${c.name}`}
                onClick={() => open({ courier: c, isNew: false })}
              >
                Edit
              </button>
            </li>
          ))}
        </ul>
      )}

      {message && <p className="scr-status scr-status--ok" role="status">{message}</p>}
      {moveError && <p className="scr-status scr-status--err" role="alert">{moveError}</p>}

      {editing && (
        <CourierEditModal
          initial={editing.courier}
          isNew={editing.isNew}
          otherNames={couriers.filter((c) => c.id !== editing.courier.id).map((c) => c.name)}
          onClose={() => setEditing(null)}
          onSave={(courier, options) => saveCourier(courier, editing.isNew, options)}
          onRemove={editing.isNew ? undefined : () => removeCourier(editing.courier)}
        />
      )}
    </div>
  )
}
