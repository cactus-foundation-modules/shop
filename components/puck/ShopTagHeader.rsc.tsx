import { connection } from 'next/server'
import Link from 'next/link'
import { getTagBySlug } from '@/modules/shop/lib/db/catalogue'
import { shopTagHeaderPuckComponent, type ShopTagHeaderProps } from './ShopTagHeader'

// Server (RSC) half of Shop: Tag Header. Kept out of the client editor bundle -
// see ShopTagHeader.tsx. A tag kept off the storefront has no page, so it has no
// header either: the guard here matches the page's own, rather than letting a
// stray layout print the name of something meant to stay in the admin.

export async function ShopTagHeaderRsc(props: ShopTagHeaderProps) {
  await connection()
  if (!props.tagSlug) return null
  const tag = await getTagBySlug(props.tagSlug)
  if (!tag || !tag.storefrontVisible) return null

  return (
    <div>
      {props.showBreadcrumbs !== 'no' && (
        <nav aria-label="Breadcrumb" style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', marginBottom: '0.5rem' }}>
          <Link href="/shop" style={{ color: 'inherit' }}>Shop</Link>
          <span style={{ margin: '0 0.375rem' }}>/</span>
          <span>{tag.name}</span>
        </nav>
      )}
      <h1 style={{ margin: '0 0 0.5rem', fontSize: '1.75rem' }}>{tag.name}</h1>
      {props.showDescription !== 'no' && tag.description && (
        <p style={{ margin: 0, fontSize: '1.0625rem', color: 'var(--color-text-muted)' }}>{tag.description}</p>
      )}
    </div>
  )
}

export const shopTagHeaderPuckRscComponent = { ...shopTagHeaderPuckComponent, render: ShopTagHeaderRsc }
