// The social preview image (og:image) for a category page and a collection page.
//
// Both rows carry an `og_image_id` - a Media id chosen deliberately as the
// picture to publish - but neither page has ever emitted it, so a landing page
// with a hand-written meta title and description still shared as a bare link.
// This resolves that id to a URL, and falls back the way the product page does:
// the picture the page itself leads with, rather than nothing.
//
// The order, most deliberate first:
//   category   - og_image_id, then its own card picture, then the first
//                photograph among the products it lists
//   collection - og_image_id, then its own image_id, then the first photograph
//                among the products on the shelf
//
// The last step is what actually does the work on a real catalogue: a shop can
// have every category written up for search and still have chosen no picture
// for any of them, and "the first thing on the page" is the answer a shopper
// would give if asked what the page looks like.
import { prisma } from '@/lib/db/prisma'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import { resolveCategoryProductFilter } from '@/modules/shop/lib/db/catalogue'
import { listProducts, getPrimaryProductImages, type ListProductsFilter } from '@/modules/shop/lib/db/products'
import type { ShpCategory, ShpCollection } from '@/modules/shop/lib/types'

// How far down the listing to look for a product that actually has a
// photograph. The first product on the page nearly always has one; this only
// exists so a run of picture-less products at the top does not lose the page
// its social image. Bounded because generateMetadata runs on every request.
const PHOTO_SCAN = 12

// Scrapers do not resolve relative paths out of a meta tag, so a site-relative
// media URL has to be made absolute against the site's own address. A site that
// does not know its address yet leaves the URL as it found it - same as the
// product page. Pure, so the site URL is passed in rather than read here.
export function absoluteSocialImageUrl(url: string | null | undefined, siteUrl: string | null): string | null {
  if (!url) return null
  if (url.startsWith('/') && siteUrl) return `${siteUrl}${url}`
  return url
}

async function mediaUrlById(id: string | null): Promise<string | null> {
  if (!id) return null
  const media = await prisma.media.findUnique({ where: { id }, select: { url: true } })
  return media?.url ?? null
}

// The first photograph among the products a listing shows, in the order it
// shows them - so the social image is a picture the page genuinely leads with.
// Reuses listProducts rather than hand-rolling SQL, which keeps the draft,
// hidden-variant and out-of-stock rules identical to the grid below the fold.
async function firstListedPhoto(filter: ListProductsFilter): Promise<string | null> {
  const { products } = await listProducts({
    ...filter,
    status: 'ACTIVE',
    excludeHidden: true,
    storefront: true,
    perPage: PHOTO_SCAN,
  })
  const ids = products.map((p) => p.id)
  if (ids.length === 0) return null
  const images = await getPrimaryProductImages(ids)
  for (const id of ids) if (images[id]) return images[id]
  return null
}

export async function resolveCategorySocialImage(category: ShpCategory): Promise<string | null> {
  const chosen = await mediaUrlById(category.ogImageId)
  if (chosen) return chosen
  // image_url is stored as the media URL itself, not an id (see the column
  // comment in 001_initial.sql), so it needs no lookup.
  if (category.imageUrl) return category.imageUrl
  const config = await getShopConfigCached()
  return firstListedPhoto(await resolveCategoryProductFilter(category.slug, config.categoryProductDisplayMode))
}

export async function resolveCollectionSocialImage(collection: ShpCollection): Promise<string | null> {
  const chosen = await mediaUrlById(collection.ogImageId)
  if (chosen) return chosen
  const own = await mediaUrlById(collection.imageId)
  if (own) return own
  return firstListedPhoto({ collectionSlug: collection.slug })
}
