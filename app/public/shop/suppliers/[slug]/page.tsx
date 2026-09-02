import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Render } from '@puckeditor/core/rsc'
import { getSupplierBySlug } from '@/modules/shop/lib/db/suppliers'
import { listProducts, getProductMediaForProducts, getProductTagIdsForProducts } from '@/modules/shop/lib/db/products'
import { listTags } from '@/modules/shop/lib/db/catalogue'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import { pageFromParams } from '@/modules/shop/lib/page-href'
import { getShopBreakpoints } from '@/modules/shop/lib/breakpoints'
import { getShopGate } from '@/modules/shop/lib/access'
import { ShopClosedNotice, ShopStaffPreviewBanner } from '@/modules/shop/components/public/ShopClosedNotice'
import { ShopSupplierDescriptionBody } from '@/modules/shop/components/public/ShopSupplierDescriptionBody'
import { resolveCardFromPrices } from '@/modules/shop/lib/card-price'
import { resolveTaxDisplay } from '@/modules/shop/lib/tax-display'
import { resolveShopCardExtras } from '@/modules/shop/lib/card-media'
import { resolveCardTemplate, buildCardContext, buildTagMaps, renderCards, MinimalCard, type CardItem } from '@/modules/shop/lib/card-template'
import { shopCardCss } from '@/modules/shop/components/puck/parts/card-parts'
import { resolveShopCommerceMode } from '@/modules/shop/lib/commerce-mode'
import { resolveThemeLayout } from '@/lib/layout/resolveThemeLayout'
import { getModuleLayoutPuckRscConfig } from '@/lib/puck/config.rsc'
import { injectSupplierContext } from '@/modules/shop/lib/inject-supplier-context'
import type { PuckData } from '@/modules/shop/lib/types'

// A supplier's own page: everything the shop buys from one supplier, under their
// name and their write-up. Categories are the shelves, collections are the
// hand-picked groupings, tags are the loose labels that cut across both - and
// this is the fourth axis a catalogue is actually browsed along, "who makes it".
// Same card path as every other product surface, so the shop's one Product Card
// layout dresses these too.
//
// A published `shopSupplier` layout wins, exactly as on the category, collection
// and tag pages: the blocks in it carry no supplier of their own, so the current
// supplier's slug is injected into them first (lib/inject-supplier-context.ts).
// What follows below is the fallback for a shop that has published none.

async function visibleSupplier(slug: string) {
  const config = await getShopConfigCached()
  // Two switches, both of which have to be on. The shop-wide one says supplier
  // pages exist at all; the supplier's own says this one is published. Neither
  // implies the other: a shop can run supplier pages and still keep half its
  // suppliers as filing.
  if (!config.supplierFieldEnabled || !config.supplierPagesEnabled) return null
  const supplier = await getSupplierBySlug(slug)
  return supplier && supplier.storefrontVisible ? supplier : null
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  if ((await getShopGate()).blocked) return {}
  const supplier = await visibleSupplier(slug)
  if (!supplier) return {}
  return {
    title: supplier.metaTitle || supplier.name,
    description: supplier.metaDescription || supplier.shortDescription || undefined,
  }
}

export default async function ShopSupplierPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  // Which page of the shelf was asked for. A grid block cannot read the address
  // it is served at, so the route reads it and writes it into the block's props
  // - the same journey categorySlug already makes.
  const page = pageFromParams(await searchParams)
  const { slug } = await params
  const gate = await getShopGate()
  if (gate.blocked) return <ShopClosedNotice message={gate.message} />

  const supplier = await visibleSupplier(slug)
  if (!supplier) notFound()

  const layout = await resolveThemeLayout('shopSupplier', { moduleName: 'shop', slug: supplier.slug ?? slug })
  if (layout?.builderData) {
    const data = injectSupplierContext(layout.builderData as PuckData, { supplierSlug: supplier.slug ?? slug, page })
    return (
      <>
        {gate.staffPreview && <ShopStaffPreviewBanner />}
        <Render config={getModuleLayoutPuckRscConfig('shopSupplier') as any} data={data as any} />
      </>
    )
  }

  const config = await getShopConfigCached()
  const [{ products }, bp, tags, template] = await Promise.all([
    listProducts({ status: 'ACTIVE', perPage: 60, excludeHidden: true, storefront: true, supplierSlug: supplier.slug ?? slug }),
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
  // The opening row loads eagerly, the rest of the shelf lazily. This page's grid
  // sits under a write-up rather than at the very top, but page one's first row is
  // still the nearest thing to the fold.
  const cards = template ? await renderCards(template, items, page === 1 ? 4 : 0) : items.map((i) => <MinimalCard key={i.product.id} {...i} />)

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '2rem 1.5rem' }}>
      {gate.staffPreview && <ShopStaffPreviewBanner />}
      <nav aria-label="Breadcrumb" style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', marginBottom: '0.75rem' }}>
        <Link href="/shop" style={{ color: 'inherit', textDecoration: 'none' }}>Shop</Link>
        <span style={{ margin: '0 0.4rem' }}>/</span>
        <span style={{ color: 'var(--color-text)' }}>{supplier.name}</span>
      </nav>

      <h1 style={{ fontSize: '1.75rem' }}>{supplier.name}</h1>
      {supplier.shortDescription && <p style={{ color: 'var(--color-text-muted)' }}>{supplier.shortDescription}</p>}
      <ShopSupplierDescriptionBody supplier={supplier} />

      <style dangerouslySetInnerHTML={{ __html: shopCardCss(bp) }} />
      <div className="shop-grid" style={{ ['--shop-cols' as string]: '3', marginTop: '1.5rem' } as React.CSSProperties}>
        {cards}
      </div>
      {products.length === 0 && (
        <p style={{ color: 'var(--color-text-muted)', marginTop: '1.5rem' }}>Nothing from this supplier is on sale at the moment.</p>
      )}
    </div>
  )
}
