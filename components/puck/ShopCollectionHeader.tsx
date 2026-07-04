import { connection } from 'next/server'
import Link from 'next/link'
import { getCollectionBySlug } from '@/modules/shop/lib/db/catalogue'

// [ANCHOR] - collectionSlug is injected by the collection page (lib/inject-collection-context.ts)
export type ShopCollectionHeaderProps = { collectionSlug?: string }

export function ShopCollectionHeader() {
  return (
    <div style={{ opacity: 0.6 }}>
      <div style={{ height: 14, width: '20%', background: 'var(--color-border)', borderRadius: 4, marginBottom: '0.75rem' }} />
      <div style={{ height: 32, width: '40%', background: 'var(--color-border)', borderRadius: 4, marginBottom: '0.5rem' }} />
      <div style={{ height: 18, width: '60%', background: 'var(--color-border)', borderRadius: 4 }} />
    </div>
  )
}

export async function ShopCollectionHeaderRsc(props: ShopCollectionHeaderProps) {
  await connection()
  if (!props.collectionSlug) return null
  const collection = await getCollectionBySlug(props.collectionSlug)
  if (!collection) return null

  return (
    <div>
      <nav aria-label="Breadcrumb" style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', marginBottom: '0.5rem' }}>
        <Link href="/shop" style={{ color: 'inherit' }}>Shop</Link>
        <span style={{ margin: '0 0.375rem' }}>/</span>
        <span>{collection.name}</span>
      </nav>
      <h1 style={{ margin: '0 0 0.5rem', fontSize: '1.75rem' }}>{collection.name}</h1>
      {collection.description && <p style={{ margin: 0, fontSize: '1.0625rem', color: 'var(--color-text-muted)' }}>{collection.description}</p>}
    </div>
  )
}

export const shopCollectionHeaderPuckComponent = {
  label: 'Shop: Collection Header [Anchor]',
  fields: {},
  defaultProps: {},
  permissions: { delete: false, duplicate: false },
  render: ShopCollectionHeader,
}

export const shopCollectionHeaderPuckRscComponent = { ...shopCollectionHeaderPuckComponent, render: ShopCollectionHeaderRsc }
