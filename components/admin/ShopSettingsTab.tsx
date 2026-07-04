'use client'

import { useEffect, useState } from 'react'
import type { ShpConfig } from '@/modules/shop/lib/config'
import type { ShpEmailTemplate } from '@/modules/shop/lib/types'

const PAYMENT_METHODS = ['STRIPE', 'PAYPAL', 'BANK_TRANSFER', 'CASH'] as const

export function ShopSettingsTab() {
  const [config, setConfig] = useState<ShpConfig | null>(null)
  const [envStatus, setEnvStatus] = useState<{ stripe: boolean; paypal: boolean } | null>(null)
  const [templates, setTemplates] = useState<ShpEmailTemplate[]>([])
  const [saving, setSaving] = useState(false)
  const [forbidden, setForbidden] = useState(false)

  useEffect(() => {
    fetch('/api/m/shop/admin/settings').then(async (res) => {
      if (res.status === 403) { setForbidden(true); return }
      const data = await res.json()
      setConfig(data.config)
      setEnvStatus(data.envStatus)
    })
    fetch('/api/m/shop/admin/email-templates').then(async (res) => {
      if (res.ok) setTemplates((await res.json()).templates)
    })
  }, [])

  async function save() {
    if (!config) return
    setSaving(true)
    const res = await fetch('/api/m/shop/admin/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(config) })
    if (res.ok) setConfig((await res.json()).config)
    setSaving(false)
  }

  async function saveTemplate(template: ShpEmailTemplate) {
    await fetch('/api/m/shop/admin/email-templates', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trigger: template.trigger, subject: template.subject, bodyHtml: template.bodyHtml, isActive: template.isActive }),
    })
  }

  if (forbidden) return <div>Only shop managers can view or change shop settings.</div>
  if (!config) return null

  function set<K extends keyof ShpConfig>(key: K, value: ShpConfig[K]) {
    setConfig((c) => (c ? { ...c, [key]: value } : c))
  }

  return (
    <div style={{ display: 'grid', gap: '2rem', maxWidth: 640 }}>
      <section style={{ display: 'grid', gap: '0.75rem' }}>
        <h3 style={{ margin: 0, fontSize: '0.9375rem' }}>Store identity</h3>
        <label>Currency code<input value={config.currency} onChange={(e) => set('currency', e.target.value)} style={inputStyle} /></label>
        <label>Currency symbol<input value={config.currencySymbol} onChange={(e) => set('currencySymbol', e.target.value)} style={inputStyle} /></label>
        <label>Store email<input value={config.storeEmail} onChange={(e) => set('storeEmail', e.target.value)} style={inputStyle} /></label>
        <label>Order number prefix<input value={config.orderNumberPrefix} onChange={(e) => set('orderNumberPrefix', e.target.value)} style={inputStyle} /></label>
      </section>

      <section style={{ display: 'grid', gap: '0.75rem' }}>
        <h3 style={{ margin: 0, fontSize: '0.9375rem' }}>Tax</h3>
        <label>
          Tax mode
          <select value={config.taxMode} onChange={(e) => set('taxMode', e.target.value as ShpConfig['taxMode'])} style={inputStyle}>
            <option value="INCLUSIVE">Inclusive</option>
            <option value="EXCLUSIVE">Exclusive</option>
          </select>
        </label>
      </section>

      <section style={{ display: 'grid', gap: '0.75rem' }}>
        <h3 style={{ margin: 0, fontSize: '0.9375rem' }}>Payment methods</h3>
        {PAYMENT_METHODS.map((method) => {
          const configured = method === 'STRIPE' ? envStatus?.stripe : method === 'PAYPAL' ? envStatus?.paypal : true
          return (
            <label key={method} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input
                type="checkbox"
                checked={config.enabledPaymentMethods.includes(method)}
                onChange={(e) => set('enabledPaymentMethods', e.target.checked
                  ? [...config.enabledPaymentMethods, method]
                  : config.enabledPaymentMethods.filter((m) => m !== method))}
              />
              {method}
              {!configured && <span style={{ color: 'var(--color-text-muted)', fontSize: '0.8125rem' }}>(env vars not set)</span>}
            </label>
          )
        })}
        <label>Bank transfer instructions<textarea value={config.bankTransferInstructions} onChange={(e) => set('bankTransferInstructions', e.target.value)} style={{ ...inputStyle, minHeight: 80 }} /></label>
        <label>Cash instructions<textarea value={config.cashInstructions} onChange={(e) => set('cashInstructions', e.target.value)} style={{ ...inputStyle, minHeight: 80 }} /></label>
      </section>

      <section style={{ display: 'grid', gap: '0.75rem' }}>
        <h3 style={{ margin: 0, fontSize: '0.9375rem' }}>Shop status</h3>
        <select value={config.shopStatus} onChange={(e) => set('shopStatus', e.target.value as ShpConfig['shopStatus'])} style={inputStyle}>
          <option value="OPEN">Open</option>
          <option value="BROWSE_ONLY">Browse only</option>
          <option value="CLOSED">Closed</option>
        </select>
        <label>Closed message<input value={config.shopClosedMessage} onChange={(e) => set('shopClosedMessage', e.target.value)} style={inputStyle} /></label>
      </section>

      <button onClick={save} disabled={saving} style={buttonStyle}>{saving ? 'Saving…' : 'Save settings'}</button>

      <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '1.5rem' }}>
        <h3 style={{ margin: '0 0 1rem', fontSize: '0.9375rem' }}>Email templates</h3>
        <div style={{ display: 'grid', gap: '1rem' }}>
          {templates.map((t) => (
            <details key={t.trigger}>
              <summary style={{ cursor: 'pointer', fontWeight: 600 }}>{t.trigger}</summary>
              <div style={{ display: 'grid', gap: '0.5rem', marginTop: '0.5rem' }}>
                <input
                  value={t.subject}
                  onChange={(e) => setTemplates((prev) => prev.map((p) => (p.trigger === t.trigger ? { ...p, subject: e.target.value } : p)))}
                  style={inputStyle}
                />
                <textarea
                  value={t.bodyHtml}
                  onChange={(e) => setTemplates((prev) => prev.map((p) => (p.trigger === t.trigger ? { ...p, bodyHtml: e.target.value } : p)))}
                  style={{ ...inputStyle, minHeight: 100, fontFamily: 'monospace', fontSize: '0.8125rem' }}
                />
                <button onClick={() => saveTemplate(t)} style={{ ...buttonStyle, justifySelf: 'start' }}>Save template</button>
              </div>
            </details>
          ))}
        </div>
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = { display: 'block', width: '100%', padding: '0.5rem 0.75rem', borderRadius: 6, border: '1px solid var(--color-border)', marginTop: '0.25rem' }
const buttonStyle: React.CSSProperties = { background: 'var(--color-primary)', color: 'var(--color-primary-contrast, #fff)', border: 'none', borderRadius: 8, padding: '0.625rem 1.25rem', fontWeight: 600, cursor: 'pointer' }
