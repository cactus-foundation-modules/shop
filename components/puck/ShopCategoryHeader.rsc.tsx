import { connection } from 'next/server'
import { getCategoryBySlug } from '@/modules/shop/lib/db/catalogue'
import { shopCategoryHeaderPuckComponent, type ShopCategoryHeaderProps } from './ShopCategoryHeader'

// Server (RSC) half of Shop: Category Header. Kept out of the client editor
// bundle - see ShopCategoryHeader.tsx.

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

export const shopCategoryHeaderPuckRscComponent = { ...shopCategoryHeaderPuckComponent, render: ShopCategoryHeaderRsc }
