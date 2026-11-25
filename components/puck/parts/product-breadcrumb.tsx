import Link from 'next/link'
import { SharedStyle } from '@/components/SharedStyle'

// The markup of Shop: Product Breadcrumb, shared by the block's editor half
// (placeholder crumbs) and its server half (the real trail), so the canvas and
// the storefront cannot drift apart. Pure: no data access, safe in either bundle.
//
// Crumbs with an href are links; the last crumb is the page itself and is
// printed as plain text with aria-current, which is the pattern screen readers
// and Google both expect. The separators are decoration and hidden from
// assistive tech - the ordered list already says "this, then this".

export type ProductCrumb = { label: string; href?: string }

export const PRODUCT_BREADCRUMB_SEPARATORS = ['>', '/', '›', '»'] as const

const CSS = `
.shop-crumbs { font-size: 0.8125rem; line-height: 1.5; color: var(--color-text-muted); margin: 0 0 0.75rem; }
.shop-crumbs ol { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; align-items: baseline; }
.shop-crumbs li { display: inline-flex; align-items: baseline; min-width: 0; }
.shop-crumbs a { color: inherit; text-decoration: none; }
.shop-crumbs a:hover { color: var(--color-text); text-decoration: underline; text-underline-offset: 2px; }
.shop-crumbs .shop-crumbs-sep { margin: 0 0.45rem; }
.shop-crumbs [aria-current="page"] { color: var(--color-text); }
`

export function ProductBreadcrumbTrail({ crumbs, separator }: { crumbs: ProductCrumb[]; separator?: string }) {
  if (crumbs.length === 0) return null
  const sep = separator && (PRODUCT_BREADCRUMB_SEPARATORS as readonly string[]).includes(separator) ? separator : '>'
  return (
    <>
      <SharedStyle id="shop-crumbs" css={CSS} />
      <nav aria-label="Breadcrumb" className="shop-crumbs">
        <ol>
          {crumbs.map((c, i) => {
            const last = i === crumbs.length - 1
            return (
              <li key={`${i}-${c.label}`}>
                {i > 0 && <span className="shop-crumbs-sep" aria-hidden="true">{sep}</span>}
                {last || !c.href
                  ? <span {...(last ? { 'aria-current': 'page' as const } : {})}>{c.label}</span>
                  : <Link href={c.href}>{c.label}</Link>}
              </li>
            )
          })}
        </ol>
      </nav>
    </>
  )
}
