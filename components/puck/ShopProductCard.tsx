import { connection } from 'next/server'
import { getProductBySlug, getProductMedia, getProductTagIds } from '@/modules/shop/lib/db'
import { listTags } from '@/modules/shop/lib/db/catalogue'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import { getShopBreakpoints } from '@/modules/shop/lib/breakpoints'
import type { LayoutRef } from '@/lib/puck/LayoutPickerField'
import { ShopLayoutPicker } from '@/modules/shop/components/public/ShopLayoutPicker'
import { resolveCardTemplate, buildCardContext, renderCards, MinimalCard } from '@/modules/shop/lib/card-template'
import { shopCardCss } from '@/modules/shop/components/puck/parts/card-parts'

export type ShopProductCardProps = { productSlug?: string; layoutRef?: LayoutRef | null }

export function ShopProductCard(_props: ShopProductCardProps) {
  return (
    <div style={{ border: '1px solid var(--color-border)', borderRadius: 12, overflow: 'hidden', opacity: 0.6, maxWidth: 280 }}>
      <div style={{ aspectRatio: '4/3', background: 'var(--color-bg-subtle)' }} />
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ height: 14, width: '70%', background: 'var(--color-border)', borderRadius: 4 }} />
        <div style={{ height: 14, width: '35%', background: 'var(--color-border)', borderRadius: 4 }} />
      </div>
    </div>
  )
}

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
  const item = { product, ctx: buildCardContext(product, media, tagById, tagIds, config.currencySymbol) }
  const cards = template ? await renderCards(template, [item]) : [<MinimalCard key={product.id} {...item} />]

  return (
    <div style={{ maxWidth: 280 }}>
      <style dangerouslySetInnerHTML={{ __html: shopCardCss(bp) }} />
      {cards}
    </div>
  )
}

const layoutField = {
  type: 'custom' as const,
  label: 'Card layout',
  render: ({ value, onChange }: any) => <ShopLayoutPicker type="shopProductCard" value={value} onChange={onChange} />,
}

export const shopProductCardPuckComponent = {
  label: 'Shop: Single Product',
  fields: {
    productSlug: { type: 'text' as const, label: 'Product slug' },
    layoutRef: layoutField,
  },
  defaultProps: { productSlug: '', layoutRef: null },
  render: ShopProductCard,
}

export const shopProductCardPuckRscComponent = { ...shopProductCardPuckComponent, render: ShopProductCardRsc }
