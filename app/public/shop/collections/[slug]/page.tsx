import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Render } from '@puckeditor/core/rsc'
import { getCollectionBySlug, listTags } from '@/modules/shop/lib/db/catalogue'
import { listProducts, getProductMediaForProducts, getProductTagIdsForProducts } from '@/modules/shop/lib/db/products'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import { getShopBreakpoints } from '@/modules/shop/lib/breakpoints'
import { getShopGate } from '@/modules/shop/lib/access'
import { ShopClosedNotice, ShopStaffPreviewBanner } from '@/modules/shop/components/public/ShopClosedNotice'
import { resolveThemeLayout } from '@/lib/layout/resolveThemeLayout'
import { getModuleLayoutPuckRscConfig } from '@/lib/puck/config.rsc'
import { injectCollectionContext } from '@/modules/shop/lib/inject-collection-context'
import { ShopCollectionDescriptionBody } from '@/modules/shop/components/public/ShopCollectionDescriptionBody'
import { resolveCardFromPrices } from '@/modules/shop/lib/card-price'
import { resolveTaxDisplay } from '@/modules/shop/lib/tax-display'
import { resolveShopCardExtras } from '@/modules/shop/lib/card-media'
import { resolveCardTemplate, buildCardContext, buildTagMaps, renderCards, MinimalCard, type CardItem } from '@/modules/shop/lib/card-template'
import { shopCardCss } from '@/modules/shop/components/puck/parts/card-parts'
import type { PuckData } from '@/modules/shop/lib/types'
import { resolveShopCommerceMode } from '@/modules/shop/lib/commerce-mode'
import { getSiteUrlOrNull } from '@/lib/config/env'
import { absoluteSocialImageUrl, resolveCollectionSocialImage } from '@/modules/shop/lib/catalogue-social-image'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  if ((await getShopGate()).blocked) return {}
  const collection = await getCollectionBySlug(slug)
  if (!collection) return {}
  const title = collection.metaTitle || collection.name
  const description = collection.metaDescription || collection.shortDescription || collection.description || undefined
  // Same social preview treatment as a category and a product page - see
  // lib/catalogue-social-image.ts for the order the picture is settled in.
  const siteUrl = getSiteUrlOrNull()
  const image = absoluteSocialImageUrl(await resolveCollectionSocialImage(collection), siteUrl)
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
      ...(siteUrl ? { url: `${siteUrl}/shop/collections/${collection.slug}` } : {}),
      ...(image ? { images: [{ url: image, alt: collection.name }] } : {}),
    },
    ...(image ? { twitter: { card: 'summary_large_image' as const } } : {}),
  }
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
    listProducts({ status: 'ACTIVE', collectionSlug: slug, perPage: 60, excludeHidden: true, storefront: true }),
    getShopConfigCached(),
    getShopBreakpoints(),
    listTags(),
    resolveCardTemplate(),
  ])
  const { tagById, tagsById } = buildTagMaps(tags)

  // Same card path as the Product Grid block, so this fallback page (shown when no
  // custom collection layout is published) stamps the one shared Product Card
  // template - image carousel, 3D badge, hover and all - rather than a separate
  // hand-rolled tile. Editing that single layout restyles every card surface.
  const productIds = products.map((p) => p.id)
  const [mediaByProduct, tagIdsByProduct, fromPrices, cardExtras, taxDisplay] = await Promise.all([
    getProductMediaForProducts(productIds),
    getProductTagIdsForProducts(productIds),
    resolveCardFromPrices(productIds),
    resolveShopCardExtras(productIds),
    resolveTaxDisplay(),
  ])
  // What the shop prints prices as (net or gross) is a per-shop answer, not a
  // per-card one, so it is resolved once here and handed to every card.
  // Whether prices may be shown at all is a per-shop answer too - a quote-only
  // shop withholds every figure on every card, not some of them. Cached, so this
  // costs nothing per surface. See lib/commerce-mode.ts.
  const pricing = { ...config, taxDisplay, commerce: await resolveShopCommerceMode() }
  const items: CardItem[] = products.map((p) => ({
    product: p,
    ctx: buildCardContext(p, mediaByProduct.get(p.id) ?? [], tagById, tagIdsByProduct.get(p.id) ?? [], config.currencySymbol, pricing, fromPrices.get(p.id) ?? null, cardExtras.get(p.id), tagsById),
  }))
  const cards = template ? await renderCards(template, items) : items.map((i) => <MinimalCard key={i.product.id} {...i} />)

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '2rem 1.5rem' }}>
      {gate.staffPreview && <ShopStaffPreviewBanner />}
      <h1 style={{ fontSize: '1.75rem' }}>{collection.name}</h1>
      {/* Only the short blurb sits with the heading, exactly as on a category
          page. The long description - designed or plain - gets its own block
          below, so whichever form it takes it never gets printed twice. */}
      {collection.shortDescription && (
        // Where the description block's "Read more" goes to live - see
        // ShopCategoryDescriptionFold.
        <p data-shop-blurb="" style={{ color: 'var(--color-text-muted)' }}>{collection.shortDescription}</p>
      )}

      <ShopCollectionDescriptionBody
        collection={collection}
        style={{ marginTop: '1.5rem' }}
      />

      <style dangerouslySetInnerHTML={{ __html: shopCardCss(bp) }} />
      <div className="shop-grid" style={{ ['--shop-cols' as string]: '3', marginTop: '1.5rem' } as React.CSSProperties}>
        {cards}
      </div>
      {products.length === 0 && <p style={{ color: 'var(--color-text-muted)' }}>No products in this collection yet.</p>}
    </div>
  )
}
