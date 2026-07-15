import { connection } from 'next/server'
import { getCollectionBySlug, listProducts, getProductMedia, getProductTagIds } from '@/modules/shop/lib/db'
import { listTags } from '@/modules/shop/lib/db/catalogue'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import { getShopBreakpoints } from '@/modules/shop/lib/breakpoints'
import { resolveCardTemplate, buildCardContext, renderCards, MinimalCard, type CardItem } from '@/modules/shop/lib/card-template'
import { shopCardCss } from '@/modules/shop/components/puck/parts/card-parts'
import { shopFeaturedCollectionPuckComponent, type ShopFeaturedCollectionProps } from './ShopFeaturedCollection'

// Server (RSC) half of Shop: Featured Collection. Kept out of the client editor
// bundle - see ShopFeaturedCollection.tsx.

export async function ShopFeaturedCollectionRsc(props: ShopFeaturedCollectionProps) {
  await connection()
  if (!props.collectionSlug) return null
  const collection = await getCollectionBySlug(props.collectionSlug)
  if (!collection) return null

  const [config, bp, tags, listed, template] = await Promise.all([
    getShopConfigCached(),
    getShopBreakpoints(),
    listTags(),
    listProducts({ status: 'ACTIVE', collectionSlug: props.collectionSlug, perPage: props.limit ?? 4, excludeHidden: true }),
    resolveCardTemplate(),
  ])
  const { products } = listed
  if (products.length === 0) return null
  const tagById = new Map(tags.map((t) => [t.id, t.slug]))

  const items: CardItem[] = await Promise.all(
    products.map(async (p) => {
      const [media, tagIds] = await Promise.all([getProductMedia(p.id), getProductTagIds(p.id)])
      return { product: p, ctx: buildCardContext(p, media, tagById, tagIds, config.currencySymbol) }
    }),
  )

  const carousel = (props.layout ?? 'Grid') === 'Carousel'
  const columns = Math.min(products.length, 4)
  const cards = template ? await renderCards(template, items) : items.map((item) => <MinimalCard key={item.product.id} {...item} />)

  return (
    <section>
      <style dangerouslySetInnerHTML={{ __html: shopCardCss(bp) }} />
      <div className="shop-sec-head">
        <h2>{collection.name}</h2>
      </div>
      {carousel ? (
        <div className="shop-scroller">{cards}</div>
      ) : (
        <div className="shop-grid" style={{ ['--shop-cols' as string]: String(columns) } as React.CSSProperties}>
          {cards}
        </div>
      )}
    </section>
  )
}

export const shopFeaturedCollectionPuckRscComponent = { ...shopFeaturedCollectionPuckComponent, render: ShopFeaturedCollectionRsc }
