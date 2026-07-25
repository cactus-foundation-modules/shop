'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Puck } from '@puckeditor/core'
import type { Data } from '@puckeditor/core'
import '@puckeditor/core/no-external.css'
import { registerEditorFields } from '@/lib/puck/fields/editor'
import { buildDescriptionConfig, emptyDescriptionPuck } from '@/modules/shop/components/admin/product-editor/description-puck'
import type { PuckData } from '@/modules/shop/lib/types'

// The empty document and Puck config are shared with the full-screen pop-out
// editor (see description-puck.ts) so the two surfaces can never drift.
export { emptyDescriptionPuck }

// Hands the real sidebar field widgets (media picker, etc.) to the registry the
// shared config renders through. Module scope so it runs before Puck's first
// field render, matching the core layout editor.
registerEditorFields()

export function DescriptionBuilder({ value, onChange }: {
  value: PuckData | null
  onChange: (data: PuckData) => void
}) {
  // Content-only config: an unregistered layout type yields core's shared parts
  // and a bare root, with the media library wired into every image field. Shared
  // with the full-screen pop-out so both surfaces stamp identical markup.
  const config = useMemo(() => buildDescriptionConfig(), [])

  // Puck fires onChange once on mount with its normalised copy of the initial
  // data. Swallow that first call so merely opening a saved design does not mark
  // the product dirty; every later change is a real edit. Mirrors the core
  // layout editor's hasChangedRef.
  const hasChangedRef = useRef(false)
  const handleChange = useCallback((data: Data) => {
    if (!hasChangedRef.current) { hasChangedRef.current = true; return }
    onChange(data as PuckData)
  }, [onChange])

  // The site's design tokens, injected as a <style> tag so the canvas renders
  // headings/text/colours the way the storefront will. Same appearance fetch the
  // core layout editor uses; applied after mount, so the editor is usable at once
  // and simply restyles when the tokens land.
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
        styleEl.id = 'shop-desc-builder-tokens'
        styleEl.textContent = css
        document.head.appendChild(styleEl)
        if (href && !document.getElementById('shop-desc-builder-fonts')) {
          linkEl = document.createElement('link')
          linkEl.rel = 'stylesheet'
          linkEl.href = href
          linkEl.id = 'shop-desc-builder-fonts'
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

  const [ready, setReady] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  // Puck measures this wrapper on mount to size its zoomed canvas; mounting while
  // it is still 0x0 (panel just switched in) produces a transient NaN height
  // console error. Wait for a real measured size first, same as the core editor.
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

  return (
    <div ref={wrapRef} className="spe-desc-builder">
      {ready && (
        <Puck
          config={config as never}
          data={(value ?? emptyDescriptionPuck) as Data}
          onChange={handleChange}
        />
      )}
    </div>
  )
}
