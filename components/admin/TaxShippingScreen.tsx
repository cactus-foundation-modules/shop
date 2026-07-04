'use client'

import { useEffect, useState } from 'react'
import type { ShpTaxClass, ShpShippingZone, ShpTaxZoneRate, ShpShippingRate, ShpShippingRateType } from '@/modules/shop/lib/types'

const hr: React.CSSProperties = { border: 'none', borderTop: '1px solid var(--color-border)', margin: '1.5rem 0' }
const sectionHeading: React.CSSProperties = { margin: '0 0 0.5rem', fontSize: '0.9375rem', fontWeight: 600 }
const headerCellStyle: React.CSSProperties = { padding: '0.5rem 0.75rem', fontSize: '0.75rem', fontWeight: 500, color: 'var(--color-text-muted)', background: 'var(--color-bg-subtle)', borderBottom: '1px solid var(--color-border)' }
const cellStyle: React.CSSProperties = { padding: '0.5rem 0.75rem', background: 'var(--color-surface)', display: 'flex', alignItems: 'center' }

const RATE_TYPE_LABELS: Record<ShpShippingRateType, string> = { FLAT: 'Flat rate', WEIGHT_BASED: 'Weight-based', FREE: 'Free shipping' }

type RateForm = {
  name: string
  type: ShpShippingRateType
  flatRate: string
  weightRates: Array<{ upToKg: string; rate: string }>
  freeThreshold: string
  estimatedDays: string
  isActive: boolean
}

const BLANK_RATE_FORM: RateForm = { name: '', type: 'FLAT', flatRate: '', weightRates: [], freeThreshold: '', estimatedDays: '', isActive: true }

