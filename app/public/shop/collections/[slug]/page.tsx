import { notFound } from 'next/navigation'
import { Render } from '@puckeditor/core/rsc'
import { getCollectionBySlug, listTags } from '@/modules/shop/lib/db/catalogue'
import { listProducts, getProductMediaForProducts, getProductTagIds } from '@/modules/shop/lib/db/products'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import { getShopBreakpoints } from '@/modules/shop/lib/breakpoints'
import { getShopGate } from '@/modules/shop/lib/access'
import { ShopClosedNotice, ShopStaffPreviewBanner } from '@/modules/shop/components/public/ShopClosedNotice'
import { resolveThemeLayout } from '@/lib/layout/resolveThemeLayout'
import { getModuleLayoutPuckRscConfig } from '@/lib/puck/config.rsc'
import { injectCollectionContext } from '@/modules/shop/lib/inject-collection-context'
import { resolveCardFromPrices } from '@/modules/shop/lib/card-price'
import { resolveShopCardExtras } from '@/modules/shop/lib/card-media'
import { resolveCardTemplate, buildCardContext, renderCards, MinimalCard, type CardItem } from '@/modules/shop/lib/card-template'
import { shopCardCss } from '@/modules/shop/components/puck/parts/card-parts'
import type { PuckData } from '@/modules/shop/lib/types'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  if ((await getShopGate()).blocked) return {}
  const collection = await getCollectionBySlug(slug)
  if (!collection) return {}
  return { title: collection.metaTitle || collection.name, description: collection.metaDescription || collection.description || undefined }
}

export default async function ShopCollectionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const gate = await getShopGate()
  if (gate.blocked) return <ShopClosedNotice message={gate.message} />

  const collection = await getCollectionBySlug(slug)
  if (!collection) notFound()

  const layout = await resolveThemeLayout('shopCollection', { moduleName: 'shop', slug: collection.slug })
  if (layout?.builderData) {
    const data = injectCollectionContext(layout.builderData as PuckData, { collectionSlug: collection.slug })
    return (
      <>
        {gate.staffPreview && <ShopStaffPreviewBanner />}
        <Render config={getModuleLayoutPuckRscConfig('shopCollection') as any} data={data as any} />
      </>
    )
  }

  const [{ products }, config, bp, tags, template] = await Promise.all([
    listProducts({ status: 'ACTIVE', collectionSlug: slug, perPage: 60, excludeHidden: true }),
    getShopConfigCached(),
    getShopBreakpoints(),
    listTags(),
    resolveCardTemplate(),
  ])
  const tagById = new Map(tags.map((t) => [t.id, t.slug]))

  // Same card path as the Product Grid block, so this fallback page (shown when no
  // custom collection layout is published) stamps the one shared Product Card
  // template - image carousel, 3D badge, hover and all - rather than a separate
  // hand-rolled tile. Editing that single layout restyles every card surface.
  const productIds = products.map((p) => p.id)
  const [mediaByProduct, fromPrices, cardExtras] = await Promise.all([
    getProductMediaForProducts(productIds),
    resolveCardFromPrices(productIds),
    resolveShopCardExtras(productIds),
  ])
  const items: CardItem[] = await Promise.all(
    products.map(async (p) => {
      const tagIds = await getProductTagIds(p.id)
      return { product: p, ctx: buildCardContext(p, mediaByProduct.get(p.id) ?? [], tagById, tagIds, config.currencySymbol, config, fromPrices.get(p.id) ?? null, cardExtras.get(p.id)) }
    }),
  )
  const cards = template ? await renderCards(template, items) : items.map((i) => <MinimalCard key={i.product.id} {...i} />)

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '2rem 1.5rem' }}>
      {gate.staffPreview && <ShopStaffPreviewBanner />}
      <h1 style={{ fontSize: '1.75rem' }}>{collection.name}</h1>
      {collection.description && <p style={{ color: 'var(--color-text-muted)' }}>{collection.description}</p>}
      <style dangerouslySetInnerHTML={{ __html: shopCardCss(bp) }} />
      <div className="shop-grid" style={{ ['--shop-cols' as string]: '3', marginTop: '1.5rem' } as React.CSSProperties}>
        {cards}
      </div>
      {products.length === 0 && <p style={{ color: 'var(--color-text-muted)' }}>No products in this collection yet.</p>}
    </div>
  )
}
