import { connection } from 'next/server'
import Link from 'next/link'
import { getCollectionBySlug } from '@/modules/shop/lib/db/catalogue'
import { shopCollectionHeaderPuckComponent, type ShopCollectionHeaderProps } from './ShopCollectionHeader'

// Server (RSC) half of Shop: Collection Header. Kept out of the client editor
// bundle - see ShopCollectionHeader.tsx.

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

export const shopCollectionHeaderPuckRscComponent = { ...shopCollectionHeaderPuckComponent, render: ShopCollectionHeaderRsc }
