// Pure string work and one type import, nothing else, ever: client components
// all over the shop (and other modules) import productHref, so a single edge
// from here to config would put prisma - and through the payment registry,
// every module's server code - in the browser bundle. The style lookup, which
// does need the database, lives in product-url-server.ts. Even a dynamic
// import counts as an edge; that is exactly how this broke once.
import type { ShpConfig } from './config'

export type ProductUrlStyle = ShpConfig['productUrlStyle']

// Every link to a product page goes through here, so the shop's chosen URL
// style is decided in one place rather than string-concatenated across a dozen
// surfaces. Mirrors gazette's post-url.ts. Only the product page itself moves
// between styles: categories, collections, tags, the cart and checkout all stay
// under /shop regardless.
export function productHref(slug: string, style: ProductUrlStyle): string {
  return style === 'ROOT'
    ? `/${encodeURIComponent(slug)}`
    : `/shop/products/${encodeURIComponent(slug)}`
}

// Absolute form, for canonicals, share links and feeds.
export function productUrl(siteUrl: string, slug: string, style: ProductUrlStyle): string {
  return `${siteUrl}${productHref(slug, style)}`
}
