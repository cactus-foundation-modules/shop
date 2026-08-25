import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Render } from '@puckeditor/core/rsc'
import { getTagBySlug, listTags } from '@/modules/shop/lib/db/catalogue'
import { listProducts, getProductMediaForProducts, getProductTagIdsForProducts } from '@/modules/shop/lib/db/products'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import { pageFromParams } from '@/modules/shop/lib/page-href'
import { getShopBreakpoints } from '@/modules/shop/lib/breakpoints'
import { getShopGate } from '@/modules/shop/lib/access'
import { ShopClosedNotice, ShopStaffPreviewBanner } from '@/modules/shop/components/public/ShopClosedNotice'
import { resolveCardFromPrices } from '@/modules/shop/lib/card-price'
import { resolveTaxDisplay } from '@/modules/shop/lib/tax-display'
import { resolveShopCardExtras } from '@/modules/shop/lib/card-media'
import { resolveCardTemplate, buildCardContext, buildTagMaps, renderCards, MinimalCard, type CardItem } from '@/modules/shop/lib/card-template'
import { shopCardCss } from '@/modules/shop/components/puck/parts/card-parts'
import { resolveShopCommerceMode } from '@/modules/shop/lib/commerce-mode'
import { resolveThemeLayout } from '@/lib/layout/resolveThemeLayout'
import { getModuleLayoutPuckRscConfig } from '@/lib/puck/config.rsc'
import { injectTagContext } from '@/modules/shop/lib/inject-tag-context'
import type { PuckData } from '@/modules/shop/lib/types'

// A tag's own page. Categories are the shelves and collections are the hand-
// picked groupings; a tag is the loose label that cuts across both, and until
// now it had nowhere to point at. Same card path as every other product surface,
// so the shop's one Product Card layout dresses these too.
//
// A published `shopTag` layout wins, exactly as on the category and collection
// pages: the blocks in it carry no tag of their own, so the current tag's slug
// is injected into them first (lib/inject-tag-context.ts). What follows below is
// the fallback for a shop that has published none.

async function visibleTag(slug: string) {
  const tag = await getTagBySlug(slug)
  // A tag kept off the storefront has no page - it is filing, not content.
  return tag && tag.storefrontVisible ? tag : null
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  if ((await getShopGate()).blocked) return {}
  const tag = await visibleTag(slug)
  if (!tag) return {}
  return {
    title: tag.metaTitle || tag.name,
    description: tag.metaDescription || tag.description || undefined,
  }
}

export default async function ShopTagPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  // Which page of the shelf was asked for. A grid block cannot read the
  // address it is served at, so the route reads it and writes it into the
  // block's props - the same journey categorySlug already makes.
  const page = pageFromParams(await searchParams)
  const { slug } = await params
  const gate = await getShopGate()
  if (gate.blocked) return <ShopClosedNotice message={gate.message} />

  const tag = await visibleTag(slug)
  if (!tag) notFound()

  const layout = await resolveThemeLayout('shopTag', { moduleName: 'shop', slug: tag.slug })
  if (layout?.builderData) {
    const data = injectTagContext(layout.builderData as PuckData, { tagSlug: tag.slug, page })
    return (
      <>
        {gate.staffPreview && <ShopStaffPreviewBanner />}
        <Render config={getModuleLayoutPuckRscConfig('shopTag') as any} data={data as any} />
      </>
    )
  }

  const config = await getShopConfigCached()
  const [{ products }, bp, tags, template] = await Promise.all([
    listProducts({ status: 'ACTIVE', perPage: 60, excludeHidden: true, storefront: true, tagSlug: tag.slug }),
    getShopBreakpoints(),
    listTags(),
    resolveCardTemplate(),
  ])
  const { tagById, tagsById } = buildTagMaps(tags)

  const productIds = products.map((p) => p.id)
  const [mediaByProduct, tagIdsByProduct, fromPrices, cardExtras, taxDisplay] = await Promise.all([
    getProductMediaForProducts(productIds),
    getProductTagIdsForProducts(productIds),
    resolveCardFromPrices(productIds),
    resolveShopCardExtras(productIds),
    resolveTaxDisplay(),
  ])
  // Resolved once for the whole page and handed to every card, so no two cards
  // can disagree about net/gross or about whether prices show at all.
  const pricing = { ...config, taxDisplay, commerce: await resolveShopCommerceMode() }
  const items: CardItem[] = products.map((p) => ({
    product: p,
    ctx: buildCardContext(p, mediaByProduct.get(p.id) ?? [], tagById, tagIdsByProduct.get(p.id) ?? [], config.currencySymbol, pricing, fromPrices.get(p.id) ?? null, cardExtras.get(p.id), tagsById),
  }))
  // The opening row loads eagerly, the rest of the shelf lazily. This page's
  // grid is always the top of the page, so page one's first row is the fold.
  const cards = template ? await renderCards(template, items, page === 1 ? 4 : 0) : items.map((i) => <MinimalCard key={i.product.id} {...i} />)

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '2rem 1.5rem' }}>
      {gate.staffPreview && <ShopStaffPreviewBanner />}
      <nav aria-label="Breadcrumb" style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', marginBottom: '0.75rem' }}>
        <Link href="/shop" style={{ color: 'inherit', textDecoration: 'none' }}>Shop</Link>
        <span style={{ margin: '0 0.4rem' }}>/</span>
        <span style={{ color: 'var(--color-text)' }}>{tag.name}</span>
      </nav>

      <h1 style={{ fontSize: '1.75rem' }}>{tag.name}</h1>
      {tag.description && <p style={{ color: 'var(--color-text-muted)' }}>{tag.description}</p>}

      <style dangerouslySetInnerHTML={{ __html: shopCardCss(bp) }} />
      <div className="shop-grid" style={{ ['--shop-cols' as string]: '3', marginTop: '1.5rem' } as React.CSSProperties}>
        {cards}
      </div>
      {products.length === 0 && (
        <p style={{ color: 'var(--color-text-muted)', marginTop: '1.5rem' }}>Nothing carries this label yet.</p>
      )}
    </div>
  )
}
