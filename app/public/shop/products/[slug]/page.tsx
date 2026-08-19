import { cache } from 'react'
import { notFound } from 'next/navigation'
import { Render } from '@puckeditor/core/rsc'
import type { Data } from '@puckeditor/core'
import type { Metadata } from 'next'
import { getModuleLayoutPuckRscConfig } from '@/lib/puck/config.rsc'
import { resolveThemeLayout } from '@/lib/layout/resolveThemeLayout'
import { getSiteUrlOrNull } from '@/lib/config/env'
import { getProductBySlug } from '@/modules/shop/lib/db/products'
import { getProductMedia } from '@/modules/shop/lib/db'
import { resolveAliasedProduct } from '@/modules/shop/lib/product-page-resolver'
import { resolveProductSocialImage } from '@/modules/shop/lib/product-social-image'
import { rememberProductPageSearchParams, type ProductPageSearchParams } from '@/modules/shop/lib/product-page-params'
import { getProductUrlStyle, productUrl } from '@/modules/shop/lib/product-url'
import { shopClaimsRootSlug } from '@/modules/shop/lib/root-slug'
import { getShopGate } from '@/modules/shop/lib/access'
import { ShopClosedNotice, ShopStaffPreviewBanner, ShopStockHiddenBanner } from '@/modules/shop/components/public/ShopClosedNotice'
import { getProductPageStockGate } from '@/modules/shop/lib/stock-visibility'
import { injectProductContext } from '@/modules/shop/lib/inject-product-context'
import type { PuckData, ShpProduct } from '@/modules/shop/lib/types'

type Props = {
  params: Promise<{ slug: string }>
  searchParams?: Promise<ProductPageSearchParams>
}

// generateMetadata and the render below both need the same row. Behind React
// cache() that is one query per request instead of two. Wrapped here rather
// than in the db layer: other callers there read back rows they have just
// written, and a request-scoped memo would hand them the pre-write row.
const getProduct = cache(getProductBySlug)

// The social preview block (og:image and friends) for a product page. The
// image is whatever the page itself leads with: a companion module's answer
// for this request's configuration first (a variation deep link, or option
// choices a shared URL carries - see lib/product-social-image.ts), else the
// product's own first photograph. Relative media URLs are made absolute where
// the site knows its own address - scrapers do not resolve relative paths.
async function socialMetadata(product: ShpProduct, title: string, description: string | undefined, requestSlug: string, searchParams: ProductPageSearchParams): Promise<Metadata> {
  let image = await resolveProductSocialImage(product)
  if (!image) {
    const media = await getProductMedia(product.id)
    image = media.find((m) => m.type !== 'VIDEO_URL')?.url ?? null
  }
  const siteUrl = getSiteUrlOrNull()
  if (image && image.startsWith('/') && siteUrl) image = `${siteUrl}${image}`
  // og:url keeps the query string: the whole point of a shared configured link
  // is that the configuration travels with it.
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(searchParams)) {
    if (typeof value === 'string') query.append(key, value)
    else if (Array.isArray(value)) for (const v of value) query.append(key, v)
  }
  const qs = query.toString()
  const pageUrl = siteUrl ? `${productUrl(siteUrl, requestSlug, await getProductUrlStyle())}${qs ? `?${qs}` : ''}` : undefined
  return {
    openGraph: {
      title,
      description,
      type: 'website',
      ...(pageUrl ? { url: pageUrl } : {}),
      ...(image ? { images: [{ url: image, alt: product.name }] } : {}),
    },
    twitter: { card: 'summary_large_image' },
  }
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params
  // A closed shop must not publish its product names either, so the title is
  // withheld from anyone the page itself would turn away.
  if ((await getShopGate()).blocked) return {}
  // Park the query string for companion modules before anything resolves: the
  // social image below depends on the selection a shared link carries.
  const sp = (await searchParams) ?? {}
  rememberProductPageSearchParams(sp)
  const found = await getProduct(slug)
  // Mirrors the page's visibility gate below. Next currently discards this
  // metadata once the page calls notFound(), but only while no
  // global-not-found convention exists - adding one flips metadata resolution
  // back to the page and would publish a hidden product's name.
  if (found && found.status === 'ACTIVE' && !found.catalogueHidden) {
    if ((await getProductPageStockGate(found.id)).notFound) return {}
    const title = found.metaTitle || found.name
    const description = found.metaDescription || found.shortDescription || undefined
    const siteUrl = getSiteUrlOrNull()
    return {
      title,
      description,
      // Self-canonical in the shop's chosen URL style: that address is the
      // product's one true one, so shared links carrying option choices in the
      // query string never register with search engines as duplicate pages -
      // and on the ROOT style, this same tag (emitted by both routes) is what
      // folds the still-serving /shop/products/ address into the root one
      // without a redirect.
      ...(siteUrl ? { alternates: { canonical: productUrl(siteUrl, found.slug, await getProductUrlStyle()) } } : {}),
      ...(await socialMetadata(found, title, description, slug, sp)),
    }
  }
  // A slug shop won't show on its own may still be a variant's deep link. If a
  // module aliases it to a real product, title the tab after the variant itself
  // (its own descriptive name), so a shared link reads true, and take the
  // description from the parent it resolved to.
  const parent = await resolveAliasedProduct(slug, found)
  if (!parent) return {}
  if ((await getProductPageStockGate(parent.id)).notFound) return {}
  const title = found?.name || parent.metaTitle || parent.name
  const description = parent.metaDescription || parent.shortDescription || undefined
  const siteUrl = getSiteUrlOrNull()
  return {
    title,
    description,
    // A variation's own link renders the parent's page, so the parent's URL is
    // the canonical one. Without this, every variation deep link (the cart's,
    // and the Google Shopping feed's) reads to a crawler as a duplicate of the
    // parent page under a different address.
    ...(siteUrl ? { alternates: { canonical: productUrl(siteUrl, parent.slug, await getProductUrlStyle()) } } : {}),
    // The social image resolves against the parent - the page that renders -
    // with the deep link's combination already recorded by the resolver above,
    // so the preview shows the variation the link names.
    ...(await socialMetadata(parent, title, description, slug, sp)),
  }
}

