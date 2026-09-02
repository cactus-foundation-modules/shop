import { connection } from 'next/server'
import Link from 'next/link'
import { getSupplierBySlug } from '@/modules/shop/lib/db/suppliers'
import { shopSupplierHeaderPuckComponent, type ShopSupplierHeaderProps } from './ShopSupplierHeader'

// Server (RSC) half of Shop: Supplier Header. Kept out of the client editor
// bundle - see ShopSupplierHeader.tsx. A supplier whose page is not published has
// no header either: the guard here matches the page's own, rather than letting a
// stray layout print the name of somebody meant to stay in the admin.

export async function ShopSupplierHeaderRsc(props: ShopSupplierHeaderProps) {
  await connection()
  if (!props.supplierSlug) return null
  const supplier = await getSupplierBySlug(props.supplierSlug)
  if (!supplier || !supplier.storefrontVisible) return null

  return (
    <div>
      {props.showBreadcrumbs !== 'no' && (
        <nav aria-label="Breadcrumb" style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', marginBottom: '0.5rem' }}>
          <Link href="/shop" style={{ color: 'inherit' }}>Shop</Link>
          <span style={{ margin: '0 0.375rem' }}>/</span>
          <span>{supplier.name}</span>
        </nav>
      )}
      <h1 style={{ margin: '0 0 0.5rem', fontSize: '1.75rem' }}>{supplier.name}</h1>
      {props.showDescription !== 'no' && supplier.shortDescription && (
        <p style={{ margin: 0, fontSize: '1.0625rem', color: 'var(--color-text-muted)' }}>{supplier.shortDescription}</p>
      )}
    </div>
  )
}

export const shopSupplierHeaderPuckRscComponent = { ...shopSupplierHeaderPuckComponent, render: ShopSupplierHeaderRsc }
