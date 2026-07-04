import { connection } from 'next/server'
import Link from 'next/link'
import { getCategoryBySlug } from '@/modules/shop/lib/db/catalogue'

// [ANCHOR] - categorySlug is injected by the category page (lib/inject-category-context.ts)
export type ShopCategoryHeaderProps = { categorySlug?: string }

export function ShopCategoryHeader() {
  return (
    <div style={{ opacity: 0.6 }}>
      <div style={{ height: 14, width: '20%', background: 'var(--color-border)', borderRadius: 4, marginBottom: '0.75rem' }} />
      <div style={{ height: 32, width: '40%', background: 'var(--color-border)', borderRadius: 4, marginBottom: '0.5rem' }} />
      <div style={{ height: 18, width: '60%', background: 'var(--color-border)', borderRadius: 4 }} />
    </div>
  )
}

export async function ShopCategoryHeaderRsc(props: ShopCategoryHeaderProps) {
  await connection()
  if (!props.categorySlug) return null
  const category = await getCategoryBySlug(props.categorySlug)
  if (!category) return null

  return (
    <div>
      <nav aria-label="Breadcrumb" style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', marginBottom: '0.5rem' }}>
        <Link href="/shop" style={{ color: 'inherit' }}>Shop</Link>
        <span style={{ margin: '0 0.375rem' }}>/</span>
        <span>{category.name}</span>
      </nav>
      <h1 style={{ margin: '0 0 0.5rem', fontSize: '1.75rem' }}>{category.name}</h1>
      {category.description && <p style={{ margin: 0, fontSize: '1.0625rem', color: 'var(--color-text-muted)' }}>{category.description}</p>}
    </div>
  )
}

export const shopCategoryHeaderPuckComponent = {
  label: 'Shop: Category Header [Anchor]',
  fields: {},
  defaultProps: {},
  permissions: { delete: false, duplicate: false },
  render: ShopCategoryHeader,
}

export const shopCategoryHeaderPuckRscComponent = { ...shopCategoryHeaderPuckComponent, render: ShopCategoryHeaderRsc }
