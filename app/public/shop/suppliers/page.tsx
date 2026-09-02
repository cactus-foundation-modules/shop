import { notFound } from 'next/navigation'
import Link from 'next/link'
import { listStorefrontSuppliers } from '@/modules/shop/lib/db/suppliers'
import { getShopConfigCached, resolveSupplierLabel } from '@/modules/shop/lib/config'
import { getShopGate } from '@/modules/shop/lib/access'
import { ShopClosedNotice, ShopStaffPreviewBanner } from '@/modules/shop/components/public/ShopClosedNotice'
import { supplierHref } from '@/modules/shop/lib/supplier-url'

// The index above the supplier pages. Deliberately plain: it exists so that
// /shop/suppliers is a page rather than a 404 sitting one level above a set of
// pages that do work, and so a menu can offer "all our suppliers" without
// somebody having to build a page for it by hand. A shop that wants a designed
// version builds one as an ordinary page and points the menu at that instead.
//
// The heading follows the wording the shop chose for the field, so a site that
// calls them Manufacturers says Manufacturers. The address does not - see
// lib/supplier-url.ts for why.

async function published() {
  const config = await getShopConfigCached()
  if (!config.supplierFieldEnabled || !config.supplierPagesEnabled) return null
  return { config, suppliers: await listStorefrontSuppliers() }
}

export async function generateMetadata() {
  if ((await getShopGate()).blocked) return {}
  const data = await published()
  if (!data) return {}
  const label = resolveSupplierLabel(data.config)
  return { title: label === 'Supplier' ? 'Suppliers' : `${label}s` }
}

export default async function ShopSuppliersIndexPage() {
  const gate = await getShopGate()
  if (gate.blocked) return <ShopClosedNotice message={gate.message} />

  const data = await published()
  if (!data) notFound()
  const label = resolveSupplierLabel(data.config)

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '2rem 1.5rem' }}>
      {gate.staffPreview && <ShopStaffPreviewBanner />}
      <nav aria-label="Breadcrumb" style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', marginBottom: '0.75rem' }}>
        <Link href="/shop" style={{ color: 'inherit', textDecoration: 'none' }}>Shop</Link>
        <span style={{ margin: '0 0.4rem' }}>/</span>
        <span style={{ color: 'var(--color-text)' }}>{label === 'Supplier' ? 'Suppliers' : `${label}s`}</span>
      </nav>

      <h1 style={{ fontSize: '1.75rem' }}>{label === 'Supplier' ? 'Suppliers' : `${label}s`}</h1>

      {data.suppliers.length === 0 ? (
        <p style={{ color: 'var(--color-text-muted)' }}>Nobody has a page here yet.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: '1.5rem 0 0', display: 'grid', gap: '1rem' }}>
          {data.suppliers.map((s) => (
            <li key={s.id}>
              <Link href={supplierHref(s.slug)} style={{ color: 'var(--color-text)', fontSize: '1.0625rem', fontWeight: 600 }}>{s.name}</Link>
              {s.shortDescription && <div style={{ color: 'var(--color-text-muted)' }}>{s.shortDescription}</div>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