// The page itself, address-agnostic: it renders by slug and emits a
// style-aware canonical, so it serves both /shop/products/<slug> and the bare
// /<slug> the ROOT style claims. Exported by name for the root route, which
// must NOT inherit the redirect the default export below adds - re-exporting
// that one would send the root address to itself, forever.
export async function ShopProductPageView({ params, searchParams }: Props) {
  const { slug } = await params
  // Same parking as generateMetadata: the layout's blocks (and companion
  // modules behind them) read the shared link's selection while they render.
  rememberProductPageSearchParams((await searchParams) ?? {})
  const gate = await getShopGate()
  if (gate.blocked) return <ShopClosedNotice message={gate.message} />

  let product = await getProduct(slug)
  // Catalogue-hidden rows (variant children) are reached only through their
  // parent's selector, never on their own URL - except a companion module may
  // alias such a URL to the product whose page should stand in for it (a
  // variation deep link resolving to its parent, opened on that combination).
  // The same door catches an inactive or unknown slug; nothing claims those, so
  // the page 404s exactly as before.
  if (!product || product.status !== 'ACTIVE' || product.catalogueHidden) {
    const aliased = await resolveAliasedProduct(slug, product)
    if (!aliased) notFound()
    product = aliased
  }

  // A shop set to hide sold-out products everywhere turns this page away too.
  // Checked on the product that will actually render, so a variant deep link is
  // judged by the listing it opens rather than by the child row behind it.
  const stock = await getProductPageStockGate(product.id)
  if (stock.notFound) notFound()

  // From here `product` is the visible, active product to render: the one the URL
  // names, or the parent a deep link resolved to. Its own slug drives the layout
  // choice and the context shop injects into its blocks, so the parent's page
  // renders while the address bar keeps the variant's tidy link.
  const layout = await resolveThemeLayout('shopProduct', { moduleName: 'shop', slug: product.slug })
  if (!layout?.builderData) notFound()

  const inStock = !product.trackInventory || (product.stockCount ?? 0) > 0 || product.outOfStockBehaviour === 'BACKORDER' || product.isPreOrder
  const data = injectProductContext(layout.builderData as PuckData, product.slug, product.id, inStock)

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '2rem 1.5rem' }}>
      {gate.staffPreview && <ShopStaffPreviewBanner />}
      {stock.staffPreview && <ShopStockHiddenBanner />}
      <Render config={getModuleLayoutPuckRscConfig('shopProduct') as any} data={data as Data} />
    </div>
  )
}

// What /shop/products/<slug> serves. On the ROOT style it serves nothing: the
// product lives at the bare /<slug> and this address is simply not one of the
// shop's any more, so it 404s like any other address that names no page. No
// redirect - a shop that has moved its products to the root has one address per
// product, not one address and a forwarding note.
//
// Gated on shopClaimsRootSlug - the very predicate core asks before serving the
// bare slug - so this closes only where the root address genuinely answers.
// It matches catalogue-hidden rows too, so a variation's own deep link is
// closed here exactly as its parent is. On the default SHOP style nothing
// changes: the claim is false and this address is the product's own.
export default async function ShopProductPage({ params, searchParams }: Props) {
  const { slug } = await params
  if (await shopClaimsRootSlug(slug)) notFound()
  return <ShopProductPageView params={params} searchParams={searchParams} />
}
