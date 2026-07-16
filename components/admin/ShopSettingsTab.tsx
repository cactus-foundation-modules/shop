'use client'

import { Fragment, useEffect, useState, type ReactNode } from 'react'
import { TabStrip } from '@/components/admin/TabStrip'
import type { ShpConfig } from '@/modules/shop/lib/config'
import type { ShpEmailTemplate, ShpEmailTemplateTrigger } from '@/modules/shop/lib/types'

const PAYMENT_METHODS = ['STRIPE', 'PAYPAL', 'BANK_TRANSFER', 'CASH'] as const
const PAYMENT_METHOD_LABELS: Record<(typeof PAYMENT_METHODS)[number], string> = {
  STRIPE: 'Card payments (Stripe)',
  PAYPAL: 'PayPal',
  BANK_TRANSFER: 'Bank transfer',
  CASH: 'Cash on collection',
}

const TEMPLATE_LABELS: Record<ShpEmailTemplateTrigger, string> = {
  ORDER_CONFIRMED: 'Order confirmed',
  STATUS_PROCESSING: 'Order processing',
  STATUS_SHIPPED: 'Order shipped',
  STATUS_COMPLETED: 'Order completed',
  STATUS_CANCELLED: 'Order cancelled',
  ADMIN_NEW_ORDER: 'New order (admin alert)',
  LOW_STOCK: 'Low stock (admin alert)',
  BACK_IN_STOCK: 'Back in stock',
  IMPORT_COMPLETE: 'Import complete (admin alert)',
}

type SubTab = 'general' | 'checkout' | 'payments' | 'notifications' | 'templates'

const SUB_TABS: { key: SubTab; label: string }[] = [
  { key: 'general', label: 'General' },
  { key: 'checkout', label: 'Checkout' },
  { key: 'payments', label: 'Payments' },
  { key: 'notifications', label: 'Notifications' },
  { key: 'templates', label: 'Email templates' },
]

type ProviderKeyField = { key: string; label: string; type: 'text' | 'password' | 'select'; options?: string[] }
type ProviderSection = { id: 'stripe' | 'paypal'; title: string; description: string; keys: ProviderKeyField[] }

const PROVIDER_SECTIONS: ProviderSection[] = [
  {
    id: 'stripe',
    title: 'Stripe',
    description: 'Card payments. Create keys at dashboard.stripe.com → Developers → API keys.',
    keys: [
      { key: 'STRIPE_PUBLISHABLE_KEY', label: 'Publishable key', type: 'text' },
      { key: 'STRIPE_SECRET_KEY', label: 'Secret key', type: 'password' },
      { key: 'STRIPE_WEBHOOK_SECRET', label: 'Webhook signing secret', type: 'password' },
    ],
  },
  {
    id: 'paypal',
    title: 'PayPal',
    description: 'Create an app at developer.paypal.com → Apps & Credentials.',
    keys: [
      { key: 'PAYPAL_CLIENT_ID', label: 'Client ID', type: 'text' },
      { key: 'PAYPAL_CLIENT_SECRET', label: 'Client secret', type: 'password' },
      { key: 'PAYPAL_WEBHOOK_ID', label: 'Webhook ID', type: 'text' },
      { key: 'PAYPAL_MODE', label: 'Mode', type: 'select', options: ['sandbox', 'live'] },
    ],
  },
]

const checkboxRow: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-3)', cursor: 'pointer' }
const hr: React.CSSProperties = { border: 'none', borderTop: '1px solid var(--color-border)', margin: '1.5rem 0' }
const sectionHeading: React.CSSProperties = { margin: '0 0 1rem', fontSize: '1rem', fontWeight: 600 }
const fieldGrid: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: 'var(--form-gap)' }

