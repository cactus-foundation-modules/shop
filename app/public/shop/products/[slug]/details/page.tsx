import { cache } from 'react'
import { notFound } from 'next/navigation'
import { Render } from '@puckeditor/core/rsc'
import type { Data } from '@puckeditor/core'
import { getProductBySlug, getProductMediaForProducts } from '@/modules/shop/lib/db/products'
import { resolveAliasedProduct } from '@/modules/shop/lib/product-page-resolver'
import { getShopGate } from '@/modules/shop/lib/access'
import { getProductPageStockGate } from '@/modules/shop/lib/stock-visibility'
import { resolveShopDetailSpec } from '@/modules/shop/lib/detail-spec'
import { resolveShopDetailImages } from '@/modules/shop/lib/detail-images'
import type { PuckData } from '@/modules/shop/lib/types'

// A product's description on its own: name, pictures (its own and any a
// companion module folds in - a range's promoted variations, say - in the same
// order the product's own page shows them), the full (designed or
// plain) description and the specification - and nothing else. No short
// description (it only repeats the opening of the full one to a reader who has
// asked for the detail), no purchase UI, no site chrome, never indexed.
//
// Built to be shown INSIDE another page: a companion module's "Learn more"
// modal iframes this view so a shopper can read all about an accessory without
// leaving the product they are configuring. It is a real page through the real
// rendering pipeline, so a designed description's videos, styling and
// specification table come out exactly as they do on the product's own page -
// nothing here re-implements any rendering.
//
// The site header and footer are hidden by CSS rather than skipped at render:
// this page lives under the same (public) layout as every other, and that
// layout offers no way out of its chrome. Core's own contract is the one
// stable thing in the DOM - the page body's children are the chrome and a
// single <main> holding the page - so everything that is not the <main> is
// hidden. If core ever wraps <main>, the chrome comes back visibly inside the
// modal (degraded, not broken) and this selector is the one line to revisit.
const BARE_CSS = `
body > :not(main) { display: none !important; }
main { padding: 0 !important; }
.spd-bare { max-width: 860px; margin: 0 auto; padding: 1.25rem 1.25rem 2rem; }
/* Centred, because this view is read in a modal a good deal wider than one
   picture and a lone photograph hard against the left edge reads as a layout
   that has come apart. "safe" is doing real work: plain "center" on a scrolling
   flex row puts overflow on BOTH sides and the browser cannot scroll back to
   the first item, so a product with eight pictures would lose the first of them
   outright. safe centre falls back to start alignment the moment the row
   overflows, which is exactly when centring stops being wanted anyway. */
.spd-bare-imgs { display: flex; justify-content: safe center; gap: 0.625rem; overflow-x: auto; margin: 0 0 1rem; }
.spd-bare-imgs img { width: 132px; height: 132px; object-fit: cover; border-radius: 10px; flex-shrink: 0; }
.spd-bare h1 { font-size: 1.5rem; margin: 0 0 1rem; }
.spd-bare-spec { margin-top: 1.5rem; }
`

const MAX_IMAGES = 24

const getProduct = cache(getProductBySlug)

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  if ((await getShopGate()).blocked) return { robots: { index: false, follow: false } }
  const found = await getProduct(slug)
  const name = found && found.status === 'ACTIVE' && !found.catalogueHidden ? found.name : null
  return {
    // The product's own page is the one search engines should have; this view
    // exists to be embedded, and indexing it would surface a chrome-less
    // duplicate of the product page.
    robots: { index: false, follow: false },
    ...(name ? { title: name } : {}),
  }
}

export default async function ShopProductDetailsOnlyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  // The same doors as the product page proper: a closed shop, a hidden or
  // sold-out-and-hidden product and an unknown slug all answer here exactly as
  // they do there - this view must never show what the real page would not.
  const gate = await getShopGate()
  if (gate.blocked) notFound()

  let product = await getProduct(slug)
  if (!product || product.status !== 'ACTIVE' || product.catalogueHidden) {
    const aliased = await resolveAliasedProduct(slug, product)
    if (!aliased) notFound()
    product = aliased
  }
  const stock = await getProductPageStockGate(product.id)
  if (stock.notFound) notFound()

  const [mediaByProduct, spec] = await Promise.all([
    getProductMediaForProducts([product.id]),
    resolveShopDetailSpec(product.id),
  ])
  // Stills only: a video-by-URL cannot sit in an <img>, and the strip here has
  // no player. Same filter the product page's own galleries apply.
  const own = (mediaByProduct.get(product.id) ?? [])
    .filter((m) => m.type === 'IMAGE')
    .map((m) => ({ url: m.url, alt: m.altText ?? product.name }))
  // Whatever else has pictures of this product - the variations module's
  // promoted variations, today - folded in front of or behind its own exactly as
  // the product's own page orders them. Capped: this is a strip in someone
  // else's modal, and a range with ninety variations would otherwise fetch
  // ninety thumbnails to be scrolled past.
  const images = (await resolveShopDetailImages(product.id, own)).slice(0, MAX_IMAGES)

  // The designed description through the same config the product page renders
  // it with; the plain-text description as the same simple paragraph the
  // Description tab falls back to. Same dynamic import as
  // ShopProductDetail.rsc.tsx and for the same bundle reason.
  const { getModuleLayoutPuckRscConfig } = await import('@/lib/puck/config.rsc')
  const designed = product.descriptionPuck as PuckData | null
  const hasDesigned = !!(designed && Array.isArray(designed.content) && designed.content.length > 0)

  return (
    <div className="spd-bare">
      <style dangerouslySetInnerHTML={{ __html: BARE_CSS }} />
      <h1>{product.name}</h1>
      {images.length > 0 && (
        <div className="spd-bare-imgs">
          {images.map((img) => (
            // eslint-disable-next-line @next/next/no-img-element -- module-supplied absolute media URL, not a build-time asset
            <img key={img.url} src={img.url} alt={img.alt} loading="lazy" />
          ))}
        </div>
      )}
      {hasDesigned
        ? <Render config={getModuleLayoutPuckRscConfig('shopProductDescription') as any} data={designed as unknown as Data} />
        : product.description
          ? <p>{product.description}</p>
          : null}
      {spec && (
        <div className="spd-bare-spec">
          <spec.Panel payload={spec.payload} />
        </div>
      )}
    </div>
  )
}
