import { connection } from 'next/server'
import { Render } from '@puckeditor/core/rsc'
import type { Data } from '@puckeditor/core'
import { prisma } from '@/lib/db/prisma'
import { resolveThemeLayout } from '@/lib/layout/resolveThemeLayout'
import type { LayoutRef } from '@/lib/puck/LayoutPickerField'
import { getProductBySlug, getProductMedia, getProductTagIds, getDigitalFileById } from '@/modules/shop/lib/db'
import { listTags } from '@/modules/shop/lib/db/catalogue'
import { getShopConfigCached, resolveSupplierLabel } from '@/modules/shop/lib/config'
import { getShopBreakpoints } from '@/modules/shop/lib/breakpoints'
import { priceView } from '@/modules/shop/lib/pricing'
import { makeDisplayAdjuster, resolveTaxDisplay } from '@/modules/shop/lib/tax-display'
import { injectShopProductDetailEmbed } from '@/modules/shop/lib/inject-part-context'
import { resolveShopDetailProvider, narrowShopDetailSlot, collectLayoutBlockTypes } from '@/modules/shop/lib/detail-slot'
import { resolveShopDetailTabs } from '@/modules/shop/lib/detail-tabs'
import { resolveShopDetailSpec } from '@/modules/shop/lib/detail-spec'
import { resolveShopGalleryExtras } from '@/modules/shop/lib/gallery-media'
import { stripHtmlToPlainText } from '@/modules/shop/lib/strip-html'
import { resolveShopCommerceMode } from '@/modules/shop/lib/commerce-mode'
import { resolveProductAdminEditHref } from '@/modules/shop/lib/admin-edit'
import { canSeeStockLevels } from '@/modules/shop/lib/admin-stock'
import type { PuckData } from '@/modules/shop/lib/types'
import type { DetailPartContext } from '@/modules/shop/components/puck/parts/part-context'
import { shopProductDetailPuckComponent, type ShopProductDetailProps } from './ShopProductDetail'

// Server (RSC) half of the ShopProductDetail block. Kept in its own file so the
// server-only imports below - prisma, next/server, and the dynamic import of
// lib/puck/config.rsc (which itself depends on next/headers via other modules'
// RSC blocks) - are never statically reachable from the client Puck editor
// bundle. The editor placeholder and Puck field config live in
// ShopProductDetail.tsx; the manifest points `rscImport` here.

async function resolveDetailTemplate(layoutRef: LayoutRef | null | undefined, slug: string): Promise<PuckData | null> {
  let layout = null
  if (layoutRef?.id) {
    layout = await prisma.layout.findUnique({ where: { id: layoutRef.id } }).catch(() => null)
  }
  if (!layout?.builderData) {
    layout = await resolveThemeLayout('shopProductDetail', { moduleName: 'shop', slug })
  }
  return layout?.builderData ? (layout.builderData as PuckData) : null
}

