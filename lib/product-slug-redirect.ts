import { permanentRedirect } from 'next/navigation'
import { resolveProductSlugRedirect } from '@/modules/shop/lib/db/slug-redirects'
import { productHref } from '@/modules/shop/lib/product-url'
import { getProductUrlStyle } from '@/modules/shop/lib/product-url-server'
import type { ProductPageSearchParams } from '@/modules/shop/lib/product-page-params'

function searchParamsToQuery(sp: ProductPageSearchParams): string {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(sp)) {
    if (typeof value === 'string') query.append(key, value)
    else if (Array.isArray(value)) for (const v of value) query.append(key, v)
  }
  const qs = query.toString()
  return qs ? `?${qs}` : ''
}

/** 308 to the current address for this product, keeping option query strings. */
export async function redirectIfStaleProductSlug(
  requestSlug: string,
  searchParams: ProductPageSearchParams,
): Promise<void> {
  const target = await resolveProductSlugRedirect(requestSlug)
  if (!target) return

  const path = target.kind === 'path'
    ? target.path
    : productHref(target.slug, await getProductUrlStyle())

  permanentRedirect(`${path}${searchParamsToQuery(searchParams)}`)
}
