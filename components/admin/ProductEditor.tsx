'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { TabStrip } from '@/components/admin/TabStrip'
import { UnsavedChangesModal } from '@/components/admin/UnsavedChangesModal'
import { useUnsavedChanges } from '@/components/admin/useUnsavedChanges'
import {
  ProductEditorRegistryProvider,
  ProductEditorTabScope,
  type ProductEditorRegistration,
} from '@/modules/shop/components/admin/product-editor/context'
import { productEditorCss } from '@/modules/shop/components/admin/product-editor/editor-css'
import {
  SHOP_TAB_ORDER, isDirty, isTabDirty, tabForField, toEditorState, toProductBody, validate,
  type CategoryTerm, type EditorState, type Errors, type PanelProps, type ProductForm, type ShopTabId, type Term,
} from '@/modules/shop/components/admin/product-editor/model'
import { DetailsPanel } from '@/modules/shop/components/admin/product-editor/panels/details'
import { DigitalPanel } from '@/modules/shop/components/admin/product-editor/panels/digital'
import { MediaPanel } from '@/modules/shop/components/admin/product-editor/panels/media'
import { OrganisationPanel } from '@/modules/shop/components/admin/product-editor/panels/organisation'
import { PricingPanel } from '@/modules/shop/components/admin/product-editor/panels/pricing'
import { RecommendationsPanel } from '@/modules/shop/components/admin/product-editor/panels/recommendations'
import { SeoPanel } from '@/modules/shop/components/admin/product-editor/panels/seo'
import { StockPanel } from '@/modules/shop/components/admin/product-editor/panels/stock'

/** A tab contributed by another module through `shop.product-editor-sections`. */
export type ExtraTab = { id: string; label: string; order: number; node: ReactNode }

type Tab = { id: string; label: string; order: number; render: () => ReactNode }

const STATUS_LABEL: Record<string, string> = { DRAFT: 'Draft', ACTIVE: 'Active', ARCHIVED: 'Archived' }

