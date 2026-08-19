import type { ProductUrlStyle } from '@/modules/shop/lib/product-url'

// Reading the shop's chosen product URL style needs the database, so it lives
// here rather than beside the pure string builders in product-url.ts. Keeping
// the two apart is not tidiness: an import of config - static OR dynamic - is
// an edge the bundler follows, and config reaches the payment registry, which
// reaches every module's extension points. One client component importing
// productHref was enough to drag sharp, nodemailer and next/headers into the
// browser bundle and fail the build. product-url.ts now imports nothing but a
// type, so it is safe from anywhere.
export async function getProductUrlStyle(): Promise<ProductUrlStyle> {
  const { getShopConfigCached } = await import('@/modules/shop/lib/config')
  return (await getShopConfigCached()).productUrlStyle
}
