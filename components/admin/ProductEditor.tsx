'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { TabStrip } from '@/components/admin/TabStrip'
import { UnsavedChangesModal } from '@/components/admin/UnsavedChangesModal'
import { useUnsavedChanges } from '@/components/admin/useUnsavedChanges'
import { useAdminPath } from '@/components/admin/AdminPathContext'
import { useConfirm, useAlert } from '@/modules/shop/components/admin/dialogs'
import {
  ProductEditorRegistryProvider,
  ProductEditorSaveTickProvider,
  ProductEditorTabScope,
  type ProductEditorRegistration,
} from '@/modules/shop/components/admin/product-editor/context'
import { productEditorCss } from '@/modules/shop/components/admin/product-editor/editor-css'
import { DESCRIPTION_SYNC_CHANNEL, type DescriptionSyncMessage } from '@/modules/shop/components/admin/product-editor/description-puck'
import {
  SHOP_TAB_ORDER, isDirty, isTabDirty, tabForField, toEditorState, toProductBody, validate,
  type CategoryTerm, type EditorState, type Errors, type PanelProps, type ProductForm, type ShopTabId, type Term,
} from '@/modules/shop/components/admin/product-editor/model'
import { DetailsPanel } from '@/modules/shop/components/admin/product-editor/panels/details'
import { DigitalPanel } from '@/modules/shop/components/admin/product-editor/panels/digital'
import { MediaPanel } from '@/modules/shop/components/admin/product-editor/panels/media'
import { OrganisationPanel } from '@/modules/shop/components/admin/product-editor/panels/organisation'
import { PricingPanel } from '@/modules/shop/components/admin/product-editor/panels/pricing'
import type { ShpPriceType } from '@/modules/shop/lib/pricing'
import { RecommendationsPanel } from '@/modules/shop/components/admin/product-editor/panels/recommendations'
import { SeoPanel } from '@/modules/shop/components/admin/product-editor/panels/seo'
import { productHref, type ProductUrlStyle } from '@/modules/shop/lib/product-url'
import { StockPanel } from '@/modules/shop/components/admin/product-editor/panels/stock'
import { fetchShopPublicConfig } from '@/modules/shop/lib/public-config-client'

/** A tab contributed by another module through `shop.product-editor-sections`. */
export type ExtraTab = { id: string; label: string; order: number; node: ReactNode }

type Tab = { id: string; label: string; order: number; render: () => ReactNode }

const STATUS_LABEL: Record<string, string> = { DRAFT: 'Draft', ACTIVE: 'Active', ARCHIVED: 'Archived' }

