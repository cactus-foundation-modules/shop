'use client'

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useAdminPath } from '@/components/admin/AdminPathContext'
import { ImportModal } from '@/modules/shop/components/admin/ImportModal'
import { productsScreenCss } from '@/modules/shop/components/admin/products-screen-css'
import { formatMoney } from '@/modules/shop/lib/money'
import { useCurrencySymbol } from '@/modules/shop/components/admin/use-currency-symbol'
import { usePrompt, useConfirm, useAlert } from '@/modules/shop/components/admin/dialogs'

type ProductRow = {
  id: string; name: string; slug: string; type: string; status: string
  price: string; compareAtPrice: string | null
  stockCount: number | null; trackInventory: boolean; lowStockThreshold: number | null
  sku: string | null; isPreOrder: boolean
}

const PER_PAGE = 20

const STATUS_TABS: Array<{ value: string; label: string }> = [
  { value: '', label: 'All' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'ARCHIVED', label: 'Archived' },
]

const TYPE_BADGE: Record<string, { cls: string; label: string }> = {
  PHYSICAL: { cls: 'badge-default', label: 'Physical' },
  DIGITAL: { cls: 'badge-info', label: 'Digital' },
  SERVICE: { cls: 'badge-primary', label: 'Service' },
}
const STATUS_BADGE: Record<string, { cls: string; label: string }> = {
  ACTIVE: { cls: 'badge-success', label: 'Active' },
  DRAFT: { cls: 'badge-default', label: 'Draft' },
  ARCHIVED: { cls: 'badge-warning', label: 'Archived' },
}

function stockBadge(p: ProductRow): { cls: string; label: string } | null {
  if (!p.trackInventory) return { cls: 'badge-default', label: 'Not tracked' }
  if (p.stockCount == null) return null
  if (p.stockCount <= 0) return { cls: 'badge-error', label: 'Out of stock' }
  if (p.lowStockThreshold != null && p.stockCount <= p.lowStockThreshold) return { cls: 'badge-warning', label: `Low · ${p.stockCount}` }
  return { cls: 'badge-success', label: `${p.stockCount} in stock` }
}

