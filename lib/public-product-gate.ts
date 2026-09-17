import { getProductBySlug } from '@/modules/shop/lib/db/products'
import { getProductStorefrontReachability } from '@/modules/shop/lib/product-page-gate'
import type { ShpProduct } from '@/modules/shop/lib/types'

/** Load a product by slug if this visitor may see it on the storefront. */
export async function getPublicStorefrontProduct(slug: string): Promise<ShpProduct | null> {
  const product = await getProductBySlug(slug)
  if (!product) return null
  const reach = await getProductStorefrontReachability(product)
  return reach.reachable ? product : null
}
