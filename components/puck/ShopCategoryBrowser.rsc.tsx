import { connection } from 'next/server'
import { listCategories } from '@/modules/shop/lib/db'
import { shopCategoryBrowserPuckComponent, type ShopCategoryBrowserProps } from './ShopCategoryBrowser'

// Server (RSC) half of Shop: Category Browser. Kept out of the client editor
// bundle - see ShopCategoryBrowser.tsx.

export async function ShopCategoryBrowserRsc(props: ShopCategoryBrowserProps) {
  await connection()
  const columns = props.columns ?? 4
  const all = await listCategories()
  const parent = props.parentCategorySlug ? all.find((c) => c.slug === props.parentCategorySlug) : null
  const categories = props.parentCategorySlug
    ? all.filter((c) => c.parentId === (parent?.id ?? '__none__'))
    : all.filter((c) => !c.parentId)

  if (categories.length === 0) return null

  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: '1rem' }}>
      {categories.map((c) => (
        <a key={c.id} href={`/shop/categories/${c.slug}`} style={{ textDecoration: 'none', color: 'inherit', border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden', display: 'block', textAlign: 'center' }}>
          <div style={{ aspectRatio: '1/1', background: 'var(--color-bg-subtle)' }} />
          <div style={{ padding: '0.75rem' }}>
            <h3 style={{ margin: 0, fontSize: '0.9375rem' }}>{c.name}</h3>
          </div>
        </a>
      ))}
    </div>
  )
}

export const shopCategoryBrowserPuckRscComponent = { ...shopCategoryBrowserPuckComponent, render: ShopCategoryBrowserRsc }
