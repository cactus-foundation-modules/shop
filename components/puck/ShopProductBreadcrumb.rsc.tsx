import { connection } from 'next/server'
import { getProductBySlugCached, getPrimaryCategoryId } from '@/modules/shop/lib/db'
import { getCategoryAncestorPath } from '@/modules/shop/lib/db/catalogue'
import { ProductBreadcrumbTrail, type ProductCrumb } from '@/modules/shop/components/puck/parts/product-breadcrumb'
import { shopProductBreadcrumbPuckComponent, type ShopProductBreadcrumbProps } from './ShopProductBreadcrumb'

// Server (RSC) half of Shop: Product Breadcrumb. Kept out of the client editor
// bundle - see ShopProductBreadcrumb.tsx.
//
// Which category: the Lead category when the owner has set one, otherwise the
// first the product is filed under (getPrimaryCategoryId does exactly that, and
// is what recommendations key off too). Ultimate SEO's breadcrumb data makes the
// same choice, so the trail a visitor sees and the one Google reads agree.
//
// Category steps link to /shop/categories/<slug>, the address every other shop
// link and the menu use. A product filed nowhere still gets Home > product.
export async function ShopProductBreadcrumbRsc(props: ShopProductBreadcrumbProps) {
  await connection()
  if (!props.productSlug) return null
  const product = await getProductBySlugCached(props.productSlug)
  if (!product) return null

  const categoryId = product.masterCategoryId ?? (await getPrimaryCategoryId(product.id))
  const trail = categoryId ? await getCategoryAncestorPath(categoryId) : []

  const crumbs: ProductCrumb[] = [
    { label: props.homeLabel || 'Home', href: '/' },
    ...trail.map((c) => ({ label: c.name, href: `/shop/categories/${c.slug}` })),
  ]
  if (props.showProductName !== 'no') crumbs.push({ label: product.name })
  // Home on its own says nothing; leave the space empty instead.
  if (crumbs.length < 2) return null
  return <ProductBreadcrumbTrail crumbs={crumbs} separator={props.separator} />
}

export const shopProductBreadcrumbPuckRscComponent = { ...shopProductBreadcrumbPuckComponent, render: ShopProductBreadcrumbRsc }