export function TaxShippingScreen() {
  const [taxClasses, setTaxClasses] = useState<ShpTaxClass[]>([])
  const [newClassName, setNewClassName] = useState('')
  const [newClassCode, setNewClassCode] = useState('')

  const [zones, setZones] = useState<ShpShippingZone[]>([])
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null)
  const [zoneName, setZoneName] = useState('')
  const [zonePostcodesText, setZonePostcodesText] = useState('')
  const [zoneMessage, setZoneMessage] = useState('')

  const [taxRates, setTaxRates] = useState<ShpTaxZoneRate[]>([])
  const [taxRateInputs, setTaxRateInputs] = useState<Record<string, string>>({})

  const [shippingRates, setShippingRates] = useState<ShpShippingRate[]>([])
  const [editingRateId, setEditingRateId] = useState<string | 'new' | null>(null)
  const [rateForm, setRateForm] = useState<RateForm>(BLANK_RATE_FORM)
  const [rateError, setRateError] = useState('')

  useEffect(() => {
    loadTaxClasses()
    loadZones()
  }, [])

  function loadTaxClasses() {
    fetch('/api/m/shop/admin/tax-classes').then(async (r) => { if (r.ok) setTaxClasses((await r.json()).taxClasses) })
  }

  function loadZones() {
    fetch('/api/m/shop/admin/shipping-zones').then(async (r) => { if (r.ok) setZones((await r.json()).zones) })
  }

  async function addTaxClass() {
    if (!newClassName.trim() || !newClassCode.trim()) return
    await fetch('/api/m/shop/admin/tax-classes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newClassName.trim(), code: newClassCode.trim() }),
    })
    setNewClassName('')
    setNewClassCode('')
    loadTaxClasses()
  }

  async function renameTaxClass(id: string, fields: Partial<{ name: string; code: string }>) {
    await fetch(`/api/m/shop/admin/tax-classes/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fields) })
    loadTaxClasses()
  }

  async function removeTaxClass(id: string) {
    if (!confirm('Delete this tax class? Products using it will lose their tax class.')) return
    await fetch(`/api/m/shop/admin/tax-classes/${id}`, { method: 'DELETE' })
    loadTaxClasses()
  }

  async function createZone() {
    const res = await fetch('/api/m/shop/admin/shipping-zones', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'New zone', postcodes: [] }),
    })
    const { id } = await res.json()
    loadZones()
    selectZone(id, 'New zone', [])
  }

  function selectZone(id: string, name: string, postcodes: string[]) {
    setSelectedZoneId(id)
    setZoneName(name)
    setZonePostcodesText(postcodes.join('\n'))
    setZoneMessage('')
    setEditingRateId(null)
    fetch(`/api/m/shop/admin/tax-zone-rates?zoneId=${id}`).then(async (r) => {
      if (!r.ok) return
      const rates: ShpTaxZoneRate[] = (await r.json()).rates
      setTaxRates(rates)
      const inputs: Record<string, string> = {}
      rates.forEach((r) => { inputs[r.taxClassId] = String(Math.round(Number(r.rate) * 10000) / 100) })
      setTaxRateInputs(inputs)
    })
    fetch(`/api/m/shop/admin/shipping-zones/${id}`).then(async (r) => { if (r.ok) setShippingRates((await r.json()).rates) })
  }

  async function saveZone() {
    if (!selectedZoneId) return
    setZoneMessage('')
    const postcodes = zonePostcodesText.split('\n').map((s) => s.trim()).filter(Boolean)
    await fetch(`/api/m/shop/admin/shipping-zones/${selectedZoneId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: zoneName, postcodes }),
    })
    setZoneMessage('Zone saved.')
    loadZones()
  }

  async function deleteZone() {
    if (!selectedZoneId) return
    if (!confirm('Delete this zone? Its tax rates and shipping rates are deleted too.')) return
    await fetch(`/api/m/shop/admin/shipping-zones/${selectedZoneId}`, { method: 'DELETE' })
    setSelectedZoneId(null)
    loadZones()
  }

  async function saveTaxRate(taxClassId: string, percentValue: string) {
    if (!selectedZoneId) return
    const percent = Number(percentValue)
    if (Number.isNaN(percent) || percent < 0 || percent > 100) return
    await fetch('/api/m/shop/admin/tax-zone-rates', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ zoneId: selectedZoneId, taxClassId, rate: percent / 100 }),
    })
  }

  function startNewRate() {
    setRateForm(BLANK_RATE_FORM)
    setRateError('')
    setEditingRateId('new')
  }

  function startEditRate(rate: ShpShippingRate) {
    setRateForm({
      name: rate.name,
      type: rate.type,
      flatRate: rate.flatRate ?? '',
      weightRates: (rate.weightRates ?? []).map((b) => ({ upToKg: String(b.upToKg), rate: String(b.rate) })),
      freeThreshold: rate.freeThreshold ?? '',
      estimatedDays: rate.estimatedDays ?? '',
      isActive: rate.isActive,
    })
    setRateError('')
    setEditingRateId(rate.id)
  }

  async function saveRate() {
    if (!selectedZoneId || !editingRateId) return
    if (!rateForm.name.trim()) { setRateError('Name is required.'); return }
    setRateError('')

    const body = {
      name: rateForm.name.trim(),
      type: rateForm.type,
      flatRate: rateForm.type === 'FLAT' ? Number(rateForm.flatRate) || 0 : null,
      weightRates: rateForm.type === 'WEIGHT_BASED'
        ? rateForm.weightRates.map((b) => ({ upToKg: Number(b.upToKg) || 0, rate: Number(b.rate) || 0 }))
        : null,
      freeThreshold: rateForm.type === 'FREE' && rateForm.freeThreshold ? Number(rateForm.freeThreshold) : null,
      estimatedDays: rateForm.estimatedDays.trim() || null,
      isActive: rateForm.isActive,
    }

    const res = editingRateId === 'new'
      ? await fetch('/api/m/shop/admin/shipping-rates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, zoneId: selectedZoneId }) })
      : await fetch(`/api/m/shop/admin/shipping-rates/${editingRateId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

    if (!res.ok) { setRateError((await res.json()).error ?? 'Save failed'); return }

    setEditingRateId(null)
    fetch(`/api/m/shop/admin/shipping-zones/${selectedZoneId}`).then(async (r) => { if (r.ok) setShippingRates((await r.json()).rates) })
  }

  async function deleteRate(id: string) {
    if (!selectedZoneId) return
    if (!confirm('Delete this shipping rate?')) return
    await fetch(`/api/m/shop/admin/shipping-rates/${id}`, { method: 'DELETE' })
    fetch(`/api/m/shop/admin/shipping-zones/${selectedZoneId}`).then(async (r) => { if (r.ok) setShippingRates((await r.json()).rates) })
  }

  function addWeightBand() {
    setRateForm((f) => ({ ...f, weightRates: [...f.weightRates, { upToKg: '', rate: '' }] }))
  }

  function updateWeightBand(index: number, patch: Partial<{ upToKg: string; rate: string }>) {
    setRateForm((f) => ({ ...f, weightRates: f.weightRates.map((b, i) => (i === index ? { ...b, ...patch } : b)) }))
  }

  function removeWeightBand(index: number) {
    setRateForm((f) => ({ ...f, weightRates: f.weightRates.filter((_, i) => i !== index) }))
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Tax &amp; shipping</h1>
      </div>

      <div className="card">
        <h3 className="card-title" style={{ fontSize: '1rem' }}>Tax classes</h3>
        <p className="field-hint" style={{ marginBottom: '0.75rem' }}>
          Every product is assigned a tax class (e.g. Standard, Reduced, Zero-rated). Each zone below sets its own rate for each class.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr auto', border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden', marginBottom: '0.75rem' }}>
          <div style={headerCellStyle}>Name</div>
          <div style={headerCellStyle}>Code</div>
          <div style={headerCellStyle}></div>
          {taxClasses.map((tc) => (
            <div key={tc.id} style={{ display: 'contents' }}>
              <div className="field" style={{ margin: 0, ...cellStyle }}>
                <input defaultValue={tc.name} onBlur={(e) => e.target.value.trim() && e.target.value !== tc.name && renameTaxClass(tc.id, { name: e.target.value.trim() })} style={{ width: '100%' }} />
              </div>
              <div className="field" style={{ margin: 0, ...cellStyle }}>
                <input defaultValue={tc.code} onBlur={(e) => e.target.value.trim() && e.target.value !== tc.code && renameTaxClass(tc.id, { code: e.target.value.trim() })} style={{ width: '100%' }} />
              </div>
              <div style={cellStyle}>
                <button className="btn btn-ghost btn-sm" onClick={() => removeTaxClass(tc.id)} style={{ color: 'var(--color-destructive)' }}>Delete</button>
              </div>
            </div>
          ))}
          <div className="field" style={{ margin: 0, ...cellStyle }}>
            <input value={newClassName} onChange={(e) => setNewClassName(e.target.value)} placeholder="e.g. Reduced rate" style={{ width: '100%' }} />
          </div>
          <div className="field" style={{ margin: 0, ...cellStyle }}>
            <input value={newClassCode} onChange={(e) => setNewClassCode(e.target.value)} placeholder="e.g. reduced" style={{ width: '100%' }} />
          </div>
          <div style={cellStyle}>
            <button className="btn btn-secondary btn-sm" onClick={addTaxClass} disabled={!newClassName.trim() || !newClassCode.trim()}>+ Add</button>
          </div>
        </div>
      </div>

      <div className="card">
        <h3 className="card-title" style={{ fontSize: '1rem' }}>Zones</h3>
        <p className="field-hint" style={{ marginBottom: '0.75rem' }}>
          A zone groups postcodes that share the same tax rate and shipping options - one zone for your whole country, or one per region (e.g. a zone per US state for state sales tax). The longest matching postcode prefix wins, so a shopper is only ever placed in one zone.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 'var(--space-5)' }}>
          <div>
            {zones.map((z) => (
              <button
                key={z.id}
                onClick={() => selectZone(z.id, z.name, z.postcodes)}
                className={`btn ${selectedZoneId === z.id ? 'btn-secondary' : 'btn-ghost'}`}
                style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: 'var(--space-1)' }}
              >
                {z.name}
                <span className="field-hint" style={{ display: 'block', fontSize: '0.75rem' }}>{z.postcodes.length} postcode{z.postcodes.length === 1 ? '' : 's'}</span>
              </button>
            ))}
            <button className="btn btn-secondary btn-sm" onClick={createZone} style={{ marginTop: 'var(--space-2)' }}>+ New zone</button>
          </div>

          <div>
            {!selectedZoneId && <p style={{ color: 'var(--color-text-muted)' }}>Select a zone to edit, or create a new one.</p>}
            {selectedZoneId && (
              <div>
                {zoneMessage && <div className="alert alert-success">{zoneMessage}</div>}
                <div className="field">
                  <label>Zone name</label>
                  <input value={zoneName} onChange={(e) => setZoneName(e.target.value)} />
                </div>
                <div className="field">
                  <label>Postcodes (one prefix per line)</label>
                  <textarea rows={4} value={zonePostcodesText} onChange={(e) => setZonePostcodesText(e.target.value)} placeholder={'SW\nEC\n90210'} />
                  <span className="field-hint">A prefix matches anything starting with it - &quot;SW&quot; covers all London SW postcodes, &quot;9&quot; covers US ZIP codes starting with 9.</span>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem' }}>
                  <button className="btn btn-primary" onClick={saveZone}>Save zone</button>
                  <button className="btn btn-secondary" style={{ color: 'var(--color-destructive)' }} onClick={deleteZone}>Delete zone</button>
                </div>

                <hr style={hr} />
                <h4 style={sectionHeading}>Tax rates</h4>
                {taxClasses.length === 0 && <p className="field-hint">Add a tax class above first.</p>}
                {taxClasses.map((tc) => (
                  <div key={tc.id} className="field" style={{ display: 'grid', gridTemplateColumns: '1fr 100px', gap: '0.75rem', alignItems: 'center', margin: 0, marginBottom: 'var(--space-2)' }}>
                    <label style={{ margin: 0 }}>{tc.name}</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      <input
                        type="number" min={0} max={100} step="0.01"
                        value={taxRateInputs[tc.id] ?? '0'}
                        onChange={(e) => setTaxRateInputs((prev) => ({ ...prev, [tc.id]: e.target.value }))}
                        onBlur={(e) => saveTaxRate(tc.id, e.target.value)}
                      />
                      <span className="field-hint">%</span>
                    </div>
                  </div>
                ))}

                <hr style={hr} />
                <h4 style={sectionHeading}>Shipping rates</h4>
                {shippingRates.length === 0 && editingRateId === null && <p className="field-hint" style={{ marginBottom: '0.75rem' }}>No shipping rates yet for this zone.</p>}
                {shippingRates.map((rate) => (
                  <div key={rate.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid var(--color-border)', borderRadius: 8, padding: '0.5rem 0.75rem', marginBottom: '0.5rem' }}>
                    <span>
                      <strong>{rate.name}</strong>{' '}
                      <span className="field-hint">
                        {RATE_TYPE_LABELS[rate.type]}
                        {rate.type === 'FLAT' && ` - ${rate.flatRate}`}
                        {rate.type === 'FREE' && rate.freeThreshold && ` - over ${rate.freeThreshold}`}
                        {rate.estimatedDays ? ` - ${rate.estimatedDays}` : ''}
                      </span>
                      {!rate.isActive && <span className="badge badge-default" style={{ marginLeft: 'var(--space-2)' }}>Off</span>}
                    </span>
                    <span style={{ display: 'flex', gap: '0.5rem' }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => startEditRate(rate)}>Edit</button>
                      <button className="btn btn-ghost btn-sm" style={{ color: 'var(--color-destructive)' }} onClick={() => deleteRate(rate.id)}>Delete</button>
                    </span>
                  </div>
                ))}

                {editingRateId === null && (
                  <button className="btn btn-secondary btn-sm" onClick={startNewRate}>+ Add shipping rate</button>
                )}

                {editingRateId !== null && (
                  <div className="card" style={{ marginTop: '0.75rem' }}>
                    {rateError && <div className="alert alert-danger">{rateError}</div>}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                      <div className="field" style={{ margin: 0 }}>
                        <label>Name</label>
                        <input value={rateForm.name} onChange={(e) => setRateForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Standard delivery" />
                      </div>
                      <div className="field" style={{ margin: 0 }}>
                        <label>Type</label>
                        <select value={rateForm.type} onChange={(e) => setRateForm((f) => ({ ...f, type: e.target.value as ShpShippingRateType }))}>
                          <option value="FLAT">Flat rate</option>
                          <option value="WEIGHT_BASED">Weight-based</option>
                          <option value="FREE">Free shipping</option>
                        </select>
                      </div>
                    </div>

                    {rateForm.type === 'FLAT' && (
                      <div className="field">
                        <label>Rate</label>
                        <input type="number" step="0.01" min={0} value={rateForm.flatRate} onChange={(e) => setRateForm((f) => ({ ...f, flatRate: e.target.value }))} />
                      </div>
                    )}

                    {rateForm.type === 'FREE' && (
                      <div className="field">
                        <label>Minimum order value (blank = always free)</label>
                        <input type="number" step="0.01" min={0} value={rateForm.freeThreshold} onChange={(e) => setRateForm((f) => ({ ...f, freeThreshold: e.target.value }))} />
                      </div>
                    )}

                    {rateForm.type === 'WEIGHT_BASED' && (
                      <div style={{ marginBottom: 'var(--form-gap)' }}>
                        <label style={{ display: 'block', fontWeight: 500, fontSize: '0.875rem', marginBottom: '0.5rem' }}>Weight bands</label>
                        <p className="field-hint" style={{ marginBottom: '0.5rem' }}>First band whose &quot;up to&quot; weight covers the order&apos;s total weight is used.</p>
                        {rateForm.weightRates.map((band, i) => (
                          <div key={i} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', alignItems: 'center' }}>
                            <input type="number" step="0.01" min={0} placeholder="Up to (kg)" value={band.upToKg} onChange={(e) => updateWeightBand(i, { upToKg: e.target.value })} style={{ flex: 1 }} />
                            <input type="number" step="0.01" min={0} placeholder="Rate" value={band.rate} onChange={(e) => updateWeightBand(i, { rate: e.target.value })} style={{ flex: 1 }} />
                            <button className="btn btn-ghost btn-sm" style={{ color: 'var(--color-destructive)' }} onClick={() => removeWeightBand(i)}>Remove</button>
                          </div>
                        ))}
                        <button className="btn btn-secondary btn-sm" onClick={addWeightBand}>+ Add band</button>
                      </div>
                    )}

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                      <div className="field" style={{ margin: 0 }}>
                        <label>Estimated delivery (optional)</label>
                        <input value={rateForm.estimatedDays} onChange={(e) => setRateForm((f) => ({ ...f, estimatedDays: e.target.value }))} placeholder="e.g. 3-5 business days" />
                      </div>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginTop: 'var(--space-5)', cursor: 'pointer' }}>
                        <input type="checkbox" checked={rateForm.isActive} onChange={(e) => setRateForm((f) => ({ ...f, isActive: e.target.checked }))} />
                        Active
                      </label>
                    </div>

                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                      <button className="btn btn-primary" onClick={saveRate}>Save rate</button>
                      <button className="btn btn-secondary" onClick={() => setEditingRateId(null)}>Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
