'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Puck } from '@puckeditor/core'
import type { Data } from '@puckeditor/core'
import '@puckeditor/core/no-external.css'
import { getModuleLayoutPuckConfig } from '@/lib/puck/config'
import { withImagePickerFields } from '@/lib/puck/MediaPickerField'
import { registerEditorFields } from '@/lib/puck/fields/editor'
import { emptyDescriptionPuck } from '@/modules/shop/components/admin/description-builder/shared'
import type { PuckData } from '@/modules/shop/lib/types'

// The shared full-screen description builder. Products design a product
// description with it (shp_products.description_puck) and categories design a
// category description (shp_categories.description_puck); the only differences
// are the wording in the bar, which record it PUTs to, and which field of that
// record it writes. Everything else - the config, the token injection, the dirty
// tracking, the leave guard - is identical, so it lives here once.
//
// The layout types it renders through are deliberately ones nothing registers
// blocks against, so the config is core's shared content parts only (headings,
// text, images, columns, callouts) with a bare root - no site header/footer/menu
// chrome. The same shared parts drive the storefront render, so editor and
// frontend markup match automatically.

// Hands the real sidebar field widgets (media picker, etc.) to the registry the
// shared config renders through. Module scope so it runs before Puck's first
// field render, matching the core layout editor.
registerEditorFields()

// Puck's header carries a "Publish" button and viewport controls that make no
// sense for a description, so it is suppressed entirely and this editor supplies
// its own bar (Back, Save, status). Returning an empty fragment is the override
// contract's way of rendering nothing.
const HIDE_PUCK_HEADER = { header: () => <></> }

/**
 * The Puck config a description surface renders through: core's shared content
 * parts with the media library wired into every image field, the same wrap the
 * core layout editor applies. Allocates a fresh object per call (Puck
 * reinitialises its left panel when the config identity changes), so callers
 * should useMemo it.
 */
export function buildDescriptionConfig(layoutType: string) {
  return withImagePickerFields(getModuleLayoutPuckConfig(layoutType))
}

export function StandaloneDescriptionBuilder({
  layoutType,
  eyebrow,
  title,
  backHref,
  backLabel,
  initialData,
  endpoint,
  field,
  onSaved,
  unsavedMessage,
}: {
  /** Which Puck layout type the canvas renders through. */
  layoutType: string
  /** Small caps line above the record's name, e.g. "Editing description". */
  eyebrow: string
  /** The record's name. */
  title: string
  backHref: string
  backLabel: string
  initialData: PuckData | null
  /** The admin API path this PUTs the document to. */
  endpoint: string
  /** Which field of the PUT body carries the document. */
  field: string
  /** Told about each successful save, e.g. so an open editor can adopt it. */
  onSaved?: (data: PuckData) => void
  unsavedMessage: string
}) {
  const config = useMemo(() => buildDescriptionConfig(layoutType), [layoutType])
  const overrides = useMemo(() => HIDE_PUCK_HEADER, [])
  const data = useMemo(() => (initialData ?? emptyDescriptionPuck) as Data, [initialData])

  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Puck fires onChange once on mount with its normalised copy of the initial
  // data; swallow that first call so the page does not open already "unsaved".
  const hasChangedRef = useRef(false)
  const latestRef = useRef<Data>(data)
  const handleChange = useCallback((next: Data) => {
    latestRef.current = next
    if (!hasChangedRef.current) { hasChangedRef.current = true; return }
    setDirty(true)
    setSavedAt(null)
    setError(null)
  }, [])

  const save = useCallback(async () => {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(endpoint, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: latestRef.current }),
      })
      if (!res.ok) {
        setError((await res.json().catch(() => ({}))).error ?? 'Could not save the description.')
        return
      }
      onSaved?.(latestRef.current as PuckData)
      setDirty(false)
      setSavedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
    } catch {
      setError('Could not reach the server. Check your connection and try again.')
    } finally {
      setSaving(false)
    }
  }, [endpoint, field, onSaved])

  // The browser's own "leave this page?" guard, for a tab close or a hard reload
  // while an edit is unsaved. The Back link handles in-app navigation separately.
  useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  const onBackClick = useCallback((e: React.MouseEvent<HTMLAnchorElement>) => {
    if (dirty && !window.confirm(unsavedMessage)) {
      e.preventDefault()
    }
  }, [dirty, unsavedMessage])

  // The site's design tokens, injected as a <style> tag so the canvas renders
  // headings/text/colours the way the storefront will. Same appearance fetch the
  // core layout editor uses.
  useEffect(() => {
    let mounted = true
    let styleEl: HTMLStyleElement | null = null
    let linkEl: HTMLLinkElement | null = null
    fetch('/api/admin/appearance')
      .then((r) => r.json())
      .then(async (d) => {
        if (!mounted || !d.designTokens) return
        const { buildTokenStyles, buildFontHref } = await import('@/lib/design/tokens')
        const css = buildTokenStyles(d.designTokens)
        const href = buildFontHref(d.designTokens)
        if (!mounted) return
        styleEl = document.createElement('style')
        styleEl.id = 'shop-desc-standalone-tokens'
        styleEl.textContent = css
        document.head.appendChild(styleEl)
        if (href && !document.getElementById('shop-desc-standalone-fonts')) {
          linkEl = document.createElement('link')
          linkEl.rel = 'stylesheet'
          linkEl.href = href
          linkEl.id = 'shop-desc-standalone-fonts'
          document.head.appendChild(linkEl)
        }
      })
      .catch(() => {})
    return () => {
      mounted = false
      styleEl?.remove()
      linkEl?.remove()
    }
  }, [])

  // Puck measures this wrapper on mount to size its zoomed canvas; mounting while
  // it is still 0x0 produces a transient NaN height console error. Wait for a
  // real measured size first, same as the core layout editor.
  const [ready, setReady] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      const { width, height } = entry.contentRect
      if (width > 0 && height > 0) { setReady(true); observer.disconnect() }
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const status = saving ? 'Saving…' : error ? error : dirty ? 'Unsaved changes' : savedAt ? `Saved at ${savedAt}` : 'All changes saved'

  return (
    <div className="spe-desc-standalone">
      <header className="spe-desc-standalone-bar">
        <a href={backHref} className="btn btn-secondary btn-sm" onClick={onBackClick}>← {backLabel}</a>
        <div className="spe-desc-standalone-title">
          <span className="spe-desc-standalone-eyebrow">{eyebrow}</span>
          <strong>{title}</strong>
        </div>
        <span className={`spe-desc-standalone-status${error ? ' spe-desc-standalone-status--error' : ''}`} role="status">
          {status}
        </span>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => void save()} disabled={saving || !dirty}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </header>
      <div ref={wrapRef} className="spe-desc-standalone-canvas">
        {ready && (
          <Puck
            config={config as never}
            data={data}
            onChange={handleChange}
            overrides={overrides}
          />
        )}
      </div>
    </div>
  )
}