// `hostedSettingsSlots` carries settings panels other modules contribute to a
// named slot (see the core config page). Payment provider modules (e.g.
// GoCardless Instant Bank Pay) target 'shop.payments' so their credentials and
// toggle sit alongside Stripe and PayPal, not in a separate top-level tab.
export function ShopSettingsTab({ hostedSettingsSlots }: { hostedSettingsSlots?: Record<string, ReactNode> } = {}) {
  const [config, setConfig] = useState<ShpConfig | null>(null)
  const [envStatus, setEnvStatus] = useState<{ stripe: boolean; paypal: boolean } | null>(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [saveError, setSaveError] = useState('')
  const [forbidden, setForbidden] = useState(false)
  const [subTab, setSubTab] = useState<SubTab>('general')

  const [templates, setTemplates] = useState<ShpEmailTemplate[]>([])
  const [activeTrigger, setActiveTrigger] = useState<ShpEmailTemplateTrigger | null>(null)
  const [templateSubject, setTemplateSubject] = useState('')
  const [templateBody, setTemplateBody] = useState('')
  const [templateActive, setTemplateActive] = useState(true)
  const [templateSaving, setTemplateSaving] = useState(false)
  const [templateMessage, setTemplateMessage] = useState('')
  const [templateError, setTemplateError] = useState('')

  const [envAdminAllowed, setEnvAdminAllowed] = useState<boolean | null>(null)
  const [envKeyStatus, setEnvKeyStatus] = useState<Record<string, boolean>>({})
  const [envFields, setEnvFields] = useState<Record<string, string>>({})
  const [savingProvider, setSavingProvider] = useState<ProviderSection['id'] | null>(null)
  const [savedProvider, setSavedProvider] = useState<ProviderSection['id'] | null>(null)
  const [envSaveError, setEnvSaveError] = useState('')

  useEffect(() => {
    // no-store: the browser must never serve a cached copy of this response, or
    // a reload right after saving shows the pre-save values and reads as "it
    // didn't save".
    fetch('/api/m/shop/admin/settings', { cache: 'no-store' }).then(async (res) => {
      if (res.status === 403) { setForbidden(true); return }
      const data = await res.json()
      setConfig(data.config)
      setEnvStatus(data.envStatus)
    })
    loadTemplates()
    fetch('/api/admin/env').then(async (res) => {
      if (!res.ok) { setEnvAdminAllowed(false); return }
      setEnvAdminAllowed(true)
      setEnvKeyStatus((await res.json()).vars ?? {})
    })
  }, [])

  async function saveProviderKeys(provider: ProviderSection['id'], keys: string[]) {
    setEnvSaveError('')
    setSavingProvider(provider)
    setSavedProvider(null)
    const vars = keys.filter((k) => envFields[k]?.trim()).map((k) => ({ key: k, value: (envFields[k] ?? '').trim() }))
    if (vars.length === 0) { setSavingProvider(null); return }
    const res = await fetch('/api/admin/env', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ vars }) })
    const d = await res.json()
    if (!res.ok) {
      setEnvSaveError(d.error ?? 'Save failed')
      setSavingProvider(null)
      return
    }
    setEnvKeyStatus((prev) => {
      const next = { ...prev }
      keys.forEach((k) => { if (envFields[k]?.trim()) next[k] = true })
      return next
    })
    setEnvFields((prev) => {
      const next = { ...prev }
      keys.forEach((k) => { if (prev[k]?.trim()) next[k] = '' })
      return next
    })
    setSavingProvider(null)
    setSavedProvider(provider)
  }

  function loadTemplates() {
    fetch('/api/m/shop/admin/email-templates').then(async (res) => {
      if (res.ok) setTemplates((await res.json()).templates)
    })
  }

  function selectTemplate(trigger: ShpEmailTemplateTrigger) {
    const t = templates.find((x) => x.trigger === trigger)
    if (!t) return
    setActiveTrigger(trigger)
    setTemplateSubject(t.subject)
    setTemplateBody(t.bodyHtml)
    setTemplateActive(t.isActive)
    setTemplateMessage('')
    setTemplateError('')
  }

  async function save() {
    if (!config) return
    setSaving(true)
    setMessage('')
    setSaveError('')
    try {
      const res = await fetch('/api/m/shop/admin/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(config) })
      if (res.ok) {
        setConfig((await res.json()).config)
        setMessage('Settings saved.')
      } else {
        // Never fail silently - a swallowed non-2xx is exactly what makes a save
        // look like it did nothing.
        const data = await res.json().catch(() => null)
        setSaveError(data?.error ?? `Couldn't save (error ${res.status}). Please try again.`)
      }
    } catch {
      setSaveError("Couldn't reach the server. Check your connection and try again.")
    } finally {
      setSaving(false)
    }
  }

  async function saveTemplate() {
    if (!activeTrigger) return
    setTemplateSaving(true)
    setTemplateMessage('')
    setTemplateError('')
    try {
      const res = await fetch('/api/m/shop/admin/email-templates', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trigger: activeTrigger, subject: templateSubject, bodyHtml: templateBody, isActive: templateActive }),
      })
      if (res.ok) {
        loadTemplates()
        setTemplateMessage('Template saved.')
      } else {
        const data = await res.json().catch(() => null)
        setTemplateError(data?.error ?? `Couldn't save (error ${res.status}). Please try again.`)
      }
    } catch {
      setTemplateError("Couldn't reach the server. Check your connection and try again.")
    } finally {
      setTemplateSaving(false)
    }
  }

  if (forbidden) return <div>Only shop managers can view or change shop settings.</div>
  if (!config) return null

  function set<K extends keyof ShpConfig>(key: K, value: ShpConfig[K]) {
    setConfig((c) => (c ? { ...c, [key]: value } : c))
  }

  function setCheckoutStep(id: string, patch: Partial<ShpConfig['checkoutSteps'][number]>) {
    set('checkoutSteps', config!.checkoutSteps.map((step) => (step.id === id ? { ...step, ...patch } : step)))
  }

  const activeTemplate = templates.find((t) => t.trigger === activeTrigger)

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 'var(--space-4)' }}>
        {subTab !== 'templates' && (
          <button className="btn btn-primary" disabled={saving} onClick={save}>
            {saving ? 'Saving…' : 'Save settings'}
          </button>
        )}
      </div>

      <TabStrip items={SUB_TABS.map((t) => ({ key: t.key, label: t.label, active: t.key === subTab, onClick: () => setSubTab(t.key) }))} />

      {message && <div className="alert alert-success" style={{ marginBottom: '1rem' }}>{message}</div>}
      {saveError && <div className="alert alert-danger" style={{ marginBottom: '1rem' }}>{saveError}</div>}

      {subTab === 'general' && (
        <div>
          <div style={fieldGrid}>
            <div className="field" style={{ margin: 0 }}><label>Currency code</label><input value={config.currency} onChange={(e) => set('currency', e.target.value)} /></div>
            <div className="field" style={{ margin: 0 }}><label>Currency symbol</label><input value={config.currencySymbol} onChange={(e) => set('currencySymbol', e.target.value)} /></div>
          </div>
          <div style={fieldGrid}>
            <div className="field" style={{ margin: 0 }}><label>Store email</label><input type="email" value={config.storeEmail} onChange={(e) => set('storeEmail', e.target.value)} /></div>
            <div className="field" style={{ margin: 0 }}>
              <label>Order number prefix</label>
              <input value={config.orderNumberPrefix} onChange={(e) => set('orderNumberPrefix', e.target.value)} />
              <span className="field-hint">Order numbers look like {config.orderNumberPrefix || 'ORD-'}1001.</span>
            </div>
          </div>
          <div style={fieldGrid}>
            <div className="field" style={{ margin: 0 }}>
              <label>Weight unit</label>
              <select value={config.weightUnit} onChange={(e) => set('weightUnit', e.target.value as ShpConfig['weightUnit'])}>
                <option value="kg">Kilograms</option>
                <option value="lb">Pounds</option>
              </select>
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label>Dimension unit</label>
              <select value={config.dimensionUnit} onChange={(e) => set('dimensionUnit', e.target.value as ShpConfig['dimensionUnit'])}>
                <option value="cm">Centimetres</option>
                <option value="in">Inches</option>
              </select>
            </div>
          </div>

          <hr style={hr} />
          <h3 style={sectionHeading}>Shop status</h3>
          <div className="field">
            <label>Status</label>
            <select value={config.shopStatus} onChange={(e) => set('shopStatus', e.target.value as ShpConfig['shopStatus'])}>
              <option value="OPEN">Open</option>
              <option value="BROWSE_ONLY">Browse only (no checkout)</option>
              <option value="CLOSED">Closed</option>
            </select>
          </div>
          <div className="field">
            <label>Closed message</label>
            <input value={config.shopClosedMessage} onChange={(e) => set('shopClosedMessage', e.target.value)} />
            <span className="field-hint">Shown to visitors while the shop is browse-only or closed.</span>
          </div>

          <hr style={hr} />
          <h3 style={sectionHeading}>Category pages</h3>
          <div className="field">
            <label>Products shown on a category page</label>
            <select value={config.categoryProductDisplayMode} onChange={(e) => set('categoryProductDisplayMode', e.target.value as ShpConfig['categoryProductDisplayMode'])}>
              <option value="rollup">The category and all its sub-categories</option>
              <option value="exact">Only products filed directly on the category</option>
            </select>
            <span className="field-hint">The default for every category. Any individual category can override this on the Categories screen.</span>
          </div>

          <hr style={hr} />
          <h3 style={sectionHeading}>SEO</h3>
          <div className="field"><label>Shop title</label><input value={config.shopTitle} onChange={(e) => set('shopTitle', e.target.value)} /></div>
          <div className="field"><label>Meta description</label><textarea rows={3} value={config.shopMetaDescription} onChange={(e) => set('shopMetaDescription', e.target.value)} /></div>
        </div>
      )}

      {subTab === 'checkout' && (
        <div>
          <div className="field">
            <label>Tax mode</label>
            <select value={config.taxMode} onChange={(e) => set('taxMode', e.target.value as ShpConfig['taxMode'])}>
              <option value="INCLUSIVE">Inclusive (prices already include tax)</option>
              <option value="EXCLUSIVE">Exclusive (tax added at checkout)</option>
            </select>
          </div>

          <hr style={hr} />
          <h3 style={sectionHeading}>Checkout rules</h3>
          <label style={checkboxRow}>
            <input type="checkbox" checked={config.guestCheckoutEnabled} onChange={(e) => set('guestCheckoutEnabled', e.target.checked)} />
            Allow guest checkout
          </label>
          <label style={checkboxRow}>
            <input type="checkbox" checked={config.postPurchaseAccountPrompt} onChange={(e) => set('postPurchaseAccountPrompt', e.target.checked)} />
            Prompt guests to create an account after purchase
          </label>
          <label style={checkboxRow}>
            <input type="checkbox" checked={config.requirePhone} onChange={(e) => set('requirePhone', e.target.checked)} />
            Require a phone number at checkout
          </label>
          <div style={fieldGrid}>
            <div className="field" style={{ margin: 0 }}>
              <label>Minimum order value</label>
              <input type="number" step="0.01" min={0} value={config.minimumOrderValue ?? ''} onChange={(e) => set('minimumOrderValue', e.target.value ? Number(e.target.value) : null)} placeholder="No minimum" />
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label>Maximum order value</label>
              <input type="number" step="0.01" min={0} value={config.maximumOrderValue ?? ''} onChange={(e) => set('maximumOrderValue', e.target.value ? Number(e.target.value) : null)} placeholder="No maximum" />
            </div>
          </div>

          <hr style={hr} />
          <h3 style={sectionHeading}>Checkout steps</h3>
          <p className="field-hint" style={{ marginBottom: '0.75rem' }}>Choose which steps appear at checkout, and which ones can&apos;t be skipped.</p>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr auto auto', border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden', marginBottom: 'var(--form-gap)' }}>
            {(() => {
              const headerCellStyle: React.CSSProperties = { padding: '0.5rem 0.75rem', fontSize: '0.75rem', fontWeight: 500, color: 'var(--color-text-muted)', background: 'var(--color-bg-subtle)', borderBottom: '1px solid var(--color-border)' }
              return (
                <>
                  <div style={headerCellStyle}>Step</div>
                  <div style={{ ...headerCellStyle, textAlign: 'center' }}>Enabled</div>
                  <div style={{ ...headerCellStyle, textAlign: 'center' }}>Required</div>
                </>
              )
            })()}
            {config.checkoutSteps.map((step) => {
              const cellStyle: React.CSSProperties = { padding: '0.75rem', background: 'var(--color-surface)' }
              return (
                <Fragment key={step.id}>
                  <div className="field" style={{ margin: 0, ...cellStyle }}>
                    <input value={step.label} onChange={(e) => setCheckoutStep(step.id, { label: e.target.value })} style={{ width: '100%' }} />
                  </div>
                  <div style={{ ...cellStyle, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <input type="checkbox" checked={step.enabled} onChange={(e) => setCheckoutStep(step.id, { enabled: e.target.checked })} style={{ width: '1.25rem', height: '1.25rem' }} />
                  </div>
                  <div style={{ ...cellStyle, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <input type="checkbox" checked={step.required} onChange={(e) => setCheckoutStep(step.id, { required: e.target.checked })} style={{ width: '1.25rem', height: '1.25rem' }} />
                  </div>
                </Fragment>
              )
            })}
          </div>

          <hr style={hr} />
          <h3 style={sectionHeading}>Back-in-stock</h3>
          <label style={checkboxRow}>
            <input type="checkbox" checked={config.backInStockAccountPrompt} onChange={(e) => set('backInStockAccountPrompt', e.target.checked)} />
            Prompt for an account when signing up for a back-in-stock alert
          </label>

          <hr style={hr} />
          <h3 style={sectionHeading}>Pre-orders</h3>
          <div className="field">
            <label>Mixed cart behaviour</label>
            <select value={config.preOrderMixedCartBehaviour} onChange={(e) => set('preOrderMixedCartBehaviour', e.target.value as ShpConfig['preOrderMixedCartBehaviour'])}>
              <option value="HOLD_ALL">Hold the entire order until every item is in stock</option>
              <option value="PROMPT_SPLIT">Offer to split shipping between in-stock and pre-order items</option>
            </select>
          </div>
        </div>
      )}

      {subTab === 'payments' && (
        <div>
          {PAYMENT_METHODS.map((method) => {
            const configured = method === 'STRIPE' ? envStatus?.stripe : method === 'PAYPAL' ? envStatus?.paypal : true
            return (
              <label key={method} style={checkboxRow}>
                <input
                  type="checkbox"
                  checked={config.enabledPaymentMethods.includes(method)}
                  onChange={(e) => set('enabledPaymentMethods', e.target.checked
                    ? [...config.enabledPaymentMethods, method]
                    : config.enabledPaymentMethods.filter((m) => m !== method))}
                />
                {PAYMENT_METHOD_LABELS[method]}
                {!configured && <span className="badge badge-default">Env vars not set</span>}
              </label>
            )
          })}

          <hr style={hr} />
          <h3 style={sectionHeading}>Payment provider credentials</h3>
          {envAdminAllowed === false && (
            <p className="field-hint" style={{ marginBottom: '1rem' }}>Only a full admin can manage payment provider keys. Ask an admin to add these under Settings.</p>
          )}
          {envAdminAllowed && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem', alignItems: 'start' }}>
              {envSaveError && <div className="alert alert-danger" style={{ gridColumn: '1 / -1' }}>{envSaveError}</div>}
              {PROVIDER_SECTIONS.map((section) => {
                const keys = section.keys.map((f) => f.key)
                const hasEntries = keys.some((k) => envFields[k]?.trim())
                const isSaving = savingProvider === section.id
                const isSaved = savedProvider === section.id
                return (
                  <div className="card" key={section.id}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                      <div>
                        <h3 style={{ margin: '0 0 0.25rem', fontSize: '1rem' }}>{section.title}</h3>
                        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', margin: 0 }}>{section.description}</p>
                      </div>
                      <span className={keys.some((k) => envKeyStatus[k]) ? 'badge badge-success' : 'badge badge-default'}>
                        {keys.some((k) => envKeyStatus[k]) ? '● Set' : '○ Not set'}
                      </span>
                    </div>
                    {section.keys.map((f) => (
                      <div className="field" key={f.key}>
                        <label style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>{f.label}</span>
                          {envKeyStatus[f.key] && <span className="badge badge-success">● Set</span>}
                        </label>
                        {f.type === 'select' ? (
                          <select value={envFields[f.key] ?? ''} onChange={(e) => setEnvFields((prev) => ({ ...prev, [f.key]: e.target.value }))}>
                            <option value="">{envKeyStatus[f.key] ? 'Leave unchanged' : (f.options?.[0] ?? '')}</option>
                            {f.options?.map((o) => <option key={o} value={o}>{o}</option>)}
                          </select>
                        ) : (
                          <input
                            type={f.type}
                            autoComplete="off"
                            value={envFields[f.key] ?? ''}
                            onChange={(e) => setEnvFields((prev) => ({ ...prev, [f.key]: e.target.value }))}
                            placeholder={envKeyStatus[f.key] ? 'Enter new value to change' : ''}
                          />
                        )}
                      </div>
                    ))}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      <button className="btn btn-primary" style={{ fontSize: '0.875rem' }} disabled={isSaving || !hasEntries} onClick={() => saveProviderKeys(section.id, keys)}>
                        {isSaving ? 'Saving…' : isSaved ? '✓ Saved' : 'Save credentials'}
                      </button>
                      <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>{isSaved ? 'Redeploy to apply' : 'Takes effect on next deployment'}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {hostedSettingsSlots?.['shop.payments'] && (
            <>
              <hr style={hr} />
              {hostedSettingsSlots['shop.payments']}
            </>
          )}

          <hr style={hr} />
          <div className="field"><label>Bank transfer instructions</label><textarea rows={3} value={config.bankTransferInstructions} onChange={(e) => set('bankTransferInstructions', e.target.value)} /></div>
          <div className="field"><label>Cash instructions</label><textarea rows={3} value={config.cashInstructions} onChange={(e) => set('cashInstructions', e.target.value)} /></div>
        </div>
      )}

      {subTab === 'notifications' && (
        <div>
          <div className="field">
            <label>Admin order alert email</label>
            <input type="email" value={config.adminOrderAlertEmail} onChange={(e) => set('adminOrderAlertEmail', e.target.value)} />
            <span className="field-hint">Sent every time a new order comes in.</span>
          </div>
          <label style={checkboxRow}>
            <input type="checkbox" checked={config.lowStockAlertEnabled} onChange={(e) => set('lowStockAlertEnabled', e.target.checked)} />
            Send low stock alerts
          </label>
          <div className="field">
            <label>Low stock alert email</label>
            <input type="email" value={config.lowStockAlertEmail} onChange={(e) => set('lowStockAlertEmail', e.target.value)} />
          </div>
        </div>
      )}

      {subTab === 'templates' && (
        <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 'var(--space-5)' }}>
          <div>
            {templates.map((t) => (
              <button
                key={t.trigger}
                onClick={() => selectTemplate(t.trigger)}
                className={`btn ${activeTrigger === t.trigger ? 'btn-secondary' : 'btn-ghost'}`}
                style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: 'var(--space-1)' }}
              >
                {TEMPLATE_LABELS[t.trigger] ?? t.trigger}
                {!t.isActive && <span className="badge badge-default" style={{ marginLeft: 'var(--space-2)' }}>Off</span>}
              </button>
            ))}
          </div>

          <div>
            {!activeTemplate && <p style={{ color: 'var(--color-text-muted)' }}>Select a template to edit.</p>}
            {activeTemplate && (
              <div className="card">
                {templateMessage && <div className="alert alert-success">{templateMessage}</div>}
                {templateError && <div className="alert alert-danger">{templateError}</div>}

                <label style={checkboxRow}>
                  <input type="checkbox" checked={templateActive} onChange={(e) => setTemplateActive(e.target.checked)} />
                  Send this email
                </label>

                <div className="field">
                  <label>Subject</label>
                  <input value={templateSubject} onChange={(e) => setTemplateSubject(e.target.value)} />
                </div>

                <div className="field">
                  <label>Body (HTML)</label>
                  <textarea value={templateBody} onChange={(e) => setTemplateBody(e.target.value)} rows={10} style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 'var(--text-sm)' }} />
                </div>

                <button className="btn btn-primary" disabled={templateSaving} onClick={saveTemplate}>
                  {templateSaving ? 'Saving…' : 'Save template'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