export async function ShopProductDetailRsc(props: ShopProductDetailProps) {
  await connection()
  if (!props.productSlug) return null
  const product = await getProductBySlug(props.productSlug)
  if (!product) return null

  // The claim needs only the product, so it still resolves alongside the
  // template; which of its slots the layout has already covered is decided
  // below, once the template's blocks are known.
  // Extra gallery media and contributed tabs are additive and need only the
  // product, so they resolve alongside everything else rather than behind the
  // template.
  const [media, config, taxDisplay, bp, tags, tagIds, template, provider, galleryExtras, detailTabs, specOverride, adminEditHref, showAdminStock] = await Promise.all([
    getProductMedia(product.id),
    getShopConfigCached(),
    resolveTaxDisplay(),
    getShopBreakpoints(),
    listTags(),
    getProductTagIds(product.id),
    resolveDetailTemplate(props.layoutRef, props.productSlug),
    resolveShopDetailProvider(product),
    resolveShopGalleryExtras(product.id),
    resolveShopDetailTabs(product.id),
    resolveShopDetailSpec(product.id),
    // Whoever is looking gets their own answer, so this cannot be cached
    // alongside the product: a shopper must never receive an admin's link.
    resolveProductAdminEditHref(product.id),
    // Same again for the stock figure: per-viewer, never cached with the product.
    canSeeStockLevels(),
  ])
  const tagById = new Map(tags.map((t) => [t.id, t.slug]))
  const tagSlugs = tagIds.map((id) => tagById.get(id)).filter((s): s is string => Boolean(s))

  const digitalFile =
    product.type === 'DIGITAL' && product.digitalFileId ? await getDigitalFileById(product.digitalFileId) : null

  const images = media
    .filter((m) => m.type !== 'VIDEO_URL')
    .map((m) => ({ url: m.url, alt: m.altText ?? product.name }))

  const outOfStock =
    product.trackInventory && (product.stockCount ?? 0) <= 0 && product.outOfStockBehaviour === 'BLOCK' && !product.isPreOrder
  const lowStock =
    !!product.trackInventory &&
    product.stockCount != null &&
    product.stockCount > 0 &&
    product.lowStockThreshold != null &&
    product.stockCount <= product.lowStockThreshold

  // One resolution of the product's price types for the whole page: the parts
  // read it, and the structured data below quotes the same figure, so a search
  // result can never advertise a price the page does not charge. Converted to
  // whichever side of tax the shop prints on (lib/tax-display.ts) here rather
  // than per part, so the JSON-LD below quotes the figure on screen - a search
  // result showing the net price of a shop that quotes gross is a mis-price.
  const prices = priceView(product, config.enabledPriceTypes, makeDisplayAdjuster(taxDisplay, product.taxClassId))

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: stripHtmlToPlainText(product.shortDescription ?? product.description ?? '') || undefined,
    image: media.map((m) => m.url),
    sku: product.sku ?? undefined,
    offers: {
      '@type': 'Offer',
      price: prices.now,
      priceCurrency: config.currency,
      availability: product.isPreOrder
        ? 'https://schema.org/PreOrder'
        : outOfStock
          ? 'https://schema.org/OutOfStock'
          : 'https://schema.org/InStock',
    },
  }

  if (!template) return null

  // A shop withholding its prices must withhold them here too: structured data
  // is read by shopping tabs and rich results, so leaving the figure in would
  // publish the very number the shop has decided not to quote.
  const commerce = await resolveShopCommerceMode()
  if (commerce.hidePrices) {
    delete (jsonLd.offers as Record<string, unknown>).price
    delete (jsonLd.offers as Record<string, unknown>).priceCurrency
  }

  const blockTypes = collectLayoutBlockTypes(template)
  const slot = narrowShopDetailSlot(provider, blockTypes)

  // config.rsc pulls in next/headers via other modules' RSC blocks, so it stays a
  // dynamic import kept off the client editor bundle. Loaded once here and reused
  // for both the designed-description body and the detail template render below.
  const { getModuleLayoutPuckRscConfig } = await import('@/lib/puck/config.rsc')

  // The product's opt-in designed description. Rendered from its own Puck doc
  // with the same content-only shared parts the editor uses, so editor and
  // storefront markup match. An empty (seeded-but-unused) doc counts as absent,
  // so the Description tab falls back to the plain-text `description`.
  const descriptionBody =
    product.descriptionPuck && Array.isArray(product.descriptionPuck.content) && product.descriptionPuck.content.length > 0
      ? <Render config={getModuleLayoutPuckRscConfig('shopProductDescription') as any} data={product.descriptionPuck as Data} />
      : undefined

  const ctx: DetailPartContext = {
    product,
    images,
    currencySymbol: config.currencySymbol,
    commerce,
    tagSlugs,
    digitalFile: digitalFile ? { filename: digitalFile.filename, size: digitalFile.size } : null,
    bp,
    outOfStock,
    lowStock,
    prices,
    priceSuffix: taxDisplay.display.suffix,
    showRetailPrice: config.showRetailPrice,
    supplierLabel: config.supplierFieldEnabled && config.supplierShowOnFrontend ? resolveSupplierLabel(config) : null,
    slot,
    layoutBlockTypes: [...blockTypes],
    galleryExtras,
    detailTabs,
    specOverride,
    descriptionBody,
    adminEditHref,
    showAdminStock,
  }
  const data = injectShopProductDetailEmbed(template, ctx)

  return (
    <div>
      {/* `</` escaped so a description carrying markup (a supplier-imported embed,
          say) cannot terminate this script element early - unescaped, the spilled
          remainder parses as garbage JavaScript and breaks React's hydration of
          the whole product page. Same treatment as ultimate-seo's jsonLdEscape. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
      <Render config={getModuleLayoutPuckRscConfig('shopProductDetail') as any} data={data as Data} />
    </div>
  )
}

export const shopProductDetailPuckRscComponent = { ...shopProductDetailPuckComponent, render: ShopProductDetailRsc }
