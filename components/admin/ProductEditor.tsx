'use client'

import { useEffect, useState } from 'react'
import { MediaPickerModal } from '@/modules/shop/components/admin/MediaPickerModal'
import { ProductPicker } from '@/modules/shop/components/admin/ProductPicker'

type ProductData = {
  id: string; name: string; slug: string; type: string; status: string
  description: string | null; shortDescription: string | null; sku: string | null; barcode: string | null
  price: string; compareAtPrice: string | null; costPrice: string | null; taxClassId: string | null
  trackInventory: boolean; stockCount: number | null; lowStockThreshold: number | null; outOfStockBehaviour: string
  metaTitle: string | null; metaDescription: string | null
  isPreOrder: boolean; preOrderDispatchDate: string | null; preOrderNote: string | null; preOrderMaxQuantity: number | null; preOrderCount: number
  digitalFileId: string | null; downloadLimit: number | null; downloadExpiry: number | null
  relatedMode: 'MANUAL' | 'AUTOMATIC'; relatedLimit: number; upsellMode: 'MANUAL' | 'AUTOMATIC'; upsellLimit: number
}

type Term = { id: string; name: string; slug: string }
type PickedProduct = { id: string; name: string }

export function ProductEditor({ productId }: { productId: string }) {
  const [product, setProduct] = useState<ProductData | null>(null)
  const [media, setMedia] = useState<Array<{ type: 'IMAGE' | 'VIDEO_FILE' | 'VIDEO_URL'; url: string; altText?: string | null; isPrimary?: boolean }>>([])
  const [categoryIds, setCategoryIds] = useState<string[]>([])
  const [tagIds, setTagIds] = useState<string[]>([])
  const [collectionIds, setCollectionIds] = useState<string[]>([])
  const [categories, setCategories] = useState<Term[]>([])
  const [tags, setTags] = useState<Term[]>([])
  const [collections, setCollections] = useState<Term[]>([])
  const [taxClasses, setTaxClasses] = useState<Term[]>([])
  const [saving, setSaving] = useState(false)
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false)
  const [digitalFileName, setDigitalFileName] = useState<string | null>(null)
  const [uploadingDigitalFile, setUploadingDigitalFile] = useState(false)
  const [relatedProducts, setRelatedProducts] = useState<PickedProduct[]>([])
  const [upsellProducts, setUpsellProducts] = useState<PickedProduct[]>([])
  const [excludedProducts, setExcludedProducts] = useState<PickedProduct[]>([])

  useEffect(() => {
    fetch(`/api/m/shop/admin/products/${productId}`).then(async (r) => {
      if (!r.ok) return
      const data = await r.json()
      setProduct(data.product)
      setMedia(data.media.map((m: { type: string; url: string; altText: string | null; isPrimary: boolean }) => ({ type: m.type, url: m.url, altText: m.altText, isPrimary: m.isPrimary })))
      setCategoryIds(data.categoryIds)
      setTagIds(data.tagIds)
      setCollectionIds(data.collectionIds)
      setRelatedProducts(data.relatedProducts)
      setUpsellProducts(data.upsellProducts)
      setExcludedProducts(data.excludedProducts)
    })
    fetch('/api/m/shop/admin/categories').then(async (r) => { if (r.ok) setCategories((await r.json()).categories) })
    fetch('/api/m/shop/admin/tags').then(async (r) => { if (r.ok) setTags((await r.json()).tags) })
    fetch('/api/m/shop/admin/collections').then(async (r) => { if (r.ok) setCollections((await r.json()).collections) })
    fetch('/api/m/shop/admin/tax-classes').then(async (r) => { if (r.ok) setTaxClasses((await r.json()).taxClasses) })
  }, [productId])

  if (!product) return null

  function set<K extends keyof ProductData>(key: K, value: ProductData[K]) {
    setProduct((p) => (p ? { ...p, [key]: value } : p))
  }

  async function uploadDigitalFile(file: File) {
    setUploadingDigitalFile(true)
    const body = new FormData()
    body.append('file', file)
    const res = await fetch('/api/m/shop/admin/digital-files', { method: 'POST', body })
    setUploadingDigitalFile(false)
    if (!res.ok) { alert((await res.json()).error ?? 'Upload failed'); return }
    const record = await res.json()
    set('digitalFileId', record.id)
    setDigitalFileName(file.name)
  }

  async function save() {
    if (!product) return
    setSaving(true)
    await fetch(`/api/m/shop/admin/products/${productId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: product.name, status: product.status, description: product.description, shortDescription: product.shortDescription,
        sku: product.sku, barcode: product.barcode, price: Number(product.price), compareAtPrice: product.compareAtPrice ? Number(product.compareAtPrice) : null,
        costPrice: product.costPrice ? Number(product.costPrice) : null, taxClassId: product.taxClassId,
        trackInventory: product.trackInventory, stockCount: product.stockCount, lowStockThreshold: product.lowStockThreshold,
        outOfStockBehaviour: product.outOfStockBehaviour, metaTitle: product.metaTitle, metaDescription: product.metaDescription,
        isPreOrder: product.isPreOrder, preOrderDispatchDate: product.preOrderDispatchDate, preOrderNote: product.preOrderNote,
        preOrderMaxQuantity: product.preOrderMaxQuantity, digitalFileId: product.digitalFileId, downloadLimit: product.downloadLimit,
        downloadExpiry: product.downloadExpiry, media, categoryIds, tagIds, collectionIds,
      }),
    })
    const excludedIds = excludedProducts.map((p) => p.id)
    await Promise.all([
      fetch(`/api/m/shop/admin/products/${productId}/related`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: product.relatedMode, limit: product.relatedLimit, relatedIds: relatedProducts.map((p) => p.id), excludedIds }),
      }),
      fetch(`/api/m/shop/admin/products/${productId}/upsells`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: product.upsellMode, limit: product.upsellLimit, upsellIds: upsellProducts.map((p) => p.id), excludedIds }),
      }),
    ])
    setSaving(false)
  }

  function toggle(list: string[], id: string): string[] {
    return list.includes(id) ? list.filter((x) => x !== id) : [...list, id]
  }

  return (
    <div style={{ display: 'grid', gap: '1.5rem', maxWidth: 700 }}>
      <section style={{ display: 'grid', gap: '0.5rem' }}>
        <label>Name<input value={product.name} onChange={(e) => set('name', e.target.value)} style={inputStyle} /></label>
        <label>
          Status
          <select value={product.status} onChange={(e) => set('status', e.target.value)} style={inputStyle}>
            <option value="DRAFT">Draft</option><option value="ACTIVE">Active</option><option value="ARCHIVED">Archived</option>
          </select>
        </label>
        <label>SKU<input value={product.sku ?? ''} onChange={(e) => set('sku', e.target.value || null)} style={inputStyle} /></label>
        <label>Short description<textarea value={product.shortDescription ?? ''} onChange={(e) => set('shortDescription', e.target.value)} style={{ ...inputStyle, minHeight: 60 }} /></label>
        <label>Description<textarea value={product.description ?? ''} onChange={(e) => set('description', e.target.value)} style={{ ...inputStyle, minHeight: 120 }} /></label>
      </section>

      <section style={{ display: 'grid', gap: '0.5rem' }}>
        <h3 style={{ margin: 0, fontSize: '0.9375rem' }}>Pricing</h3>
        <label>Price<input type="number" step="0.01" value={product.price} onChange={(e) => set('price', e.target.value)} style={inputStyle} /></label>
        <label>Compare-at price<input type="number" step="0.01" value={product.compareAtPrice ?? ''} onChange={(e) => set('compareAtPrice', e.target.value || null)} style={inputStyle} /></label>
        <label>Cost price<input type="number" step="0.01" value={product.costPrice ?? ''} onChange={(e) => set('costPrice', e.target.value || null)} style={inputStyle} /></label>
        <label>
          Tax class
          <select value={product.taxClassId ?? ''} onChange={(e) => set('taxClassId', e.target.value || null)} style={inputStyle}>
            <option value="">None</option>
            {taxClasses.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
      </section>

      <section style={{ display: 'grid', gap: '0.5rem' }}>
        <h3 style={{ margin: 0, fontSize: '0.9375rem' }}>Inventory</h3>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <input type="checkbox" checked={product.trackInventory} onChange={(e) => set('trackInventory', e.target.checked)} /> Track inventory
        </label>
        {product.trackInventory && (
          <>
            <label>Stock count<input type="number" value={product.stockCount ?? ''} onChange={(e) => set('stockCount', e.target.value ? Number(e.target.value) : null)} style={inputStyle} /></label>
            <label>Low stock threshold<input type="number" value={product.lowStockThreshold ?? ''} onChange={(e) => set('lowStockThreshold', e.target.value ? Number(e.target.value) : null)} style={inputStyle} /></label>
            <label>
              Out of stock behaviour
              <select value={product.outOfStockBehaviour} onChange={(e) => set('outOfStockBehaviour', e.target.value)} style={inputStyle}>
                <option value="BLOCK">Block sales</option><option value="BACKORDER">Allow backorder</option>
              </select>
            </label>
          </>
        )}
      </section>

      <section style={{ display: 'grid', gap: '0.5rem' }}>
        <h3 style={{ margin: 0, fontSize: '0.9375rem' }}>Pre-order</h3>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <input type="checkbox" checked={product.isPreOrder} onChange={(e) => set('isPreOrder', e.target.checked)} /> This is a pre-order product
        </label>
        {product.isPreOrder && (
          <>
            <label>Expected dispatch date<input type="date" value={product.preOrderDispatchDate?.slice(0, 10) ?? ''} onChange={(e) => set('preOrderDispatchDate', e.target.value)} style={inputStyle} /></label>
            <label>Note<input value={product.preOrderNote ?? ''} onChange={(e) => set('preOrderNote', e.target.value)} style={inputStyle} /></label>
            <label>Max quantity<input type="number" value={product.preOrderMaxQuantity ?? ''} onChange={(e) => set('preOrderMaxQuantity', e.target.value ? Number(e.target.value) : null)} style={inputStyle} /></label>
            <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>{product.preOrderCount} units pre-ordered so far</p>
          </>
        )}
      </section>

      {product.type === 'DIGITAL' && (
        <section style={{ display: 'grid', gap: '0.5rem' }}>
          <h3 style={{ margin: 0, fontSize: '0.9375rem' }}>Digital file</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
              {digitalFileName ? digitalFileName : product.digitalFileId ? 'File attached' : 'No file uploaded yet'}
            </span>
            <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }}>
              {uploadingDigitalFile ? 'Uploading…' : product.digitalFileId ? 'Replace file' : 'Upload file'}
              <input type="file" style={{ display: 'none' }} disabled={uploadingDigitalFile} onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadDigitalFile(f) }} />
            </label>
          </div>
          <label>Download limit<input type="number" value={product.downloadLimit ?? ''} onChange={(e) => set('downloadLimit', e.target.value ? Number(e.target.value) : null)} style={inputStyle} /></label>
          <label>Download expiry (days)<input type="number" value={product.downloadExpiry ?? ''} onChange={(e) => set('downloadExpiry', e.target.value ? Number(e.target.value) : null)} style={inputStyle} /></label>
        </section>
      )}

      <section style={{ display: 'grid', gap: '0.5rem' }}>
        <h3 style={{ margin: 0, fontSize: '0.9375rem' }}>Images</h3>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {media.map((m, i) => (
            <div key={i} style={{ position: 'relative', width: 100 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={m.url} alt={m.altText ?? ''} style={{ width: 100, height: 100, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--color-border)', display: 'block' }} />
              {i === 0 && <span className="badge badge-primary" style={{ position: 'absolute', top: 4, left: 4 }}>Cover</span>}
              <button
                type="button"
                onClick={() => setMedia((prev) => prev.filter((_, j) => j !== i))}
                aria-label="Remove image"
                style={{ position: 'absolute', top: 4, right: 4, background: 'var(--color-overlay)', color: 'var(--color-text-inverse)', border: 'none', borderRadius: '50%', width: 20, height: 20, cursor: 'pointer', lineHeight: 1 }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <button type="button" onClick={() => setMediaPickerOpen(true)} style={{ ...buttonSecondary, justifySelf: 'start' }}>Add images</button>
        {mediaPickerOpen && (
          <MediaPickerModal
            onAdd={(items) => {
              setMedia((prev) => [...prev, ...items.filter((i) => !prev.some((p) => p.url === i.url)).map((i) => ({ type: 'IMAGE' as const, url: i.url, altText: i.altText }))])
              setMediaPickerOpen(false)
            }}
            onClose={() => setMediaPickerOpen(false)}
          />
        )}
      </section>

      <section style={{ display: 'grid', gap: '0.75rem' }}>
        <h3 style={{ margin: 0, fontSize: '0.9375rem' }}>Recommendations</h3>
        <div style={{ display: 'grid', gap: '0.5rem' }}>
          <span style={{ fontSize: '0.8125rem' }}>Related products</span>
          <label style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <select value={product.relatedMode} onChange={(e) => set('relatedMode', e.target.value as ProductData['relatedMode'])} style={{ ...inputStyle, width: 'auto' }}>
              <option value="MANUAL">Manual</option><option value="AUTOMATIC">Automatic</option>
            </select>
            <span>Limit <input type="number" min={1} value={product.relatedLimit} onChange={(e) => set('relatedLimit', Number(e.target.value) || 1)} style={{ ...inputStyle, width: 70, display: 'inline-block' }} /></span>
          </label>
          <ProductPicker excludeId={productId} value={relatedProducts} onChange={setRelatedProducts} reorderable label="Chosen related products (used when set, or always in Manual mode)" />
        </div>
        <div style={{ display: 'grid', gap: '0.5rem' }}>
          <span style={{ fontSize: '0.8125rem' }}>Upsells</span>
          <label style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <select value={product.upsellMode} onChange={(e) => set('upsellMode', e.target.value as ProductData['upsellMode'])} style={{ ...inputStyle, width: 'auto' }}>
              <option value="MANUAL">Manual</option><option value="AUTOMATIC">Automatic</option>
            </select>
            <span>Limit <input type="number" min={1} value={product.upsellLimit} onChange={(e) => set('upsellLimit', Number(e.target.value) || 1)} style={{ ...inputStyle, width: 70, display: 'inline-block' }} /></span>
          </label>
          <ProductPicker excludeId={productId} value={upsellProducts} onChange={setUpsellProducts} reorderable label="Chosen upsell products (used when set, or always in Manual mode)" />
        </div>
        {(product.relatedMode === 'AUTOMATIC' || product.upsellMode === 'AUTOMATIC') && (
          <ProductPicker excludeId={productId} value={excludedProducts} onChange={setExcludedProducts} label="Exclude from automatic suggestions" />
        )}
      </section>

      <section style={{ display: 'grid', gap: '0.5rem' }}>
        <h3 style={{ margin: 0, fontSize: '0.9375rem' }}>Categories</h3>
        {categories.map((c) => (
          <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <input type="checkbox" checked={categoryIds.includes(c.id)} onChange={() => setCategoryIds((prev) => toggle(prev, c.id))} /> {c.name}
          </label>
        ))}
        <h3 style={{ margin: 0, fontSize: '0.9375rem' }}>Tags</h3>
        {tags.map((t) => (
          <label key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <input type="checkbox" checked={tagIds.includes(t.id)} onChange={() => setTagIds((prev) => toggle(prev, t.id))} /> {t.name}
          </label>
        ))}
        <h3 style={{ margin: 0, fontSize: '0.9375rem' }}>Collections</h3>
        {collections.map((c) => (
          <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <input type="checkbox" checked={collectionIds.includes(c.id)} onChange={() => setCollectionIds((prev) => toggle(prev, c.id))} /> {c.name}
          </label>
        ))}
      </section>

      <section style={{ display: 'grid', gap: '0.5rem' }}>
        <h3 style={{ margin: 0, fontSize: '0.9375rem' }}>SEO</h3>
        <label>Meta title<input value={product.metaTitle ?? ''} onChange={(e) => set('metaTitle', e.target.value)} style={inputStyle} /></label>
        <label>Meta description<input value={product.metaDescription ?? ''} onChange={(e) => set('metaDescription', e.target.value)} style={inputStyle} /></label>
      </section>

      <button onClick={save} disabled={saving} style={buttonPrimary}>{saving ? 'Saving…' : 'Save product'}</button>
    </div>
  )
}

const inputStyle: React.CSSProperties = { display: 'block', width: '100%', padding: '0.5rem 0.75rem', borderRadius: 6, border: '1px solid var(--color-border)', marginTop: '0.25rem' }
const buttonPrimary: React.CSSProperties = { background: 'var(--color-primary)', color: 'var(--color-on-primary)', border: 'none', borderRadius: 8, padding: '0.625rem 1.25rem', fontWeight: 600, cursor: 'pointer', justifySelf: 'start' }
const buttonSecondary: React.CSSProperties = { background: 'var(--color-bg-subtle)', border: '1px solid var(--color-border)', borderRadius: 6, padding: '0.5rem 1rem', cursor: 'pointer' }
