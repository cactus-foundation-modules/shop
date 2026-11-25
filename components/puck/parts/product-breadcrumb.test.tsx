import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ProductBreadcrumbTrail } from '@/modules/shop/components/puck/parts/product-breadcrumb'
import { ShopProductBreadcrumb } from '@/modules/shop/components/puck/ShopProductBreadcrumb'

const html = (el: React.ReactElement) => renderToStaticMarkup(el)

describe('ProductBreadcrumbTrail', () => {
  const crumbs = [
    { label: 'Home', href: '/' },
    { label: 'Office Tables', href: '/shop/categories/office-tables' },
    { label: 'Café Tables', href: '/shop/categories/cafe-tables' },
    { label: 'High Table' },
  ]

  it('links every step but the last, which is the current page', () => {
    const out = html(<ProductBreadcrumbTrail crumbs={crumbs} />)
    expect(out).toContain('<nav aria-label="Breadcrumb" class="shop-crumbs">')
    expect(out).toContain('href="/shop/categories/office-tables"')
    expect(out).toContain('<span aria-current="page">High Table</span>')
    expect(out).not.toContain('href="undefined"')
  })

  it('does not link the last step even when it carries an href', () => {
    const out = html(<ProductBreadcrumbTrail crumbs={[{ label: 'Home', href: '/' }, { label: 'Chairs', href: '/shop/categories/chairs' }]} />)
    expect(out).not.toContain('href="/shop/categories/chairs"')
    expect(out).toContain('<span aria-current="page">Chairs</span>')
  })

  it('puts a hidden separator between steps, never before the first', () => {
    const out = html(<ProductBreadcrumbTrail crumbs={crumbs} separator="/" />)
    expect(out.match(/class="shop-crumbs-sep" aria-hidden="true">\/</g)).toHaveLength(3)
  })

  it('falls back to > for a separator it does not offer', () => {
    const out = html(<ProductBreadcrumbTrail crumbs={crumbs} separator="<script>" />)
    expect(out).toContain('aria-hidden="true">&gt;</span>')
    expect(out).not.toContain('<script>')
  })

  it('draws nothing for an empty trail', () => {
    expect(html(<ProductBreadcrumbTrail crumbs={[]} />)).toBe('')
  })
})

describe('ShopProductBreadcrumb editor half', () => {
  it('ends with the product name unless told not to', () => {
    expect(html(<ShopProductBreadcrumb />)).toContain('aria-current="page">Product name<')
    const off = html(<ShopProductBreadcrumb showProductName="no" />)
    expect(off).not.toContain('Product name')
    expect(off).toContain('aria-current="page">Sub-category<')
  })

  it('uses the owner’s label for the first step', () => {
    expect(html(<ShopProductBreadcrumb homeLabel="Deskwell" />)).toContain('>Deskwell<')
  })
})
