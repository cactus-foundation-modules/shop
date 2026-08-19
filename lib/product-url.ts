import { getShopConfigCached } from './config'
import type { ShpConfig } from './config'

export type ProductUrlStyle = ShpConfig['productUrlStyle']

// Every server-rendered link to a product page goes through here, so the
// shop's chosen URL style is decided in one place rather than
// string-concatenated across a dozen surfaces. Mirrors gazette's post-url.ts.
// Only the product page itself moves between styles: categories, collections,
// tags, the cart and checkout all stay under /shop regardless.
export function productHref(slug: string, style: ProductUrlStyle): string {
  return style === 'ROOT'
    ? `/${encodeURIComponent(slug)}`
    : `/shop/products/${encodeURIComponent(slug)}`
}

export async function getProductUrlStyle(): Promise<ProductUrlStyle> {
  return (await getShopConfigCached()).productUrlStyle
}

// Absolute form, for canonicals, share links and feeds.
export function productUrl(siteUrl: string, slug: string, style: ProductUrlStyle): string {
  return `${siteUrl}${productHref(slug, style)}`
}