// `toolbarExtras` are controls other modules hang beside the header buttons via
// the `shop.products-toolbar` extension point (e.g. the Google Sheet dropdown).
// Server-resolved on the page and passed straight through; empty on a plain shop.
export function ProductsScreen({ toolbarExtras }: { toolbarExtras?: ReactNode } = {}) {
  const adminPath = useAdminPath()
  const currencySymbol = useCurrencySymbol()
  const [promptText, promptNode] = usePrompt()
  const [confirm, confirmNode] = useConfirm()
  const [alert, alertNode] = useAlert()

  const [products, setProducts] = useState<ProductRow[]>([])
  const [images, setImages] = useState<Record<string, string>>({})
  const [subscriberCounts, setSubscriberCounts] = useState<Record<string, { pending: number; fulfilled: number }>>({})
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  const [search, setSearch] = useState('')
  const [searchDebounced, setSearchDebounced] = useState('')
  const [status, setStatus] = useState('')
  const [type, setType] = useState('')
  const [stock, setStock] = useState('')
  const [sort, setSort] = useState('newest')
  const [page, setPage] = useState(1)

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [menuFor, setMenuFor] = useState<{ id: string; x: number; y: number } | null>(null)

  const [importJobs, setImportJobs] = useState<Array<{ id: string; status: string; createdCount: number; updatedCount: number; skippedCount: number }>>([])
  const [importOpen, setImportOpen] = useState(false)

  // Debounce the search box, and snap back to page one whenever the query
  // changes (batched so it is a single fetch).
  useEffect(() => {
    const t = setTimeout(() => { setSearchDebounced(search); setPage(1) }, 250)
    return () => clearTimeout(t)
  }, [search])

  const refresh = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams()
    if (searchDebounced) params.set('search', searchDebounced)
    if (status) params.set('status', status)
    if (type) params.set('type', type)
    if (stock) params.set('stock', stock)
    if (sort) params.set('sort', sort)
    params.set('page', String(page))
    params.set('perPage', String(PER_PAGE))
    fetch(`/api/m/shop/admin/products?${params}`)
      .then(async (r) => {
        if (!r.ok) return
        const data = await r.json()
        setProducts(data.products)
        setImages(data.images ?? {})
        setSubscriberCounts(data.subscriberCounts ?? {})
        setTotal(data.total ?? 0)
        // Drop any selection from the previous view - those rows may not be on
        // this page, and a bulk action must never touch a row you can't see.
        setSelected(new Set())
      })
      .finally(() => setLoading(false))
    fetch('/api/m/shop/admin/products/import').then(async (r) => { if (r.ok) setImportJobs((await r.json()).jobs) })
  }, [searchDebounced, status, type, stock, sort, page])

  // refresh() flips `loading` on before awaiting the fetch - a deliberate single
  // re-render, not a cascade; every other setState it makes runs after the await.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { refresh() }, [refresh])

  // Close the row menu on scroll, resize or Escape - a fixed-position menu would
  // otherwise drift away from its button.
  useEffect(() => {
    if (!menuFor) return
    const close = () => setMenuFor(null)
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [menuFor])

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
    } else {
      await alert('Could not create the product.')
    }
  }

  async function duplicate(p: ProductRow) {
    setMenuFor(null)
    setBusy(true)
    const res = await fetch(`/api/m/shop/admin/products/${p.id}/duplicate`, { method: 'POST' })
    setBusy(false)
    if (res.ok) {
      const { id } = await res.json()
      window.location.href = `/${adminPath}/m/shop/products/${id}`
    } else {
      await alert('Could not duplicate the product.')
    }
  }

  async function remove(p: ProductRow) {
    setMenuFor(null)
    if (!(await confirm({
      title: 'Delete product?',
      message: `"${p.name}" will be permanently removed. Any orders that included it keep their history.`,
      confirmLabel: 'Delete',
    }))) return
    setBusy(true)
    const res = await fetch(`/api/m/shop/admin/products/${p.id}`, { method: 'DELETE' })
    setBusy(false)
    if (res.ok) refresh()
    else await alert(((await res.json().catch(() => ({}))) as { error?: string }).error ?? 'Could not delete the product.')
  }

  async function runBulk(body: { action: 'delete' } | { action: 'status'; status: string }) {
    const ids = [...selected]
    setBusy(true)
    const res = await fetch('/api/m/shop/admin/products/bulk', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, ids }),
    })
    setBusy(false)
    if (res.ok) refresh()
    else await alert(((await res.json().catch(() => ({}))) as { error?: string }).error ?? 'That action could not be completed.')
  }

  async function bulkDelete() {
    const n = selected.size
    if (!(await confirm({
      title: `Delete ${n} product${n === 1 ? '' : 's'}?`,
      message: 'They will be permanently removed. Any orders that included them keep their history.',
      confirmLabel: 'Delete',
    }))) return
    await runBulk({ action: 'delete' })
  }

  function toggle(id: string) {
    setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }
  const allOnPage = products.length > 0 && products.every((p) => selected.has(p.id))
  const someOnPage = products.some((p) => selected.has(p.id))
  function toggleAll() {
    setSelected(() => (allOnPage ? new Set() : new Set(products.map((p) => p.id))))
  }

  function openMenu(e: React.MouseEvent<HTMLButtonElement>, id: string) {
    const r = e.currentTarget.getBoundingClientRect()
    setMenuFor((cur) => (cur?.id === id ? null : { id, x: r.right, y: r.bottom + 4 }))
  }

  const pageCount = Math.max(1, Math.ceil(total / PER_PAGE))
  const firstOnPage = total === 0 ? 0 : (page - 1) * PER_PAGE + 1
  const lastOnPage = Math.min(page * PER_PAGE, total)
  const hasFilters = Boolean(searchDebounced || status || type || stock)
  const menuProduct = menuFor ? products.find((p) => p.id === menuFor.id) : null

  return (
    <div>
      <style dangerouslySetInnerHTML={{ __html: productsScreenCss }} />

      <div className="page-header">
        <div>
          <h1 className="page-title">Products</h1>
          {!loading && <p className="sps-count">{total} product{total === 1 ? '' : 's'}</p>}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <Link href="/api/m/shop/admin/products/export" className="btn btn-secondary btn-sm">Export CSV</Link>
          <Link href="/api/m/shop/admin/products/import-template" className="btn btn-secondary btn-sm">Import template</Link>
          <button onClick={() => setImportOpen(true)} className="btn btn-secondary btn-sm">Import CSV</button>
          <button onClick={createProduct} className="btn btn-primary btn-sm">New product</button>
          {toolbarExtras}
        </div>
      </div>

      {importOpen && <ImportModal onClose={() => setImportOpen(false)} onDone={refresh} />}

      <div className="sps-toolbar">
        <input className="sps-search" aria-label="Search products" placeholder="Search by name or SKU…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <div className="sps-seg" role="group" aria-label="Filter by status">
          {STATUS_TABS.map((t) => (
            <button key={t.value} className={status === t.value ? 'is-active' : ''} onClick={() => { setStatus(t.value); setPage(1) }}>{t.label}</button>
          ))}
        </div>
        <select className="sps-select" aria-label="Filter by type" value={type} onChange={(e) => { setType(e.target.value); setPage(1) }}>
          <option value="">All types</option>
          <option value="PHYSICAL">Physical</option>
          <option value="DIGITAL">Digital</option>
          <option value="SERVICE">Service</option>
        </select>
        <select className="sps-select" aria-label="Filter by stock" value={stock} onChange={(e) => { setStock(e.target.value); setPage(1) }}>
          <option value="">Any stock</option>
          <option value="in">In stock</option>
          <option value="low">Low stock</option>
          <option value="out">Out of stock</option>
        </select>
        <select className="sps-select" aria-label="Sort" value={sort} onChange={(e) => { setSort(e.target.value); setPage(1) }}>
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="name-asc">Name A–Z</option>
          <option value="name-desc">Name Z–A</option>
          <option value="price-asc">Price low–high</option>
          <option value="price-desc">Price high–low</option>
          <option value="stock-asc">Stock low–high</option>
          <option value="stock-desc">Stock high–low</option>
        </select>
      </div>

      {selected.size > 0 && (
        <div className="sps-bulkbar">
          <span className="sps-bulkbar-count">{selected.size} selected</span>
          <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => runBulk({ action: 'status', status: 'ACTIVE' })}>Set active</button>
          <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => runBulk({ action: 'status', status: 'DRAFT' })}>Set draft</button>
          <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => runBulk({ action: 'status', status: 'ARCHIVED' })}>Archive</button>
          <button className="btn btn-danger btn-sm" disabled={busy} onClick={bulkDelete}>Delete</button>
          <span className="sps-bulkbar-spacer" />
          <button className="btn btn-ghost btn-sm" onClick={() => setSelected(new Set())}>Clear</button>
        </div>
      )}

      {loading ? (
        <div className="sps-wrap"><div className="sps-loading">Loading products…</div></div>
      ) : products.length === 0 ? (
        <div className="sps-empty">
          {hasFilters ? (
            <>
              <h3>No products match those filters</h3>
              <p>Try widening the search or clearing a filter.</p>
              <button className="btn btn-secondary btn-sm" onClick={() => { setSearch(''); setStatus(''); setType(''); setStock(''); setPage(1) }}>Clear filters</button>
            </>
          ) : (
            <>
              <h3>No products yet</h3>
              <p>Add your first product, or import a batch from a spreadsheet.</p>
              <button className="btn btn-primary btn-sm" onClick={createProduct}>New product</button>
            </>
          )}
        </div>
      ) : (
        <div className="sps-wrap">
          <table className="sps-table">
            <thead>
              <tr>
                <th className="sps-check">
                  <input type="checkbox" aria-label="Select all on this page" checked={allOnPage} ref={(el) => { if (el) el.indeterminate = someOnPage && !allOnPage }} onChange={toggleAll} />
                </th>
                <th colSpan={2}>Product</th>
                <th>SKU</th>
                <th>Type</th>
                <th>Status</th>
                <th>Price</th>
                <th>Stock</th>
                <th>Subscribers</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {products.map((p) => {
                const sb = stockBadge(p)
                const tb = TYPE_BADGE[p.type]
                const stb = STATUS_BADGE[p.status]
                const img = images[p.id]
                const subs = subscriberCounts[p.id]
                return (
                  <tr key={p.id} className={selected.has(p.id) ? 'is-selected' : ''}>
                    <td className="sps-check">
                      <input type="checkbox" aria-label={`Select ${p.name}`} checked={selected.has(p.id)} onChange={() => toggle(p.id)} />
                    </td>
                    <td style={{ width: 48, paddingRight: 0 }}>
                      {img
                        // eslint-disable-next-line @next/next/no-img-element -- media library URLs are arbitrary remote hosts, not a configured next/image loader
                        ? <img className="sps-thumb" src={img} alt="" />
                        : <div className="sps-thumb-empty" aria-hidden>▦</div>}
                    </td>
                    <td>
                      <a className="sps-name" href={`/${adminPath}/m/shop/products/${p.id}`}>{p.name}</a>
                      {p.isPreOrder && <span className="badge badge-info" style={{ marginLeft: '0.5rem' }}>Pre-order</span>}
                      <div className="sps-slug">/{p.slug}</div>
                    </td>
                    <td className="sps-muted">{p.sku || '—'}</td>
                    <td>{tb ? <span className={`badge ${tb.cls}`}>{tb.label}</span> : p.type}</td>
                    <td>{stb ? <span className={`badge ${stb.cls}`}>{stb.label}</span> : p.status}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {formatMoney(p.price, currencySymbol)}
                      {p.compareAtPrice && Number(p.compareAtPrice) > Number(p.price) && (
                        <span className="sps-price-was">{formatMoney(p.compareAtPrice, currencySymbol)}</span>
                      )}
                    </td>
                    <td>{sb ? <span className={`badge ${sb.cls}`}>{sb.label}</span> : <span className="sps-muted">—</span>}</td>
                    <td>
                      {subs && subs.pending > 0
                        ? <a className="sps-subs" href={`/${adminPath}/m/shop/back-in-stock?productId=${p.id}`}>{subs.pending} waiting</a>
                        : <span className="sps-muted">—</span>}
                    </td>
                    <td className="sps-actions">
                      <button className="sps-kebab" aria-label={`Actions for ${p.name}`} aria-haspopup="menu" onClick={(e) => openMenu(e, p.id)}>⋯</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {total > PER_PAGE && (
        <div className="sps-pager">
          <span className="sps-pager-info">Showing {firstOnPage}–{lastOnPage} of {total}</span>
          <div className="sps-pager-btns">
            <button className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Previous</button>
            <span className="btn btn-ghost btn-sm" style={{ pointerEvents: 'none' }}>Page {page} of {pageCount}</span>
            <button className="btn btn-secondary btn-sm" disabled={page >= pageCount} onClick={() => setPage((p) => Math.min(pageCount, p + 1))}>Next</button>
          </div>
        </div>
      )}

      {menuFor && menuProduct && (
        <>
          <div className="sps-menu-overlay" onClick={() => setMenuFor(null)} />
          <div className="sps-menu" role="menu" style={{ left: menuFor.x, top: menuFor.y }}>
            <button role="menuitem" onClick={() => { window.location.href = `/${adminPath}/m/shop/products/${menuProduct.id}` }}>✏️ Edit</button>
            <button role="menuitem" disabled={busy} onClick={() => duplicate(menuProduct)}>⧉ Duplicate</button>
            <div className="sps-menu-sep" />
            <button role="menuitem" className="sps-menu-danger" disabled={busy} onClick={() => remove(menuProduct)}>🗑 Delete</button>
          </div>
        </>
      )}

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
      {confirmNode}
      {alertNode}
    </div>
  )
}
