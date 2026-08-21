import { connection } from 'next/server'
import Link from 'next/link'
import { getCategoryBySlug, getCategoryAncestorPath } from '@/modules/shop/lib/db/catalogue'
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
  const crumbs = (await getCategoryAncestorPath(category.id)).filter((a) => a.id !== category.id)
  // No fallback wording. The line used to default to "The range", which meant
  // every category on the site announced itself the same way whether or not
  // anyone had asked for it; blank is the default now, here and in the block's
  // defaultProps, and the span only appears once an owner types something.
  // Matches FilterCollectionHeader, which has always worked this way.
  const eyebrow = props.eyebrow

  return (
    <div>
      {props.showBreadcrumbs !== 'no' && crumbs.length > 0 && (
        <nav aria-label="Breadcrumb" style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', marginBottom: '0.5rem' }}>
          <Link href="/shop" style={{ color: 'inherit', textDecoration: 'none' }}>Shop</Link>
          {crumbs.map((a) => (
            <span key={a.id}>
              <span style={{ margin: '0 0.4rem' }}>/</span>
              <Link href={`/shop/categories/${a.slug}`} style={{ color: 'inherit', textDecoration: 'none' }}>{a.name}</Link>
            </span>
          ))}
        </nav>
      )}
      {eyebrow && <span style={EYEBROW}>{eyebrow}</span>}
      <h1 style={HEADING}>{category.name}</h1>
      {/* The header takes the short blurb, leaving the long description to the
          Category Description block (or the fallback page's own render of it).
          Falling back to `description` keeps every category that was written up
          before short descriptions existed looking exactly as it did. No width
          cap: the blurb is the page's opening line and stretches the full band,
          sitting above the description's columns. */}
      {props.showBlurb !== 'no' && (category.shortDescription || category.description) && (
        <p style={{ margin: '0.75rem 0 0', fontSize: '1.0625rem', color: 'var(--color-text-muted)' }}>
          {category.shortDescription || category.description}
        </p>
      )}
    </div>
  )
}

export const shopCategoryHeaderPuckRscComponent = { ...shopCategoryHeaderPuckComponent, render: ShopCategoryHeaderRsc }
