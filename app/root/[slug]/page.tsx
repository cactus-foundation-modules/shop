// Reached only through core's bare-slug route, via the publicRootSlug claim in
// cactus.module.json - which is why this sits outside app/public/shop, where
// every page file is also mounted under /shop/. Core has already asked
// shopClaimsRootSlug() before it gets here, so the shop is on the ROOT URL
// style and a product row with this slug exists. The product page itself is
// address-agnostic (it renders by slug and emits a style-aware canonical), so
// the root address simply re-exports it wholesale.
export { default, generateMetadata } from '@/modules/shop/app/public/shop/products/[slug]/page'
