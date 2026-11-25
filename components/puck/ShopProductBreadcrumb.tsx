import { ProductBreadcrumbTrail, PRODUCT_BREADCRUMB_SEPARATORS, type ProductCrumb } from '@/modules/shop/components/puck/parts/product-breadcrumb'

// Shop: Product Breadcrumb - Home > top category > ... > lead category > product.
//
// productSlug is injected by the product detail page (lib/inject-product-context.ts),
// so one block in the shared product layout serves every product. The trail is
// the product's Lead category (product editor, Organisation) and that
// category's parents; a product with no lead category falls back to the first
// category it is filed under.
//
// EDITOR half only: placeholder trail + Puck field config. The server render
// lives in ShopProductBreadcrumb.rsc.tsx (wired by `rscImport` in the manifest)
// so the database lookups never land in the client editor bundle. Both halves
// draw through ProductBreadcrumbTrail, so the markup is the same.
export type ShopProductBreadcrumbProps = {
  productSlug?: string
  homeLabel?: string
  separator?: string
  showProductName?: string
}

export function ShopProductBreadcrumb(props: ShopProductBreadcrumbProps) {
  const crumbs: ProductCrumb[] = [
    { label: props.homeLabel || 'Home', href: '#' },
    { label: 'Main category', href: '#' },
    { label: 'Sub-category', href: '#' },
  ]
  if (props.showProductName !== 'no') crumbs.push({ label: 'Product name' })
  return <ProductBreadcrumbTrail crumbs={crumbs} separator={props.separator} />
}

export const shopProductBreadcrumbPuckComponent = {
  label: 'Shop: Product Breadcrumb',
  fields: {
    homeLabel: { type: 'text' as const, label: 'First link (goes to the home page)' },
    separator: {
      type: 'select' as const,
      label: 'Between each step',
      options: PRODUCT_BREADCRUMB_SEPARATORS.map((s) => ({ value: s, label: s })),
    },
    showProductName: {
      type: 'select' as const,
      label: 'End with the product name',
      options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }],
    },
  },
  defaultProps: { homeLabel: 'Home', separator: '>', showProductName: 'yes' },
  render: ShopProductBreadcrumb,
}
