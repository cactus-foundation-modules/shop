'use client'

import { useEffect, useState } from 'react'
import { Puck } from '@puckeditor/core'
import type { Data } from '@puckeditor/core'
import '@puckeditor/core/no-external.css'
import { getShopPageEditorConfig, type ShopPageKey } from '@/modules/shop/lib/page-editor-config'

const PAGES: Array<{ key: ShopPageKey; label: string }> = [
  { key: 'index', label: 'Shop index' },
  { key: 'product', label: 'Product detail' },
  { key: 'checkout', label: 'Checkout' },
  { key: 'confirmation', label: 'Confirmation' },
]

const EMPTY_DATA: Data = { root: { props: {} }, content: [], zones: {} }

// Embedded drag-and-drop editor for the four storefront page templates,
// following modules/gazette/components/admin/PostEditor.tsx's <Puck> usage.
// Anchor blocks are locked via getShopPageEditorConfig's per-component
// permissions rather than a raw JSON textarea.
export function PageLayoutsScreen() {
  const [key, setKey] = useState<ShopPageKey>('index')
  const [data, setData] = useState<Data>(EMPTY_DATA)
  const [loadedKey, setLoadedKey] = useState<ShopPageKey | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const loaded = loadedKey === key

  useEffect(() => {
    fetch(`/api/m/shop/admin/page-layouts/${key}`).then(async (r) => {
      if (r.ok) setData((await r.json()).layout.builderData)
      setSaved(false)
      setLoadedKey(key)
    })
  }, [key])

  async function save(next: Data) {
    setSaving(true)
    setSaved(false)
    const res = await fetch(`/api/m/shop/admin/page-layouts/${key}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ builderData: next }),
    })
    setSaving(false)
    setSaved(res.ok)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 className="page-title">Storefront page layouts</h1>
        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{saving ? 'Saving…' : saved ? 'Saved' : ''}</div>
      </div>
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        {PAGES.map((p) => (
          <button key={p.key} onClick={() => setKey(p.key)} style={{ fontWeight: key === p.key ? 700 : 400, background: 'none', border: 'none', cursor: 'pointer' }}>{p.label}</button>
        ))}
      </div>
      {loaded && (
        <div style={{ flex: 1, minHeight: 500, border: '1px solid var(--color-border)', borderRadius: 6, overflow: 'hidden' }}>
          <Puck
            key={key}
            config={getShopPageEditorConfig(key) as any}
            data={data}
            onPublish={(next) => void save(next as Data)}
            iframe={{ enabled: false }}
          />
        </div>
      )}
    </div>
  )
}
