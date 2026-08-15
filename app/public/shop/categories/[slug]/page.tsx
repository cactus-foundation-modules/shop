import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Render } from '@puckeditor/core/rsc'
import { getCategoryBySlug, getCategoryAncestorPath, listCategories, resolveCategoryProductFilter, listTags } from '@/modules/shop/lib/db/catalogue'
import { listProducts, getProductMediaForProducts, getProductTagIds, HARD_MAX_PER_PAGE } from '@/modules/shop/lib/db/products'
import { ShopGridPager } from '@/modules/shop/components/public/ShopGridPager'

// What the un-designed category page shows at once. 60 is what it used to cap
// the whole list at, so a category that used to fit still looks untouched - it
// simply gains pages when it would previously have lost products.
const CATEGORY_PAGE_SIZE = 60
import { getShopConfigCached } from '@/modules/shop/lib/config'
import { getShopBreakpoints } from '@/modules/shop/lib/breakpoints'
import { getShopGate } from '@/modules/shop/lib/access'
import { ShopClosedNotice, ShopStaffPreviewBanner } from '@/modules/shop/components/public/ShopClosedNotice'
import { resolveThemeLayout } from '@/lib/layout/resolveThemeLayout'
import { getModuleLayoutPuckRscConfig } from '@/lib/puck/config.rsc'
import { injectCategoryContext } from '@/modules/shop/lib/inject-category-context'
import { resolveCardFromPrices } from '@/modules/shop/lib/card-price'
import { resolveTaxDisplay } from '@/modules/shop/lib/tax-display'
import { resolveShopCardExtras } from '@/modules/shop/lib/card-media'
import { resolveCardTemplate, buildCardContext, buildTagMaps, renderCards, MinimalCard, type CardItem } from '@/modules/shop/lib/card-template'
import { shopCardCss } from '@/modules/shop/components/puck/parts/card-parts'
import { ShopCategoryCards } from '@/modules/shop/components/public/ShopCategoryCards'
import { ShopCategoryDescriptionBody } from '@/modules/shop/components/public/ShopCategoryDescriptionBody'
import type { PuckData } from '@/modules/shop/lib/types'
import { resolveShopCommerceMode } from '@/modules/shop/lib/commerce-mode'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  if ((await getShopGate()).blocked) return {}
  const category = await getCategoryBySlug(slug)
  if (!category) return {}
  // The short blurb before the long one: a meta description is a one-liner, and
  // the long description may now be a builder document with no plain text at all.
  return {
    title: category.metaTitle || category.name,
    description: category.metaDescription || category.shortDescription || category.description || undefined,
  }
}

export default async function ShopCategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const gate = await getShopGate()
  if (gate.blocked) return <ShopClosedNotice message={gate.message} />

  const category = await getCategoryBySlug(slug)
  if (!category) notFound()

  const layout = await resolveThemeLayout('shopCategory', { moduleName: 'shop', slug: category.slug })
  if (layout?.builderData) {
    const data = injectCategoryContext(layout.builderData as PuckData, { categorySlug: category.slug })
    return (
      <>
        {gate.staffPreview && <ShopStaffPreviewBanner />}
        <Render config={getModuleLayoutPuckRscConfig('shopCategory') as any} data={data as any} />
      </>
    )
  }

  const config = await getShopConfigCached()
  const [{ products }, ancestors, allCategories, bp, tags, template] = await Promise.all([
    listProducts({
      status: 'ACTIVE',
      // The whole category, not the first 60 of it. This page had no pager, so
      // the old cap was a silent truncation: a rolled-up parent category with
      // 217 products showed 60 and offered no route to the rest. Paged below.
      perPage: HARD_MAX_PER_PAGE,
      maxPerPage: HARD_MAX_PER_PAGE,
      excludeHidden: true,
      storefront: true,
      ...(await resolveCategoryProductFilter(slug, config.categoryProductDisplayMode)),
    }),
    getCategoryAncestorPath(category.id),
    listCategories(),
    getShopBreakpoints(),
    listTags(),
    resolveCardTemplate(),
  ])
  // Ancestors include the category itself; the trail before it is the crumbs.
  const crumbs = ancestors.filter((a) => a.id !== category.id)
  const children = allCategories.filter((c) => c.parentId === category.id)
  const { tagById, tagsById } = buildTagMaps(tags)

  // Same card path as the Product Grid block, so this fallback page (shown when no
  // custom category layout is published) stamps the one shared Product Card
  // template - image carousel, 3D badge, hover and all - rather than a separate
  // hand-rolled tile. Editing that single layout restyles every card surface.
  const productIds = products.map((p) => p.id)
  const [mediaByProduct, fromPrices, cardExtras, taxDisplay] = await Promise.all([
    getProductMediaForProducts(productIds),
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
  const items: CardItem[] = await Promise.all(
    products.map(async (p) => {
      const tagIds = await getProductTagIds(p.id)
      return { product: p, ctx: buildCardContext(p, mediaByProduct.get(p.id) ?? [], tagById, tagIds, config.currencySymbol, pricing, fromPrices.get(p.id) ?? null, cardExtras.get(p.id), tagsById) }
    }),
  )
  const cards = template ? await renderCards(template, items) : items.map((i) => <MinimalCard key={i.product.id} {...i} />)

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '2rem 1.5rem' }}>
      {gate.staffPreview && <ShopStaffPreviewBanner />}
      <nav aria-label="Breadcrumb" style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', marginBottom: '0.75rem' }}>
        <Link href="/shop" style={{ color: 'inherit', textDecoration: 'none' }}>Shop</Link>
        {crumbs.map((a) => (
          <span key={a.id}>
            <span style={{ margin: '0 0.4rem' }}>/</span>
            <Link href={`/shop/categories/${a.slug}`} style={{ color: 'inherit', textDecoration: 'none' }}>{a.name}</Link>
          </span>
        ))}
        <span style={{ margin: '0 0.4rem' }}>/</span>
        <span style={{ color: 'var(--color-text)' }}>{category.name}</span>
      </nav>

      <h1 style={{ fontSize: '1.75rem' }}>{category.name}</h1>
      {/* Only the short blurb sits with the heading. The long description -
          designed or plain - gets its own block below the sub-categories, so
          whichever form it takes it never gets printed twice. */}
      {category.shortDescription && (
        <p style={{ color: 'var(--color-text-muted)' }}>{category.shortDescription}</p>
      )}

      {/* Sub-categories first, as cards. A parent category rolling every
          descendant's products up into one list buries the structure the shop
          owner built; leading with the sub-categories puts it back. */}
      {children.length > 0 && (
        <div style={{ marginTop: '1.5rem' }}>
          <ShopCategoryCards categories={children} columns={3} breakpoints={bp} />
        </div>
      )}

      <ShopCategoryDescriptionBody
        category={category}
        style={{ marginTop: '1.5rem' }}
      />

      <style dangerouslySetInnerHTML={{ __html: shopCardCss(bp) }} />
      <ShopGridPager
        cards={cards}
        perPage={CATEGORY_PAGE_SIZE}
        mode="pages"
        gridClassName="shop-grid"
        gridStyle={{ ['--shop-cols' as string]: '3', marginTop: '1.5rem' } as React.CSSProperties}
        countTemplate="Showing {shown} of {total}"
      />
      {products.length === 0 && (
        <p style={{ color: 'var(--color-text-muted)', marginTop: '1.5rem' }}>
          {children.length > 0 ? 'Pick a sub-category above to see its products.' : 'No products in this category yet.'}
        </p>
      )}
    </div>
  )
}
