import { connection } from 'next/server'
import { getProductBySlug, getProductMedia, getProductTagIds } from '@/modules/shop/lib/db'
import { listTags } from '@/modules/shop/lib/db/catalogue'
import { resolveRelatedProducts } from '@/modules/shop/lib/db/recommendations'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import { getShopBreakpoints } from '@/modules/shop/lib/breakpoints'
import { resolveCardTemplate, buildCardContext, renderCards, MinimalCard, type CardItem } from '@/modules/shop/lib/card-template'
import { shopCardCss } from '@/modules/shop/components/puck/parts/card-parts'
import { shopRelatedProductsPuckComponent, type ShopRelatedProductsProps } from './ShopRelatedProducts'

// Server (RSC) half of Shop: Related Products. Kept out of the client editor
// bundle - see ShopRelatedProducts.tsx.

export async function ShopRelatedProductsRsc(props: ShopRelatedProductsProps) {
  await connection()
  if (!props.productSlug) return null
  const product = await getProductBySlug(props.productSlug)
  if (!product) return null
  const related = await resolveRelatedProducts(product)
  if (related.length === 0) return null

  const [config, bp, tags, template] = await Promise.all([
    getShopConfigCached(),
    getShopBreakpoints(),
    listTags(),
    resolveCardTemplate(),
  ])
  const tagById = new Map(tags.map((t) => [t.id, t.slug]))

  const items: CardItem[] = await Promise.all(
    related.map(async (p) => {
      const [media, tagIds] = await Promise.all([getProductMedia(p.id), getProductTagIds(p.id)])
      return { product: p, ctx: buildCardContext(p, media, tagById, tagIds, config.currencySymbol) }
    }),
  )

  const columns = Math.min(items.length, 4)
  const cards = template ? await renderCards(template, items) : items.map((item) => <MinimalCard key={item.product.id} {...item} />)

  return (
    <section>
      <style dangerouslySetInnerHTML={{ __html: shopCardCss(bp) }} />
      <div className="shop-sec-head">
        <h2>{props.heading || 'Completes the setup'}</h2>
        {props.subheading && <span>{props.subheading}</span>}
      </div>
      <div className="shop-grid" style={{ ['--shop-cols' as string]: String(columns) } as React.CSSProperties}>
        {cards}
      </div>
    </section>
  )
}

export const shopRelatedProductsPuckRscComponent = { ...shopRelatedProductsPuckComponent, render: ShopRelatedProductsRsc }
