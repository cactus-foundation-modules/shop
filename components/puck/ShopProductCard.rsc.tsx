import { connection } from 'next/server'
import { getProductBySlug, getProductMedia, getProductTagIds } from '@/modules/shop/lib/db'
import { listTags } from '@/modules/shop/lib/db/catalogue'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import { getShopBreakpoints } from '@/modules/shop/lib/breakpoints'
import { resolveCardTemplate, buildCardContext, renderCards, MinimalCard } from '@/modules/shop/lib/card-template'
import { resolveCardFromPrices } from '@/modules/shop/lib/card-price'
import { resolveTaxDisplay } from '@/modules/shop/lib/tax-display'
import { resolveShopCardExtras } from '@/modules/shop/lib/card-media'
import { shopCardCss } from '@/modules/shop/components/puck/parts/card-parts'
import { shopProductCardPuckComponent, type ShopProductCardProps } from './ShopProductCard'
import { resolveShopCommerceMode } from '@/modules/shop/lib/commerce-mode'

// Server (RSC) half of Shop: Single Product. Kept out of the client editor
// bundle - see ShopProductCard.tsx.

export async function ShopProductCardRsc(props: ShopProductCardProps) {
  await connection()
  if (!props.productSlug) return null
  const product = await getProductBySlug(props.productSlug)
  if (!product || product.status !== 'ACTIVE') return null

  const [media, tagIds, config, bp, tags, template] = await Promise.all([
    getProductMedia(product.id),
    getProductTagIds(product.id),
    getShopConfigCached(),
    getShopBreakpoints(),
    listTags(),
    resolveCardTemplate(props.layoutRef),
  ])
  const tagById = new Map(tags.map((t) => [t.id, t.slug]))
  const [fromPrices, cardExtras, taxDisplay] = await Promise.all([
    resolveCardFromPrices([product.id]),
    resolveShopCardExtras([product.id]),
    resolveTaxDisplay(),
  ])
  // What the shop prints prices as (net or gross) is a per-shop answer, not a
  // per-card one, so it is resolved once here and handed to every card.
  // Whether prices may be shown at all is a per-shop answer too - a quote-only
  // shop withholds every figure on every card, not some of them. Cached, so this
  // costs nothing per surface. See lib/commerce-mode.ts.
  const pricing = { ...config, taxDisplay, commerce: await resolveShopCommerceMode() }
  const item = { product, ctx: buildCardContext(product, media, tagById, tagIds, config.currencySymbol, pricing, fromPrices.get(product.id) ?? null, cardExtras.get(product.id)) }
  const cards = template ? await renderCards(template, [item]) : [<MinimalCard key={product.id} {...item} />]

  return (
    <div style={{ maxWidth: 280 }}>
      <style dangerouslySetInnerHTML={{ __html: shopCardCss(bp) }} />
      {cards}
    </div>
  )
}

export const shopProductCardPuckRscComponent = { ...shopProductCardPuckComponent, render: ShopProductCardRsc }
