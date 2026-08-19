// Type-only, so nothing server-side is dragged in by importing this file: the
// two builders below are pure string work and the admin product editor's search
// preview - a client component - needs them as much as any server render does.
// getProductUrlStyle is the one thing here that must reach the database, so it
// loads config where it is called rather than at module scope; a static import
// would put prisma in the browser bundle the moment a client file imported
// productHref.
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

// Server-only by nature - it reads the shop's settings. See the note above on
// why the import sits inside the function.
export async function getProductUrlStyle(): Promise<ProductUrlStyle> {
  const { getShopConfigCached } = await import('./config')
  return (await getShopConfigCached()).productUrlStyle
}

// Absolute form, for canonicals, share links and feeds.
export function productUrl(siteUrl: string, slug: string, style: ProductUrlStyle): string {
  return `${siteUrl}${productHref(slug, style)}`
}