export function ProductEditor({ productId, extraTabs = [], mediaSections = [], initialTab }: {
  productId: string
  extraTabs?: ExtraTab[]
  /** Panels contributed to the foot of the Images tab through `shop.product-editor-media-sections`. */
  mediaSections?: ReactNode[]
  initialTab?: string
}) {
  const adminPath = useAdminPath()
  const [confirm, confirmNode] = useConfirm()
  const [alert, alertNode] = useAlert()
  const [state, setState] = useState<EditorState | null>(null)
  const [baseline, setBaseline] = useState<EditorState | null>(null)
  const [categories, setCategories] = useState<CategoryTerm[]>([])
  const [tags, setTags] = useState<Term[]>([])
  const [collections, setCollections] = useState<Term[]>([])
  const [taxClasses, setTaxClasses] = useState<Term[]>([])
  const [currency, setCurrency] = useState('£')
  // Which optional price boxes the Pricing tab offers. Defaults to the same set
  // the shop config does, so the tab looks right on the first paint rather than
  // flickering boxes in once the config call lands.
  const [enabledPriceTypes, setEnabledPriceTypes] = useState<ShpPriceType[]>(['sale', 'cost'])
  // Whether the Stock tab offers a weight box at all. Same first-paint reasoning
  // as the price types: start on the shop config's own default.
  const [weightBasedShippingEnabled, setWeightBasedShippingEnabled] = useState(true)
  // Where product pages live, for the Search tab's address preview. Starts on
  // the shop config's own default for the same first-paint reason as above.
  const [productUrlStyle, setProductUrlStyle] = useState<ProductUrlStyle>('SHOP')
  // Whether the Details tab offers a supplier box, and what it is called. Starts
  // off, matching the shop config's own default, so a shop that never asked for
  // one never sees it flicker in.
  const [supplierField, setSupplierField] = useState<{ enabled: boolean; label: string }>({ enabled: false, label: 'Supplier' })
  // Names from the supplier directory (Shop > Suppliers), which is what the
  // Details tab's dropdown offers. Disabled suppliers are left out by the
  // endpoint, so a name retired from the list stops being offered without
  // disturbing the products already filed under it.
  const [supplierOptions, setSupplierOptions] = useState<string[]>([])
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
  // Set by a contributed tab (the Variations tab) when the product is priced
  // per variation, so the Pricing tab locks its own Price boxes rather than
  // letting an owner set a figure the storefront never shows.
  const [priceManaged, setPriceManaged] = useState(false)

  // Goes up by one on every finished save, and panels that load their own data
  // watch it. A tab is hidden rather than unmounted when the admin leaves it, so
  // without this the Images tab would keep drawing what it fetched on mount -
  // ticking "Image up front" on the Variations tab and coming back showed
  // nothing until the page was reloaded.
  const [saveTick, setSaveTick] = useState(0)

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
  const registry = useMemo(() => ({ register, unregister, setBadge, currency, priceManaged, setPriceManaged }), [register, unregister, setBadge, currency, priceManaged])

  // --- Load ----------------------------------------------------------------
  const fetchState = useCallback(async (): Promise<EditorState | null> => {
    const res = await fetch(`/api/m/shop/admin/products/${productId}`)
    if (!res.ok) return null
    return toEditorState(await res.json())
  }, [productId])

  const loadSuppliers = useCallback(async () => {
    try {
      const res = await fetch('/api/m/shop/admin/suppliers?for=picker')
      if (!res.ok) return
      const data = await res.json()
      if (Array.isArray(data.suppliers)) setSupplierOptions(data.suppliers.map((s: { name: string }) => s.name))
    } catch {
      // A missing picker list is not worth an error: the field falls back to
      // whatever is already on the product.
    }
  }, [])

  /**
   * Add a supplier to the directory from inside the product editor, so recording
   * a new one never means leaving a half-edited product. Returns the error text
   * on failure and null on success, with the list refreshed.
   */
  const createSupplier = useCallback(async (name: string): Promise<string | null> => {
    try {
      const res = await fetch('/api/m/shop/admin/suppliers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      if (!res.ok) return (await res.json().catch(() => ({}))).error ?? 'Could not add that supplier.'
      await loadSuppliers()
      return null
    } catch {
      return 'Could not reach the server. Check your connection and try again.'
    }
  }, [loadSuppliers])

  const loadTags = useCallback(async () => {
    const r = await fetch('/api/m/shop/admin/tags').catch(() => null)
    if (r?.ok) setTags((await r.json()).tags)
  }, [])

  /**
   * Make a tag from inside the product editor, the same way a supplier is made
   * above: thinking of a label while filing a product should not mean leaving
   * the half-edited product to go and make it elsewhere. Returns the error text
   * on failure and null on success, with the tag list refreshed and the new tag
   * ticked by the caller.
   */
  const createTag = useCallback(async (name: string): Promise<{ id: string } | string> => {
    try {
      const res = await fetch('/api/m/shop/admin/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      if (!res.ok) return (await res.json().catch(() => ({}))).error ?? 'Could not add that tag. It may already exist.'
      const { id } = await res.json()
      await loadTags()
      return { id }
    } catch {
      return 'Could not reach the server. Check your connection and try again.'
    }
  }, [loadTags])

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
    void loadSuppliers()
    void fetchShopPublicConfig().then((config) => {
      if (!config) return
      setCurrency(config.currencySymbol ?? '£')
      if (Array.isArray(config.enabledPriceTypes)) setEnabledPriceTypes(config.enabledPriceTypes)
      setWeightBasedShippingEnabled(config.weightBasedShippingEnabled !== false)
      if (config.productUrlStyle === 'ROOT' || config.productUrlStyle === 'SHOP') setProductUrlStyle(config.productUrlStyle)
      if (config.supplierField) {
        setSupplierField({
          enabled: config.supplierField.enabled === true,
          label: typeof config.supplierField.label === 'string' && config.supplierField.label ? config.supplierField.label : 'Supplier',
        })
      }
    }).catch(() => {})
  }, [load, loadSuppliers])

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
  const baselineRef = useRef(baseline)
  useEffect(() => { baselineRef.current = baseline })

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
      setSaveTick((n) => n + 1)
      return true
    } catch {
      setSaveError('Could not reach the server. Check your connection and try again.')
      return false
    } finally {
      setSaving(false)
    }
  }, [productId, registrations, fetchState])

  // --- Full-screen description pop-out --------------------------------------
  // Open the designed description on its own chrome-free page, in a new tab. The
  // pop-out edits the same product's description and saves it independently, so
  // persist any inline description edit first - just that field, not the whole
  // product (which validation might block) - so the pop-out opens on the latest
  // copy rather than a stale server one.
  const openDescriptionEditor = useCallback(async () => {
    const current = stateRef.current
    if (!current) return
    const url = `/${adminPath}/m/shop/products/${productId}/description`
    const base = baselineRef.current
    const changed = JSON.stringify(current.descriptionPuck) !== JSON.stringify(base?.descriptionPuck)

    // No unsaved inline edit: open straight away, synchronously in the click so
    // the pop-up blocker lets it through, and the pop-out loads the saved copy.
    if (!changed) {
      window.open(url, '_blank', 'noopener')
      return
    }

    // Unsaved inline edits: open a blank tab first (still inside the click, so it
    // is allowed), persist just the description - not the whole product, which
    // validation might block - then point the tab at the builder so it loads the
    // copy we just saved rather than a stale one.
    const win = window.open('about:blank', '_blank')
    try {
      const res = await fetch(`/api/m/shop/admin/products/${productId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ descriptionPuck: current.descriptionPuck }),
      })
      if (!res.ok) {
        setSaveError((await res.json().catch(() => ({}))).error ?? 'Could not save the description before opening it in a new tab.')
        win?.close()
        return
      }
      setBaseline((b) => (b ? { ...b, descriptionPuck: current.descriptionPuck } : b))
      if (win) win.location.href = url
      else setSaveError('Allow pop-ups for this site to open the builder in a new tab, then try again.')
    } catch {
      setSaveError('Could not reach the server to save the description. Check your connection and try again.')
      win?.close()
    }
  }, [productId, adminPath])

  // Adopt a description the pop-out has just saved, so this editor shows it and,
  // crucially, its own Save button no longer holds a stale copy that would
  // overwrite it. Skipped while the inline description is itself dirty: the two
  // have diverged and last-save-wins, rather than silently binning local edits.
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return
    const channel = new BroadcastChannel(DESCRIPTION_SYNC_CHANNEL)
    channel.onmessage = (e: MessageEvent<DescriptionSyncMessage>) => {
      const msg = e.data
      if (!msg || msg.productId !== productId) return
      const current = stateRef.current
      const base = baselineRef.current
      if (!current || !base) return
      if (JSON.stringify(current.descriptionPuck) !== JSON.stringify(base.descriptionPuck)) return
      const incoming = msg.descriptionPuck ?? null
      if (JSON.stringify(incoming) === JSON.stringify(current.descriptionPuck)) return
      setState((s) => (s ? { ...s, descriptionPuck: incoming } : s))
      setBaseline((b) => (b ? { ...b, descriptionPuck: incoming } : b))
    }
    return () => channel.close()
  }, [productId])

  // --- Duplicate / delete --------------------------------------------------
  // Both navigate away with a hard load, so clear the dirty guard first to skip
  // the "unsaved changes" prompt - the product is being replaced or removed, so
  // any in-progress edits are moot.
  const duplicateCurrent = useCallback(async () => {
    const res = await fetch(`/api/m/shop/admin/products/${productId}/duplicate`, { method: 'POST' })
    if (!res.ok) { await alert('Could not duplicate this product.'); return }
    const { id } = await res.json()
    dirtyRef.current = false
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- see the note above - hard load on purpose, and adminPath is resolved server-side
    window.location.href = `/${adminPath}/m/shop/products/${id}`
  }, [productId, adminPath, alert, dirtyRef])

  const deleteCurrent = useCallback(async () => {
    const name = stateRef.current?.form.name?.trim() || 'This product'
    if (!(await confirm({
      title: 'Delete product?',
      message: `"${name}" will be permanently removed. Any orders that included it keep their history.`,
      confirmLabel: 'Delete',
    }))) return
    const res = await fetch(`/api/m/shop/admin/products/${productId}`, { method: 'DELETE' })
    if (!res.ok) { await alert(((await res.json().catch(() => ({}))) as { error?: string }).error ?? 'Could not delete this product.'); return }
    dirtyRef.current = false
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- see the note above - hard load on purpose, and adminPath is resolved server-side
    window.location.href = `/${adminPath}/m/shop/products`
  }, [productId, adminPath, confirm, alert, dirtyRef])

  // --- Tabs ----------------------------------------------------------------
  const setField = useCallback(<K extends keyof ProductForm>(key: K, value: ProductForm[K]) => {
    setState((s) => (s ? { ...s, form: { ...s.form, [key]: value } } : s))
  }, [])
  const patch = useCallback((fn: (s: EditorState) => EditorState) => {
    setState((s) => (s ? fn(s) : s))
  }, [])

  const tabs: Tab[] = useMemo(() => {
    if (!state) return []
    const panelProps: PanelProps = { state, setField, patch, errors: visibleErrors, currency, enabledPriceTypes, weightBasedShippingEnabled, supplierField, supplierOptions, createSupplier }
    const own: Tab[] = [
      { id: 'details', label: 'Details', order: SHOP_TAB_ORDER.details, render: () => <DetailsPanel {...panelProps} productId={productId} productUrlStyle={productUrlStyle} onOpenDescriptionEditor={openDescriptionEditor} /> },
      { id: 'media', label: 'Images', order: SHOP_TAB_ORDER.media, render: () => <MediaPanel {...panelProps} productId={productId} sections={mediaSections} /> },
      { id: 'pricing', label: 'Pricing', order: SHOP_TAB_ORDER.pricing, render: () => <PricingPanel {...panelProps} taxClasses={taxClasses} /> },
      { id: 'stock', label: 'Stock & delivery', order: SHOP_TAB_ORDER.stock, render: () => <StockPanel {...panelProps} /> },
      { id: 'organisation', label: 'Organisation', order: SHOP_TAB_ORDER.organisation, render: () => <OrganisationPanel {...panelProps} categories={categories} tags={tags} collections={collections} createTag={createTag} /> },
      { id: 'recommendations', label: 'Recommendations', order: SHOP_TAB_ORDER.recommendations, render: () => <RecommendationsPanel {...panelProps} productId={productId} /> },
      { id: 'seo', label: 'Search', order: SHOP_TAB_ORDER.seo, render: () => <SeoPanel {...panelProps} siteUrl={siteUrl} productUrlStyle={productUrlStyle} /> },
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
  }, [state, setField, patch, visibleErrors, currency, enabledPriceTypes, weightBasedShippingEnabled, supplierField, supplierOptions, createSupplier, taxClasses, categories, tags, collections, createTag, productId, siteUrl, productUrlStyle, extraTabs, mediaSections, openDescriptionEditor])

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
            <ProductEditorSaveTickProvider tick={saveTick}>
              {tabs.map((t) => (
                <div key={t.id} hidden={t.id !== active}>
                  <ProductEditorTabScope tabId={t.id} tabLabel={t.label}>
                    {t.render()}
                  </ProductEditorTabScope>
                </div>
              ))}
            </ProductEditorSaveTickProvider>
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

              {/* Preview sits under Save because that is the order you use them in:
                  save, then look. Only an active product has a shop page, so a
                  draft gets the button greyed rather than a link to a 404. */}
              {f.status === 'ACTIVE' && f.slug ? (
                <a
                  className="btn btn-secondary spe-save-btn"
                  href={productHref(f.slug, productUrlStyle)}
                  target="_blank"
                  rel="noreferrer"
                  title="Open this product on the shop in a new tab"
                >
                  Preview ↗
                </a>
              ) : (
                <span
                  className="btn btn-secondary spe-save-btn spe-preview-off"
                  aria-disabled="true"
                  title="Only active products have a shop page to preview."
                >
                  Preview ↗
                </span>
              )}
              {dirty && f.status === 'ACTIVE' && f.slug && (
                <p className="spe-save-note">Preview shows the last saved version.</p>
              )}

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

            <div className="spe-card">
              <h2 className="spe-card-title">Manage</h2>
              <button type="button" className="btn btn-secondary btn-sm" style={{ width: '100%', justifyContent: 'center' }} onClick={() => void duplicateCurrent()}>
                Duplicate product
              </button>
              <button type="button" className="btn btn-danger btn-sm" style={{ width: '100%', justifyContent: 'center', marginTop: '0.5rem' }} onClick={() => void deleteCurrent()}>
                Delete product
              </button>
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
      {confirmNode}
      {alertNode}
    </>
  )
}
