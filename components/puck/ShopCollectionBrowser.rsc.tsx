import { connection } from 'next/server'
import { listCollectionsForIndex } from '@/modules/shop/lib/db/catalogue'
import { getShopBreakpoints } from '@/modules/shop/lib/breakpoints'
import { shopCategoryPillsCss } from '@/modules/shop/components/public/ShopCategoryPills.shared'
import { ShopCollectionCards } from '@/modules/shop/components/public/ShopCollectionCards'
import { shopCollectionBrowserPuckComponent, type ShopCollectionBrowserProps } from './ShopCollectionBrowser'

// Server (RSC) half of Shop: Collection Browser. Kept out of the client editor
// bundle - see ShopCollectionBrowser.tsx.
//
// Reads the collection list on every render, so a collection created this
// morning is on the index this morning. Collections with nothing in them are
// dropped by the query, which is what stops a half-built one appearing.

export async function ShopCollectionBrowserRsc(props: ShopCollectionBrowserProps) {
  await connection()
  const columns = props.columns ?? 4
  const [all, breakpoints] = await Promise.all([listCollectionsForIndex(), getShopBreakpoints()])
  const limit = typeof props.limit === 'number' && props.limit > 0 ? props.limit : undefined
  const collections = limit ? all.slice(0, limit) : all

  if (collections.length === 0) return null

  if (props.display === 'pills') {
    return (
      <>
        <style dangerouslySetInnerHTML={{ __html: shopCategoryPillsCss }} />
        <nav className="shop-cat-pills" aria-label="Collections">
          {collections.map((c) => (
            <a key={c.id} className="shop-cat-pill" href={`/shop/collections/${c.slug}`}>{c.name}</a>
          ))}
        </nav>
      </>
    )
  }

  return (
    <ShopCollectionCards
      collections={collections}
      columns={columns}
      breakpoints={breakpoints}
      ctaLabel={props.ctaLabel || 'Browse'}
      showBlurb={props.showBlurb !== 'no'}
      showCount={props.showCount !== 'no'}
    />
  )
}

export const shopCollectionBrowserPuckRscComponent = { ...shopCollectionBrowserPuckComponent, render: ShopCollectionBrowserRsc }
