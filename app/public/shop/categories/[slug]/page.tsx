import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Render } from '@puckeditor/core/rsc'
import { getCategoryBySlug, getCategoryAncestorPath, listCategories, resolveCategoryProductFilter } from '@/modules/shop/lib/db/catalogue'
import { listProducts, getProductMediaForProducts } from '@/modules/shop/lib/db/products'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import { getShopGate } from '@/modules/shop/lib/access'
import { ShopClosedNotice, ShopStaffPreviewBanner } from '@/modules/shop/components/public/ShopClosedNotice'
import { resolveThemeLayout } from '@/lib/layout/resolveThemeLayout'
import { getModuleLayoutPuckRscConfig } from '@/lib/puck/config.rsc'
import { injectCategoryContext } from '@/modules/shop/lib/inject-category-context'
import { resolveCardFromPrices } from '@/modules/shop/lib/card-price'
import { resolveShopCardExtras } from '@/modules/shop/lib/card-media'
import { buildCardContext } from '@/modules/shop/lib/card-template'
import { ShopCardMedia } from '@/modules/shop/components/public/ShopCardMedia'
import { shopCardMediaCss } from '@/modules/shop/components/puck/parts/card-parts'
import type { PuckData } from '@/modules/shop/lib/types'
import { formatMoney } from '@/modules/shop/lib/money'
import { effectivePrice } from '@/modules/shop/lib/pricing'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  if ((await getShopGate()).blocked) return {}
  const category = await getCategoryBySlug(slug)
  if (!category) return {}
  return { title: category.metaTitle || category.name, description: category.metaDescription || category.description || undefined }
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
  const [{ products }, ancestors, allCategories] = await Promise.all([
    listProducts({
      status: 'ACTIVE',
      perPage: 60,
      excludeHidden: true,
      ...(await resolveCategoryProductFilter(slug, config.categoryProductDisplayMode)),
    }),
    getCategoryAncestorPath(category.id),
    listCategories(),
  ])
  // Ancestors include the category itself; the trail before it is the crumbs.
  const crumbs = ancestors.filter((a) => a.id !== category.id)
  const children = allCategories.filter((c) => c.parentId === category.id)

  const productIds = products.map((p) => p.id)
  const [mediaByProduct, fromPrices, cardExtras] = await Promise.all([
    getProductMediaForProducts(productIds),
    resolveCardFromPrices(productIds),
    resolveShopCardExtras(productIds),
  ])

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
      {category.description && <p style={{ color: 'var(--color-text-muted)' }}>{category.description}</p>}

      {children.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '1rem' }}>
          {children.map((c) => (
            <a
              key={c.id}
              href={`/shop/categories/${c.slug}`}
              style={{ textDecoration: 'none', color: 'inherit', border: '1px solid var(--color-border)', borderRadius: 999, padding: '0.375rem 0.875rem', fontSize: '0.875rem' }}
            >
              {c.name}
            </a>
          ))}
        </div>
      )}

      <style dangerouslySetInnerHTML={{ __html: shopCardMediaCss }} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginTop: '1.5rem' }}>
        {products.map((p) => {
          const media = mediaByProduct.get(p.id) ?? []
          const primary = media.find((m) => m.isPrimary) ?? media[0]
          const image = primary && primary.type !== 'VIDEO_URL' ? primary : null
          const fromPrice = fromPrices.get(p.id)
          // The original tile, unchanged - only the picture gains the photo carousel
          // and the 3D badge. It is a <div> with a stretched link (not an <a> around
          // everything) so the arrows and 3D control can be real buttons above the
          // link rather than interactive content nested in an anchor.
          const ctx = buildCardContext(p, media, new Map(), [], config.currencySymbol, config, fromPrice ?? null, cardExtras.get(p.id))
          const interactive = ctx.images.length > 1 || ctx.overlays.length > 0
          return (
            <div key={p.id} style={{ position: 'relative', color: 'inherit', border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden' }}>
              <a href={`/shop/products/${p.slug}`} aria-label={p.name} style={{ position: 'absolute', inset: 0, zIndex: 1 }} />
              <div style={{ position: 'relative', aspectRatio: '1/1', background: 'var(--color-surface-muted)', overflow: 'hidden' }}>
                {interactive ? (
                  <ShopCardMedia images={ctx.images} overlays={ctx.overlays} productId={p.id} />
                ) : (
                  image && (
                    // eslint-disable-next-line @next/next/no-img-element -- media library URLs are arbitrary remote hosts, not a configured next/image loader
                    <img src={image.url} alt={image.altText ?? p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  )
                )}
              </div>
              <div style={{ padding: '0.75rem' }}>
                <h3 style={{ margin: '0 0 0.25rem', fontSize: '0.9375rem' }}>{p.name}</h3>
                <span style={{ fontWeight: 600 }}>
                  {fromPrice != null ? `From ${formatMoney(fromPrice, config.currencySymbol)}` : formatMoney(effectivePrice(p, config.enabledPriceTypes), config.currencySymbol)}
                </span>
              </div>
            </div>
          )
        })}
      </div>
      {products.length === 0 && (
        <p style={{ color: 'var(--color-text-muted)', marginTop: '1.5rem' }}>
          {children.length > 0 ? 'Pick a sub-category above to see its products.' : 'No products in this category yet.'}
        </p>
      )}
    </div>
  )
}
