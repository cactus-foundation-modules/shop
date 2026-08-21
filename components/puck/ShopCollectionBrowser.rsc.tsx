import { connection } from 'next/server'
import { listCollectionsForIndex } from '@/modules/shop/lib/db/catalogue'
import { getShopBreakpoints } from '@/modules/shop/lib/breakpoints'
import { shopCategoryPillsCss } from '@/modules/shop/components/public/ShopCategoryPills.shared'
import { ShopCollectionCards, type ShopCollectionCardItem } from '@/modules/shop/components/public/ShopCollectionCards'
import { collectionIndexSourceProp, resolveCollectionIndexSources } from '@/modules/shop/lib/collection-index-sources'
import { shopCollectionBrowserPuckComponent, type ShopCollectionBrowserProps } from './ShopCollectionBrowser'

// Server (RSC) half of Shop: Collection Browser. Kept out of the client editor
// bundle - see ShopCollectionBrowser.tsx.
//
// Reads the collection list on every render, so a collection created this
// morning is on the index this morning. Collections with nothing in them are
// dropped by the query, which is what stops a half-built one appearing.
//
// A companion module can add pages of its own to the same list through the
// `shop.collection-index-sources` point, switched on per block. Each source is
// asked only when its own field says yes, so the page costs nothing extra on an
// index that lists the shop's collections and nothing else.

async function extraItems(props: ShopCollectionBrowserProps): Promise<ShopCollectionCardItem[]> {
  const sources = await resolveCollectionIndexSources()
  const wanted = sources.filter((s) => props[collectionIndexSourceProp(s.id)] === 'yes')
  if (wanted.length === 0) return []
  const lists = await Promise.all(wanted.map(async (s) => {
    // One source failing is not a reason for the whole index to 500 - the shop's
    // own collections are the part that must always print.
    try {
      return await s.source.list()
    } catch {
      return []
    }
  }))
  return lists.flat().map((item) => ({
    id: item.id,
    name: item.name,
    // Only ever read through `href` below, but the card type carries a slug for
    // shop's own rows; the href wins whenever it is set.
    slug: item.id,
    description: item.description,
    productCount: item.productCount,
    coverUrl: item.coverUrl,
    href: item.href,
  }))
}

export async function ShopCollectionBrowserRsc(props: ShopCollectionBrowserProps) {
  await connection()
  const columns = props.columns ?? 4
  const [own, breakpoints, extra] = await Promise.all([
    listCollectionsForIndex(),
    getShopBreakpoints(),
    extraItems(props),
  ])
  const all: ShopCollectionCardItem[] = [...own, ...extra]
  const limit = typeof props.limit === 'number' && props.limit > 0 ? props.limit : undefined
  const collections = limit ? all.slice(0, limit) : all

  if (collections.length === 0) return null

  if (props.display === 'pills') {
    return (
      <>
        <style dangerouslySetInnerHTML={{ __html: shopCategoryPillsCss(breakpoints) }} />
        <nav className="shop-cat-pills" aria-label="Collections">
          {collections.map((c) => (
            <a key={c.id} className="shop-cat-pill" href={c.href ?? `/shop/collections/${c.slug}`}>{c.name}</a>
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
