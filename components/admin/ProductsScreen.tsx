'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useAdminPath } from '@/components/admin/AdminPathContext'
import { ImportModal } from '@/modules/shop/components/admin/ImportModal'
import { formatMoney } from '@/modules/shop/lib/money'
import { useCurrencySymbol } from '@/modules/shop/components/admin/use-currency-symbol'
import { usePrompt } from '@/modules/shop/components/admin/dialogs'

type ProductRow = {
  id: string; name: string; slug: string; type: string; status: string; price: string; stockCount: number | null; sku: string | null
}

export function ProductsScreen() {
  const adminPath = useAdminPath()
  const currencySymbol = useCurrencySymbol()
  const [promptText, promptNode] = usePrompt()
  const [products, setProducts] = useState<ProductRow[]>([])
  const [subscriberCounts, setSubscriberCounts] = useState<Record<string, { pending: number; fulfilled: number }>>({})
  const [search, setSearch] = useState('')
  const [importJobs, setImportJobs] = useState<Array<{ id: string; status: string; createdCount: number; updatedCount: number; skippedCount: number }>>([])
  const [importOpen, setImportOpen] = useState(false)

  function refresh() {
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    fetch(`/api/m/shop/admin/products?${params}`).then(async (r) => {
      if (!r.ok) return
      const data = await r.json()
      setProducts(data.products)
      setSubscriberCounts(data.subscriberCounts)
    })
    fetch('/api/m/shop/admin/products/import').then(async (r) => { if (r.ok) setImportJobs((await r.json()).jobs) })
  }

  useEffect(refresh, [search])

  async function createProduct() {
    const name = await promptText({ title: 'New product', placeholder: 'Product name', confirmLabel: 'Create' })
    if (!name) return
    const res = await fetch('/api/m/shop/admin/products', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, type: 'PHYSICAL', price: 0 }),
    })
    if (res.ok) {
      const { id } = await res.json()
      window.location.href = `/${adminPath}/m/shop/products/${id}`
    }
  }

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 className="page-title">Products</h1>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <Link href="/api/m/shop/admin/products/export" className="btn btn-secondary">Export CSV</Link>
          <Link href="/api/m/shop/admin/products/import-template" className="btn btn-secondary">Import template</Link>
          <button onClick={() => setImportOpen(true)} className="btn btn-secondary">Import CSV</button>
          <button onClick={createProduct} className="btn btn-primary">New product</button>
        </div>
      </div>

      {importOpen && <ImportModal onClose={() => setImportOpen(false)} onDone={refresh} />}

      <input aria-label="Search products" placeholder="Search products…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ padding: '0.5rem 0.75rem', borderRadius: 6, border: '1px solid var(--color-border)', marginBottom: '1rem', width: 300 }} />

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--color-border)' }}>
            <th style={{ padding: '0.5rem' }}>Name</th>
            <th style={{ padding: '0.5rem' }}>Type</th>
            <th style={{ padding: '0.5rem' }}>Status</th>
            <th style={{ padding: '0.5rem' }}>Price</th>
            <th style={{ padding: '0.5rem' }}>Stock</th>
            <th style={{ padding: '0.5rem' }}>Subscribers</th>
          </tr>
        </thead>
        <tbody>
          {products.map((p) => (
            <tr key={p.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
              <td style={{ padding: '0.5rem' }}><a href={`/${adminPath}/m/shop/products/${p.id}`}>{p.name}</a></td>
              <td style={{ padding: '0.5rem' }}>{p.type}</td>
              <td style={{ padding: '0.5rem' }}>{p.status}</td>
              <td style={{ padding: '0.5rem' }}>{formatMoney(p.price, currencySymbol)}</td>
              <td style={{ padding: '0.5rem' }}>{p.stockCount ?? '—'}</td>
              <td style={{ padding: '0.5rem' }}>
                {subscriberCounts[p.id]
                  ? <a href={`/${adminPath}/m/shop/back-in-stock?productId=${p.id}`}>{subscriberCounts[p.id]!.pending} pending</a>
                  : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {importJobs.length > 0 && (
        <div style={{ marginTop: '2rem' }}>
          <h3 style={{ fontSize: '0.9375rem' }}>Recent imports</h3>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {importJobs.map((job) => (
              <li key={job.id} style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
                {job.status} - {job.createdCount} created, {job.updatedCount} updated, {job.skippedCount} skipped
              </li>
            ))}
          </ul>
        </div>
      )}
      {promptNode}
    </div>
  )
}
