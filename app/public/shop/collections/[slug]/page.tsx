import { notFound } from 'next/navigation'
import { Render } from '@puckeditor/core/rsc'
import { getCollectionBySlug } from '@/modules/shop/lib/db/catalogue'
import { listProducts, getProductMediaForProducts } from '@/modules/shop/lib/db/products'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import { getShopGate } from '@/modules/shop/lib/access'
import { ShopClosedNotice, ShopStaffPreviewBanner } from '@/modules/shop/components/public/ShopClosedNotice'
import { resolveThemeLayout } from '@/lib/layout/resolveThemeLayout'
import { getModuleLayoutPuckRscConfig } from '@/lib/puck/config.rsc'
import { injectCollectionContext } from '@/modules/shop/lib/inject-collection-context'
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

  const [{ products }, config] = await Promise.all([
    listProducts({ status: 'ACTIVE', collectionSlug: slug, perPage: 60, excludeHidden: true }),
    getShopConfigCached(),
  ])

  const productIds = products.map((p) => p.id)
  const [mediaByProduct, fromPrices, cardExtras] = await Promise.all([
    getProductMediaForProducts(productIds),
    resolveCardFromPrices(productIds),
    resolveShopCardExtras(productIds),
  ])

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '2rem 1.5rem' }}>
      {gate.staffPreview && <ShopStaffPreviewBanner />}
      <h1 style={{ fontSize: '1.75rem' }}>{collection.name}</h1>
      {collection.description && <p style={{ color: 'var(--color-text-muted)' }}>{collection.description}</p>}
      <style dangerouslySetInnerHTML={{ __html: shopCardMediaCss }} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginTop: '1.5rem' }}>
        {products.map((p) => {
          const media = mediaByProduct.get(p.id) ?? []
          const primary = media.find((m) => m.isPrimary) ?? media[0]
          const image = primary && primary.type !== 'VIDEO_URL' ? primary : null
          const fromPrice = fromPrices.get(p.id)
          // The original tile, unchanged - only the picture gains the photo carousel
          // and the 3D badge (a <div> with a stretched link so the controls are real
          // buttons, not interactive content nested in an anchor).
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
      {products.length === 0 && <p style={{ color: 'var(--color-text-muted)' }}>No products in this collection yet.</p>}
    </div>
  )
}
