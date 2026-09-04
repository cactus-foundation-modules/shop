import type { Metadata } from 'next'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import { orderTrackingRootSlug } from '@/modules/shop/lib/order-tracking'
import {
  ShopProductPageView,
  generateMetadata as productMetadata,
} from '@/modules/shop/app/public/shop/products/[slug]/page'
import { TrackOrderPageView } from '@/modules/shop/app/public/shop/track-order/page'

// Reached only through core's bare-slug route, via the publicRootSlug claim in
// cactus.module.json - which is why this sits outside app/public/shop, where
// every page file is also mounted under /shop/. Core has already asked
// shopClaimsRootSlug() before it gets here, so the shop does own this slug; what
// it does NOT know is which of the shop's two root-level things it is.
//
// Two, because a module gets exactly one root-slug component and the shop has
// two reasons to want a bare address:
//
//   a product   - on shops using the ROOT product URL style, where the product
//                 page has moved off /shop/products/<slug> altogether.
//   the tracker - /track-order, which is the address a shop prints on a
//                 delivery note and reads out on the telephone. Nobody has ever
//                 read out "/shop/track-order".
//
// The tracker is checked first and wins, because its slug is one specific word
// the owner typed into a settings box, while the product claim is "any slug in
// the catalogue" - and a product that happened to be called track-order would
// otherwise quietly take the shop's own support page away.
//
// Both branches call the other page's VIEW rather than its default export. The
// default of the product page is the /shop/products/<slug> route, which 404s on
// the ROOT style because the product has moved here; re-exporting it would 404
// this address too.

type Props = {
  params: Promise<{ slug: string }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

async function claimsTracker(slug: string): Promise<boolean> {
  return orderTrackingRootSlug(await getShopConfigCached()) === slug
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { slug } = await props.params
  if (await claimsTracker(slug)) return { title: 'Track your order' }
  return productMetadata(props as Parameters<typeof productMetadata>[0])
}

export default async function ShopRootSlugPage(props: Props) {
  const { slug } = await props.params
  if (await claimsTracker(slug)) return TrackOrderPageView()
  return ShopProductPageView(props as Parameters<typeof ShopProductPageView>[0])
}
