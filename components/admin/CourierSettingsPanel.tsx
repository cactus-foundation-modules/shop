'use client'

import { useEffect, useState } from 'react'
import { CourierSettings } from '@/modules/shop/components/admin/CourierSettings'
import type { ShpConfig } from '@/modules/shop/lib/config'

// The Couriers tab on Tax & shipping.
//
// It lives here rather than among the shop's settings because that is where
// somebody looks for it: couriers are how the goods get there, which is the same
// question as the shipping rates on the tab beside them. It was briefly buried
// under Settings > Checkout, between "Order history" and "Cancellations", where
// nobody found it.
//
// It reads and writes the same settings blob as the settings screen, so it does
// the one thing that screen cannot: it re-reads the config immediately before
// saving and changes ONLY deliveryCouriers on the fresh copy. Saving a whole
// snapshot taken minutes ago would quietly undo anything another tab, or
// another person, had saved in between - and settings that silently revert are
// the hardest kind of bug to be believed about.

type Courier = ShpConfig['deliveryCouriers'][number]

export function CourierSettingsPanel() {
  const [couriers, setCouriers] = useState<Courier[] | null>(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let live = true
    fetch('/api/m/shop/admin/settings')
      .then(async (res) => {
        if (!res.ok) throw new Error('load')
        const { config } = (await res.json()) as { config: ShpConfig }
        if (live) setCouriers(config.deliveryCouriers ?? [])
      })
      .catch(() => live && setError('Could not load your couriers. Refresh the page and try again.'))
    return () => { live = false }
  }, [])

  async function save() {
    if (!couriers) return
    setSaving(true)
    setMessage('')
    setError('')
    try {
      const current = await fetch('/api/m/shop/admin/settings')
      if (!current.ok) throw new Error('reload')
      const { config } = (await current.json()) as { config: ShpConfig }

      const res = await fetch('/api/m/shop/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...config, deliveryCouriers: couriers }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setError(data?.error ?? `Couldn't save (error ${res.status}). Please try again.`)
        return
      }
      const saved = (await res.json()) as { config: ShpConfig }
      setCouriers(saved.config.deliveryCouriers ?? [])
      setMessage('Couriers saved.')
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.")
    } finally {
      setSaving(false)
    }
  }

  if (error && !couriers) return <div className="alert alert-danger">{error}</div>
  if (!couriers) return null

  return (
    <div className="card">
      <h3 className="card-title" style={{ fontSize: '1rem' }}>Couriers</h3>
      <p className="field-hint" style={{ marginBottom: '1rem' }}>
        The couriers you actually use, so dispatch is a pick from a list rather than a name typed out
        again on every parcel. Leave it empty and dispatch keeps the plain box it has always had.
        Each courier carries its own delivery questions, and its own answer to whether customers
        should be shown its tracking page.
      </p>

      <CourierSettings value={couriers} onChange={setCouriers} />

      {error && <p style={{ color: 'var(--color-danger)', marginTop: '0.75rem' }}>{error}</p>}
      {message && <p style={{ color: 'var(--color-success)', marginTop: '0.75rem' }}>{message}</p>}

      <div style={{ marginTop: '1rem' }}>
        <button type="button" className="btn btn-primary" disabled={saving} onClick={save}>
          {saving ? 'Saving…' : 'Save couriers'}
        </button>
      </div>
    </div>
  )
}