export function ProductEditor({ productId, extraTabs = [], initialTab }: {
  productId: string
  extraTabs?: ExtraTab[]
  initialTab?: string
}) {
  const [state, setState] = useState<EditorState | null>(null)
  const [baseline, setBaseline] = useState<EditorState | null>(null)
  const [categories, setCategories] = useState<CategoryTerm[]>([])
  const [tags, setTags] = useState<Term[]>([])
  const [collections, setCollections] = useState<Term[]>([])
  const [taxClasses, setTaxClasses] = useState<Term[]>([])
  const [currency, setCurrency] = useState('£')
  // Only ever cosmetic (the search preview's URL), and nothing renders until the
  // product has loaded client-side, so there is no server render to mismatch.
  const [siteUrl] = useState(() => (typeof window === 'undefined' ? '' : window.location.origin))
  const [requestedTab, setRequestedTab] = useState<string>(initialTab ?? 'details')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [showErrors, setShowErrors] = useState(false)
  const [registrations, setRegistrations] = useState<Record<string, ProductEditorRegistration>>({})
  const [badges, setBadges] = useState<Record<string, string | null>>({})

  // --- Registry for contributed tabs ---------------------------------------
  const register = useCallback((key: string, registration: ProductEditorRegistration) => {
    setRegistrations((prev) => ({ ...prev, [key]: registration }))
  }, [])
  const unregister = useCallback((key: string) => {
    setRegistrations((prev) => {
      if (!(key in prev)) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })
  }, [])
  const setBadge = useCallback((tabId: string, badge: string | null) => {
    setBadges((prev) => (prev[tabId] === badge ? prev : { ...prev, [tabId]: badge }))
  }, [])
  const registry = useMemo(() => ({ register, unregister, setBadge, currency }), [register, unregister, setBadge, currency])

  // --- Load ----------------------------------------------------------------
  const fetchState = useCallback(async (): Promise<EditorState | null> => {
    const res = await fetch(`/api/m/shop/admin/products/${productId}`)
    if (!res.ok) return null
    return toEditorState(await res.json())
  }, [productId])

  const load = useCallback(async () => {
    const next = await fetchState()
    if (!next) return
    setState(next)
    setBaseline(next)
  }, [fetchState])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- every setState here runs in an async callback after an await, never synchronously in the effect body
    void load()
    void fetch('/api/m/shop/admin/categories').then(async (r) => { if (r.ok) setCategories((await r.json()).categories) }).catch(() => {})
    void fetch('/api/m/shop/admin/tags').then(async (r) => { if (r.ok) setTags((await r.json()).tags) }).catch(() => {})
    void fetch('/api/m/shop/admin/collections').then(async (r) => { if (r.ok) setCollections((await r.json()).collections) }).catch(() => {})
    void fetch('/api/m/shop/admin/tax-classes').then(async (r) => { if (r.ok) setTaxClasses((await r.json()).taxClasses) }).catch(() => {})
    void fetch('/api/m/shop/public/config').then(async (r) => { if (r.ok) setCurrency((await r.json()).currencySymbol ?? '£') }).catch(() => {})
  }, [load])

  // --- Dirty tracking ------------------------------------------------------
  const ownDirty = state && baseline ? isDirty(state, baseline) : false
  const extraDirty = Object.values(registrations).some((r) => r.dirty)
  const dirty = ownDirty || extraDirty

  const { dirtyRef, pendingHref, setPendingHref } = useUnsavedChanges()
  useEffect(() => { dirtyRef.current = dirty }, [dirty, dirtyRef])

  const errors: Errors = useMemo(() => (state ? validate(state) : {}), [state])
  const hasErrors = Object.keys(errors).length > 0
  // Errors exist from the first keystroke but are only shown once a save has been
  // attempted, so a half-typed product isn't scolded for being half-typed.
  const visibleErrors: Errors = useMemo(() => (showErrors ? errors : {}), [showErrors, errors])

  // --- Save ----------------------------------------------------------------
  const stateRef = useRef(state)
  useEffect(() => { stateRef.current = state })

  const save = useCallback(async (): Promise<boolean> => {
    const current = stateRef.current
    if (!current) return false

    const found = validate(current)
    if (Object.keys(found).length > 0) {
      setShowErrors(true)
      const first = Object.keys(found)[0] as keyof ProductForm
      setRequestedTab(tabForField(first))
      setSaveError('Some fields need fixing before this can save.')
      return false
    }

    setSaving(true)
    setSaveError(null)
    try {
      const res = await fetch(`/api/m/shop/admin/products/${productId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toProductBody(current)),
      })
      if (!res.ok) {
        setSaveError((await res.json().catch(() => ({}))).error ?? 'Could not save the product.')
        return false
      }

      const excludedIds = current.excluded.map((p) => p.id)
      const [related, upsells] = await Promise.all([
        fetch(`/api/m/shop/admin/products/${productId}/related`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: current.form.relatedMode, limit: Number(current.form.relatedLimit), relatedIds: current.related.map((p) => p.id), excludedIds }),
        }),
        fetch(`/api/m/shop/admin/products/${productId}/upsells`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: current.form.upsellMode, limit: Number(current.form.upsellLimit), upsellIds: current.upsells.map((p) => p.id), excludedIds }),
        }),
      ])
      if (!related.ok || !upsells.ok) {
        setSaveError('The product saved, but its recommendations did not.')
        return false
      }

      // Contributed tabs save themselves; one failing does not roll the rest back,
      // so say which one went wrong rather than pretending everything is fine.
      const pending = Object.values(registrations).filter((r) => r.dirty)
      const results = await Promise.allSettled(pending.map((r) => r.save()))
      const failed = results
        .map((result, i) => (result.status === 'rejected' ? { tab: pending[i]?.tabLabel ?? 'A tab', reason: result.reason } : null))
        .filter((x): x is { tab: string; reason: unknown } => x !== null)
      if (failed.length > 0) {
        const first = failed[0]
        const detail = first?.reason instanceof Error ? first.reason.message : 'It did not save.'
        setSaveError(`${first?.tab}: ${detail}`)
        return false
      }

      // Images may have been re-filed server-side (new folder + names); pull the
      // canonical state back so thumbnails don't point at the deleted originals.
      //
      // Nothing stops the admin typing while the save is in flight, and throwing
      // that away would be the worst kind of bug: silent. So the server's copy is
      // only taken wholesale if they have not touched anything since; otherwise
      // their edits stand and the new baseline simply marks them unsaved again.
      const fresh = await fetchState()
      if (fresh) {
        setState((prev) => {
          if (!prev || prev === current) return fresh
          return { ...prev, media: prev.media === current.media ? fresh.media : prev.media }
        })
        setBaseline(fresh)
      }
      setSavedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
      setShowErrors(false)
      return true
    } catch {
      setSaveError('Could not reach the server. Check your connection and try again.')
      return false
    } finally {
      setSaving(false)
    }
  }, [productId, registrations, fetchState])

  // --- Tabs ----------------------------------------------------------------
  const setField = useCallback(<K extends keyof ProductForm>(key: K, value: ProductForm[K]) => {
    setState((s) => (s ? { ...s, form: { ...s.form, [key]: value } } : s))
  }, [])
  const patch = useCallback((fn: (s: EditorState) => EditorState) => {
    setState((s) => (s ? fn(s) : s))
  }, [])

  const tabs: Tab[] = useMemo(() => {
    if (!state) return []
    const panelProps: PanelProps = { state, setField, patch, errors: visibleErrors, currency }
    const own: Tab[] = [
      { id: 'details', label: 'Details', order: SHOP_TAB_ORDER.details, render: () => <DetailsPanel {...panelProps} /> },
      { id: 'media', label: 'Images', order: SHOP_TAB_ORDER.media, render: () => <MediaPanel {...panelProps} productId={productId} /> },
      { id: 'pricing', label: 'Pricing', order: SHOP_TAB_ORDER.pricing, render: () => <PricingPanel {...panelProps} taxClasses={taxClasses} /> },
      { id: 'stock', label: 'Stock & delivery', order: SHOP_TAB_ORDER.stock, render: () => <StockPanel {...panelProps} /> },
      { id: 'organisation', label: 'Organisation', order: SHOP_TAB_ORDER.organisation, render: () => <OrganisationPanel {...panelProps} categories={categories} tags={tags} collections={collections} /> },
      { id: 'recommendations', label: 'Recommendations', order: SHOP_TAB_ORDER.recommendations, render: () => <RecommendationsPanel {...panelProps} productId={productId} /> },
      { id: 'seo', label: 'Search', order: SHOP_TAB_ORDER.seo, render: () => <SeoPanel {...panelProps} siteUrl={siteUrl} /> },
    ]
    if (state.form.type === 'DIGITAL') {
      own.push({ id: 'digital', label: 'Download', order: SHOP_TAB_ORDER.digital, render: () => <DigitalPanel {...panelProps} /> })
    }
    const contributed: Tab[] = extraTabs.map((t) => ({
      id: t.id,
      label: t.label,
      order: t.order,
      render: () => t.node,
    }))
    return [...own, ...contributed].sort((a, b) => a.order - b.order || a.label.localeCompare(b.label))
  }, [state, setField, patch, visibleErrors, currency, taxClasses, categories, tags, collections, productId, siteUrl, extraTabs])

  // Derived, not stored: a tab that vanishes (the product stopped being digital)
  // or a ?tab= naming a module that isn't installed falls back to the first tab
  // rather than stranding the view on nothing.
  const active = tabs.some((t) => t.id === requestedTab) ? requestedTab : tabs[0]?.id ?? requestedTab

  // Keep the tab in the URL so a deep link, a refresh and the back button all land
  // where the admin expects. replaceState, not push: tabs are not history.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const url = new URL(window.location.href)
    if (url.searchParams.get('tab') === active) return
    url.searchParams.set('tab', active)
    window.history.replaceState(null, '', url)
  }, [active])

  const dirtyTabIds = useMemo(() => {
    const ids = new Set<string>()
    if (state && baseline) {
      for (const id of Object.keys(SHOP_TAB_ORDER) as ShopTabId[]) {
        if (isTabDirty(id, state, baseline)) ids.add(id)
      }
    }
    for (const r of Object.values(registrations)) if (r.dirty) ids.add(r.tabId)
    return ids
  }, [state, baseline, registrations])

  const errorTabIds = useMemo(() => {
    if (!showErrors) return new Set<string>()
    return new Set((Object.keys(errors) as (keyof ProductForm)[]).map(tabForField))
  }, [showErrors, errors])

  if (!state) return null

  const f = state.form
  const cover = state.media[0]
  const dirtyTabLabels = tabs.filter((t) => dirtyTabIds.has(t.id)).map((t) => t.label)

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: productEditorCss }} />
      <ProductEditorRegistryProvider value={registry}>
        <div className="spe-layout">
          <div style={{ minWidth: 0 }}>
            <TabStrip
              items={tabs.map((t) => ({
                key: t.id,
                active: t.id === active,
                onClick: () => setRequestedTab(t.id),
                label: (
                  <span className="spe-tab-inner">
                    {t.label}
                    {badges[t.id] ? <span className="spe-tab-badge">{badges[t.id]}</span> : null}
                    {errorTabIds.has(t.id)
                      ? <span className="spe-tab-dot spe-tab-dot-error" title={`${t.label} has a problem`} />
                      : dirtyTabIds.has(t.id)
                        ? <span className="spe-tab-dot" title={`${t.label} has unsaved changes`} />
                        : null}
                  </span>
                ),
              }))}
            />

            {/* Every panel stays mounted so a half-finished edit on one tab survives
                a trip to another, and so contributed tabs can report their state. */}
            {tabs.map((t) => (
              <div key={t.id} hidden={t.id !== active}>
                <ProductEditorTabScope tabId={t.id} tabLabel={t.label}>
                  {t.render()}
                </ProductEditorTabScope>
              </div>
            ))}
          </div>

          <aside className="spe-side">
            <div className="spe-card">
              <h2 className="spe-card-title">Visibility</h2>
              <select
                className="spe-control"
                aria-label="Product status"
                value={f.status}
                onChange={(e) => setField('status', e.target.value as typeof f.status)}
              >
                <option value="DRAFT">Draft, not on the shop yet</option>
                <option value="ACTIVE">Active, on sale</option>
                <option value="ARCHIVED">Archived, hidden and unbuyable</option>
              </select>
              {f.status === 'ACTIVE' && f.slug && (
                <a
                  className="btn btn-secondary btn-sm"
                  style={{ width: '100%', justifyContent: 'center', marginTop: '0.5rem' }}
                  href={`/shop/products/${f.slug}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  View on the shop ↗
                </a>
              )}
            </div>

            <div className="spe-card">
              <h2 className="spe-card-title">At a glance</h2>
              {cover ? (
                // eslint-disable-next-line @next/next/no-img-element -- media library URLs are arbitrary remote hosts, not a configured next/image loader
                <img className="spe-cover" src={cover.url} alt={cover.altText ?? ''} />
              ) : (
                <div className="spe-cover-empty">No image yet</div>
              )}
              <dl className="spe-facts" style={{ marginTop: '0.75rem' }}>
                <div className="spe-fact"><dt>Status</dt><dd>{STATUS_LABEL[f.status] ?? f.status}</dd></div>
                <div className="spe-fact"><dt>Price</dt><dd>{f.price.trim() === '' ? '—' : `${currency}${Number(f.price).toFixed(2)}`}</dd></div>
                <div className="spe-fact">
                  <dt>Stock</dt>
                  <dd>{!f.trackInventory ? 'Not counted' : f.stockCount.trim() === '' ? '—' : `${f.stockCount} left`}</dd>
                </div>
                {f.sku.trim() !== '' && <div className="spe-fact"><dt>SKU</dt><dd>{f.sku}</dd></div>}
              </dl>
            </div>

            <div className="spe-card spe-save">
              <button className="btn btn-primary spe-save-btn" onClick={() => void save()} disabled={saving || !dirty}>
                {saving ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}
              </button>

              {saveError && <p className="spe-error" role="alert"><span aria-hidden>⚠</span>{saveError}</p>}

              {dirty && dirtyTabLabels.length > 0 && (
                <>
                  <p className="spe-save-note">Unsaved changes on</p>
                  <ul className="spe-dirty-list">
                    {dirtyTabLabels.map((label) => <li key={label} className="spe-dirty-chip">{label}</li>)}
                  </ul>
                </>
              )}
              {!dirty && !saveError && (
                <p className="spe-save-note">{savedAt ? `Saved at ${savedAt}.` : 'No changes to save.'}</p>
              )}
              {showErrors && hasErrors && (
                <p className="spe-save-note">Fix the fields marked in red, then save.</p>
              )}
            </div>
          </aside>
        </div>
      </ProductEditorRegistryProvider>

      <UnsavedChangesModal
        pendingHref={pendingHref}
        saving={saving}
        message="This product has changes you have not saved yet. Save them before you go?"
        onCancel={() => setPendingHref(null)}
        onDiscard={() => {
          dirtyRef.current = false
          const href = pendingHref
          setPendingHref(null)
          if (href) window.location.href = href
        }}
        onSave={() => {
          void save().then((ok) => {
            if (!ok) { setPendingHref(null); return }
            const href = pendingHref
            setPendingHref(null)
            if (href) window.location.href = href
          })
        }}
      />
    </>
  )
}
