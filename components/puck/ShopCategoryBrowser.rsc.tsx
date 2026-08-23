import { connection } from 'next/server'
import { listCategories, getPublicCategoryProductCounts } from '@/modules/shop/lib/db'
import { getShopBreakpoints } from '@/modules/shop/lib/breakpoints'
import { ShopCategoryCards } from '@/modules/shop/components/public/ShopCategoryCards'
import { ShopCategoryPills } from '@/modules/shop/components/public/ShopCategoryPills'
import { rollUpProductCounts } from '@/modules/shop/components/public/ShopCategoryPills.shared'
import { shopCategoryBrowserPuckComponent, type ShopCategoryBrowserProps } from './ShopCategoryBrowser'

// Server (RSC) half of Shop: Category Browser. Kept out of the client editor
// bundle - see ShopCategoryBrowser.tsx.
//
// The tiles are the shared category cards (components/public/ShopCategoryCards),
// so they carry each category's picture and short description and sit alongside
// the product cards without looking like a different site.

export async function ShopCategoryBrowserRsc(props: ShopCategoryBrowserProps) {
  await connection()
  const columns = props.columns ?? 4
  const [all, breakpoints] = await Promise.all([listCategories(), getShopBreakpoints()])
  const parent = props.parentCategorySlug ? all.find((c) => c.slug === props.parentCategorySlug) : null
  const categories = props.parentCategorySlug
    ? all.filter((c) => c.parentId === (parent?.id ?? '__none__'))
    : all.filter((c) => !c.parentId)

  if (categories.length === 0) return null

  // The compact strip for pages where the sub-categories are shortcuts, not
  // the main event - a filtered category page keeps its height for products.
  if (props.display === 'pills') {
    // Counts are only read when the strip is actually capped: an uncapped strip
    // prints in the shop's own order and has nothing to rank, so a page that
    // never asked for the fold never pays for the extra query.
    const limit = Math.max(0, Math.floor(Number(props.pillLimit)) || 0)
    const counts = limit > 0 && limit < categories.length
      ? rollUpProductCounts(all, await getPublicCategoryProductCounts())
      : {}
    return <ShopCategoryPills categories={categories} breakpoints={breakpoints} counts={counts} limit={limit} />
  }

  return (
    <ShopCategoryCards
      categories={categories}
      columns={columns}
      breakpoints={breakpoints}
      ctaLabel={props.ctaLabel || 'Browse'}
      showBlurb={props.showBlurb !== 'no'}
    />
  )
}

export const shopCategoryBrowserPuckRscComponent = { ...shopCategoryBrowserPuckComponent, render: ShopCategoryBrowserRsc }
