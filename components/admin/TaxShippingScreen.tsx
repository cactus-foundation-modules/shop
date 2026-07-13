'use client'

import { useEffect, useState } from 'react'
import type { ShpTaxClass, ShpShippingZone, ShpTaxZoneRate, ShpShippingRate, ShpShippingRateType } from '@/modules/shop/lib/types'
import { useConfirm } from '@/modules/shop/components/admin/dialogs'

const hr: React.CSSProperties = { border: 'none', borderTop: '1px solid var(--color-border)', margin: '1.25rem 0' }
const sectionHeading: React.CSSProperties = { margin: '0 0 0.5rem', fontSize: '0.9375rem', fontWeight: 600 }
const detailsStyle: React.CSSProperties = { marginBottom: '0.75rem' }
const summaryStyle: React.CSSProperties = { cursor: 'pointer', fontSize: '0.8125rem', color: 'var(--color-text-muted)' }
const panelStyle: React.CSSProperties = { border: '1px solid var(--color-border)', borderRadius: 8, padding: '0.75rem', marginTop: '0.75rem' }

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

function slugifyTaxClassCode(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

function zoneSummary(z: ShpShippingZone): string {
  return z.postcodes.length === 0 ? 'All postcodes (catch-all)' : `${z.postcodes.length} postcode prefix${z.postcodes.length === 1 ? '' : 'es'}`
}

export function TaxShippingScreen() {
  const [confirm, confirmNode] = useConfirm()
  const [taxClasses, setTaxClasses] = useState<ShpTaxClass[]>([])
  const [newClassName, setNewClassName] = useState('')
  const [classEdits, setClassEdits] = useState<Record<string, { name: string; code: string }>>({})
  const [classErrors, setClassErrors] = useState<Record<string, string>>({})

  const [zones, setZones] = useState<ShpShippingZone[]>([])
  const [openZoneId, setOpenZoneId] = useState<string | null>(null)
  const [zoneName, setZoneName] = useState('')
  const [zonePostcodesText, setZonePostcodesText] = useState('')
  const [zoneMessage, setZoneMessage] = useState('')

  const [taxRateInputs, setTaxRateInputs] = useState<Record<string, string>>({})
  const [taxSavedClassId, setTaxSavedClassId] = useState<string | null>(null)

  const [shippingRates, setShippingRates] = useState<ShpShippingRate[]>([])
  const [editingRateId, setEditingRateId] = useState<string | 'new' | null>(null)
  const [rateForm, setRateForm] = useState<RateForm>(BLANK_RATE_FORM)
  const [rateError, setRateError] = useState('')

  useEffect(() => {
    loadTaxClasses()
    loadZones()
  }, [])

  function loadTaxClasses() {
    fetch('/api/m/shop/admin/tax-classes').then(async (r) => {
      if (!r.ok) return
      const classes: ShpTaxClass[] = (await r.json()).taxClasses
      setTaxClasses(classes)
      const edits: Record<string, { name: string; code: string }> = {}
      classes.forEach((tc) => { edits[tc.id] = { name: tc.name, code: tc.code } })
      setClassEdits(edits)
    })
  }

  function loadZones() {
    fetch('/api/m/shop/admin/shipping-zones').then(async (r) => { if (r.ok) setZones((await r.json()).zones) })
  }

  async function addTaxClass() {
    const name = newClassName.trim()
    const code = slugifyTaxClassCode(name)
    if (!name || !code) return
    await fetch('/api/m/shop/admin/tax-classes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, code }),
    })
    setNewClassName('')
    loadTaxClasses()
  }

  async function saveTaxClassEdit(id: string) {
    const edit = classEdits[id]
    const tc = taxClasses.find((c) => c.id === id)
    if (!edit || !tc) return
    const fields: Partial<{ name: string; code: string }> = {}
    if (edit.name.trim() && edit.name.trim() !== tc.name) fields.name = edit.name.trim()
    if (edit.code.trim() && edit.code.trim() !== tc.code) fields.code = edit.code.trim()
    if (Object.keys(fields).length === 0) return
    setClassErrors((prev) => ({ ...prev, [id]: '' }))
    const res = await fetch(`/api/m/shop/admin/tax-classes/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fields) })
    if (!res.ok) {
      const body = await res.json().catch(() => null)
      setClassErrors((prev) => ({ ...prev, [id]: body?.error ?? 'Save failed - that code may already be in use.' }))
      return
    }
    loadTaxClasses()
  }

  async function removeTaxClass(id: string) {
    if (!(await confirm({ title: 'Delete tax class?', message: 'Products using it will lose their tax class.' }))) return
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
    openZone(id, 'New zone', [])
  }

  function openZone(id: string, name: string, postcodes: string[]) {
    setOpenZoneId(id)
    setZoneName(name)
    setZonePostcodesText(postcodes.join('\n'))
    setZoneMessage('')
    setEditingRateId(null)
    fetch(`/api/m/shop/admin/tax-zone-rates?zoneId=${id}`).then(async (r) => {
      if (!r.ok) return
      const rates: ShpTaxZoneRate[] = (await r.json()).rates
      const inputs: Record<string, string> = {}
      rates.forEach((rate) => { inputs[rate.taxClassId] = String(Math.round(Number(rate.rate) * 10000) / 100) })
      setTaxRateInputs(inputs)
    })
    fetch(`/api/m/shop/admin/shipping-zones/${id}`).then(async (r) => { if (r.ok) setShippingRates((await r.json()).rates) })
  }

  function toggleZone(z: ShpShippingZone) {
    if (openZoneId === z.id) setOpenZoneId(null)
    else openZone(z.id, z.name, z.postcodes)
  }

  async function saveZone() {
    if (!openZoneId) return
    setZoneMessage('')
    const postcodes = zonePostcodesText.split('\n').map((s) => s.trim()).filter(Boolean)
    await fetch(`/api/m/shop/admin/shipping-zones/${openZoneId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: zoneName, postcodes }),
    })
    setZoneMessage('Zone saved.')
    loadZones()
  }

  async function deleteZone() {
    if (!openZoneId) return
    if (!(await confirm({ title: 'Delete zone?', message: 'Its tax rates and shipping rates are deleted too.' }))) return
    await fetch(`/api/m/shop/admin/shipping-zones/${openZoneId}`, { method: 'DELETE' })
    setOpenZoneId(null)
    loadZones()
  }

  async function saveTaxRate(taxClassId: string, percentValue: string) {
    if (!openZoneId) return
    const percent = Number(percentValue)
    if (Number.isNaN(percent) || percent < 0 || percent > 100) return
    await fetch('/api/m/shop/admin/tax-zone-rates', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ zoneId: openZoneId, taxClassId, rate: percent / 100 }),
    })
    setTaxSavedClassId(taxClassId)
    setTimeout(() => setTaxSavedClassId((cur) => (cur === taxClassId ? null : cur)), 2000)
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
    if (!openZoneId || !editingRateId) return
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
      ? await fetch('/api/m/shop/admin/shipping-rates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, zoneId: openZoneId }) })
      : await fetch(`/api/m/shop/admin/shipping-rates/${editingRateId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

    if (!res.ok) { setRateError((await res.json()).error ?? 'Save failed'); return }

    setEditingRateId(null)
    fetch(`/api/m/shop/admin/shipping-zones/${openZoneId}`).then(async (r) => { if (r.ok) setShippingRates((await r.json()).rates) })
  }

  async function deleteRate(id: string) {
    if (!openZoneId) return
    if (!(await confirm({ title: 'Delete shipping rate?', message: 'This shipping rate will be removed.' }))) return
    await fetch(`/api/m/shop/admin/shipping-rates/${id}`, { method: 'DELETE' })
    fetch(`/api/m/shop/admin/shipping-zones/${openZoneId}`).then(async (r) => { if (r.ok) setShippingRates((await r.json()).rates) })
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

  const newCodePreview = slugifyTaxClassCode(newClassName)

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Tax &amp; shipping</h1>
      </div>

      <div className="card">
        <h3 className="card-title" style={{ fontSize: '1rem' }}>Tax classes</h3>
        <p className="field-hint" style={{ marginBottom: '0.75rem' }}>
          Every product gets a tax class (e.g. Standard, Reduced, Zero-rated). Each zone below sets its own rate for each class.
        </p>
        {taxClasses.map((tc) => {
          const edit = classEdits[tc.id] ?? { name: tc.name, code: tc.code }
          const dirty = edit.name.trim() !== tc.name || edit.code.trim() !== tc.code
          return (
            <div key={tc.id} style={{ marginBottom: '0.5rem' }}>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <div className="field" style={{ margin: 0, flex: 2 }}>
                  <input value={edit.name} aria-label="Tax class name" onChange={(e) => setClassEdits((prev) => ({ ...prev, [tc.id]: { ...edit, name: e.target.value } }))} style={{ width: '100%' }} />
                </div>
                <div className="field" style={{ margin: 0, flex: 1 }}>
                  <input value={edit.code} aria-label="Tax class code" onChange={(e) => setClassEdits((prev) => ({ ...prev, [tc.id]: { ...edit, code: e.target.value } }))} style={{ width: '100%' }} />
                </div>
                {dirty && (
                  <button className="btn btn-secondary btn-sm" onClick={() => saveTaxClassEdit(tc.id)} disabled={!edit.name.trim() || !edit.code.trim()} style={{ flexShrink: 0 }}>Save</button>
                )}
                <button className="btn btn-ghost btn-sm" onClick={() => removeTaxClass(tc.id)} style={{ color: 'var(--color-destructive)', flexShrink: 0 }}>Delete</button>
              </div>
              {classErrors[tc.id] && <p className="field-hint" style={{ color: 'var(--color-destructive)', margin: '0.25rem 0 0' }}>{classErrors[tc.id]}</p>}
            </div>
          )
        })}
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: taxClasses.length ? '0.75rem' : 0 }}>
          <div className="field" style={{ margin: 0, flex: 1 }}>
            <input
              value={newClassName}
              onChange={(e) => setNewClassName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') addTaxClass() }}
              placeholder="New class, e.g. Reduced rate"
              aria-label="New tax class name"
              style={{ width: '100%' }}
            />
          </div>
          <button className="btn btn-secondary btn-sm" onClick={addTaxClass} disabled={!newCodePreview} style={{ flexShrink: 0 }}>+ Add</button>
        </div>
        <p className="field-hint" style={{ marginTop: '0.5rem', marginBottom: 0, fontSize: '0.75rem' }}>
          {newCodePreview ? `Code will be "${newCodePreview}" - generated for you, editable on the row afterwards.` : 'The code is generated for you and can be edited on the row afterwards.'}
        </p>
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <h3 className="card-title" style={{ fontSize: '1rem' }}>Zones</h3>
          <button className="btn btn-secondary btn-sm" onClick={createZone}>+ New zone</button>
        </div>
        <p className="field-hint" style={{ marginBottom: '0.5rem' }}>
          A zone groups postcodes that share the same tax rates and shipping options. Most shops only need one.
        </p>
        <details style={detailsStyle}>
          <summary style={summaryStyle}>How zones work</summary>
          <p className="field-hint" style={{ marginTop: '0.5rem' }}>
            For one flat rate covering your whole country (e.g. 20% UK VAT everywhere), create a single zone and leave its postcode list empty - no need to list every postcode. Only add prefixes if you need different rates for different regions (e.g. a zone per US state for state sales tax). A prefix matches anything starting with it - &quot;SW&quot; covers all London SW postcodes, &quot;9&quot; covers US ZIP codes starting with 9. The longest matching prefix wins, so a shopper is only ever placed in one zone.
          </p>
        </details>

        {zones.length === 0 && <p style={{ color: 'var(--color-text-muted)' }}>No zones yet. Create one to set tax and shipping rates.</p>}

        {zones.map((z) => (
          <div key={z.id} style={{ border: '1px solid var(--color-border)', borderRadius: 8, marginBottom: '0.5rem', overflow: 'hidden' }}>
            <button
              onClick={() => toggleZone(z)}
              aria-expanded={openZoneId === z.id}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', padding: '0.75rem', background: openZoneId === z.id ? 'var(--color-bg-subtle)' : 'var(--color-surface)', border: 'none', cursor: 'pointer', textAlign: 'left', color: 'var(--color-text)' }}
            >
              <span>
                <strong>{z.name}</strong>
                <span className="field-hint" style={{ display: 'block', fontSize: '0.75rem' }}>{zoneSummary(z)}</span>
              </span>
              <span aria-hidden="true" style={{ color: 'var(--color-text-muted)', transform: openZoneId === z.id ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>&#9656;</span>
            </button>

            {openZoneId === z.id && (
              <div style={{ padding: '0.75rem', borderTop: '1px solid var(--color-border)' }}>
                {zoneMessage && <div className="alert alert-success">{zoneMessage}</div>}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div className="field" style={{ margin: 0 }}>
                    <label>Zone name</label>
                    <input value={zoneName} onChange={(e) => setZoneName(e.target.value)} />
                  </div>
                  <div className="field" style={{ margin: 0 }}>
                    <label>Postcode prefixes (one per line, optional)</label>
                    <textarea rows={3} value={zonePostcodesText} onChange={(e) => setZonePostcodesText(e.target.value)} placeholder={'Leave blank to cover every postcode'} />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.75rem' }}>
                  <button className="btn btn-primary btn-sm" onClick={saveZone}>Save zone</button>
                  <button className="btn btn-ghost btn-sm" style={{ color: 'var(--color-destructive)' }} onClick={deleteZone}>Delete zone</button>
                </div>

                <hr style={hr} />
                <h4 style={sectionHeading}>Tax rates</h4>
                {taxClasses.length === 0 && <p className="field-hint">Add a tax class above first.</p>}
                {taxClasses.map((tc) => (
                  <div key={tc.id} className="field" style={{ display: 'grid', gridTemplateColumns: '1fr 100px 60px', gap: '0.75rem', alignItems: 'center', margin: 0, marginBottom: 'var(--space-2)' }}>
                    <label style={{ margin: 0 }}>{tc.name}</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      <input
                        type="number" min={0} max={100} step="0.01"
                        aria-label={`${tc.name} tax rate`}
                        value={taxRateInputs[tc.id] ?? '0'}
                        onChange={(e) => setTaxRateInputs((prev) => ({ ...prev, [tc.id]: e.target.value }))}
                        onBlur={(e) => saveTaxRate(tc.id, e.target.value)}
                      />
                      <span className="field-hint">%</span>
                    </div>
                    <span className="field-hint" style={{ fontSize: '0.75rem', color: 'var(--color-success)' }}>
                      {taxSavedClassId === tc.id ? 'Saved' : ''}
                    </span>
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
                  <div style={panelStyle}>
                    {rateError && <div className="alert alert-danger">{rateError}</div>}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
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

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
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
        ))}
      </div>
      {confirmNode}
    </div>
  )
}
