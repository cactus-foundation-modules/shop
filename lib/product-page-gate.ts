import { canPreviewDraftProducts } from '@/modules/shop/lib/access'
import { resolveAliasedProduct } from '@/modules/shop/lib/product-page-resolver'
import type { ShpProduct } from '@/modules/shop/lib/types'

export type ProductPageGateResult = {
  product: ShpProduct
  /** Signed-in staff viewing a draft nobody else can reach. */
  draftPreview: boolean
}

/** Whether this row may be shown on the storefront at all, before alias logic. */
export async function getProductStorefrontReachability(
  product: ShpProduct,
): Promise<{ reachable: true; draftPreview: boolean } | { reachable: false }> {
  if (product.catalogueHidden) return { reachable: false }
  // A spare part is kept off every storefront surface, and its own page is one
  // of them: left reachable, anyone holding the address could open it and buy
  // the part. Staff still see it, flagged and unindexed the same way as a
  // draft, since checking what a part looks like is a fair thing to want.
  if (product.status === 'ACTIVE' && !product.partsOnly) return { reachable: true, draftPreview: false }
  if ((product.status === 'DRAFT' || product.status === 'ACTIVE') && (await canPreviewDraftProducts())) {
    return { reachable: true, draftPreview: true }
  }
  return { reachable: false }
}

/** The product a product-page URL should render, or null when it should 404. */
export async function resolveProductForProductPage(
  slug: string,
  found: ShpProduct | null,
): Promise<ProductPageGateResult | null> {
  if (!found) {
    const aliased = await resolveAliasedProduct(slug, null)
    return aliased ? { product: aliased, draftPreview: false } : null
  }

  const reach = await getProductStorefrontReachability(found)
  if (reach.reachable) return { product: found, draftPreview: reach.draftPreview }

  const aliased = await resolveAliasedProduct(slug, found)
  return aliased ? { product: aliased, draftPreview: false } : null
}
