import { connection } from 'next/server'
import { getCategoryBySlug } from '@/modules/shop/lib/db/catalogue'

// [ANCHOR] - categorySlug is injected by the category page (lib/inject-category-context.ts)
export type ShopCategoryHeaderProps = { categorySlug?: string }

const EYEBROW: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 600,
  letterSpacing: '0.16em',
  textTransform: 'uppercase',
  color: 'var(--color-primary)',
  marginBottom: '0.75rem',
}

const HEADING: React.CSSProperties = {
  margin: 0,
  fontFamily: 'var(--display-family, Georgia, serif)',
  fontSize: 'clamp(30px, 4vw, 44px)',
  fontWeight: 600,
  lineHeight: 1.1,
  color: 'var(--color-fg)',
}

export function ShopCategoryHeader() {
  return (
    <div style={{ opacity: 0.6 }}>
      <div style={{ height: 12, width: '18%', background: 'var(--color-border)', borderRadius: 4, marginBottom: '0.75rem' }} />
      <div style={{ height: 40, width: '55%', background: 'var(--color-border)', borderRadius: 4, marginBottom: '0.5rem' }} />
      <div style={{ height: 16, width: '60%', background: 'var(--color-border)', borderRadius: 4 }} />
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
      <span style={EYEBROW}>The range</span>
      <h1 style={HEADING}>{category.name}</h1>
      {category.description && (
        <p style={{ margin: '0.75rem 0 0', fontSize: '1.0625rem', maxWidth: '60ch', color: 'var(--color-text-muted)' }}>
          {category.description}
        </p>
      )}
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
