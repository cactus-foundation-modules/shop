import { getSiteUrl } from '@/lib/config/env'
import type { ShpConfig } from '@/modules/shop/lib/config'
import { getOrderItems } from '@/modules/shop/lib/db/orders'
import { getProductMediaForProducts, getProductSlugsByIds } from '@/modules/shop/lib/db/products'
import { absoluteImageUrl, productEmailUrl } from '@/modules/shop/lib/order-items-email'
import type { ShpProductMedia } from '@/modules/shop/lib/types'

// A parcel's thumbnails and product links, for every email that lists what is
// in the box: the dispatch note, the tracking that arrived later and the
// delivery window. One lookup, so the three cannot drift - the window email
// went out for months with bare names beside a dispatch note that had pictures,
// and a customer reading the two side by side reasonably wondered whether they
// were about the same order.
//
// By the line's own product, exactly as the confirmation resolves them. The
// dispatch summary carries names and quantities but no product id, so the
// order's items come along to supply it. A picture that will not read costs the
// thumbnails and never the email.

export type OrderItemEmailMedia = {
  imageFor: (orderItemId: string) => string | null
  /** The same link the confirmation gives - the line's own product, which for
   *  a variation is the child slug the parent's page opens on. */
  linkFor: (orderItemId: string) => string | null
}

export async function orderItemEmailMedia(
  orderId: string,
  config: Pick<ShpConfig, 'productUrlStyle'>,
): Promise<OrderItemEmailMedia> {
  const siteUrl = getSiteUrl()
  const orderItems = await getOrderItems(orderId).catch(() => [])
  const productByOrderItemId = new Map(orderItems.map((i) => [i.id, i.productId]))
  const productIds = orderItems.map((i) => i.productId).filter((id): id is string => !!id)
  const [mediaByProduct, slugByProduct] = await Promise.all([
    productIds.length > 0
      ? getProductMediaForProducts(productIds).catch(() => new Map<string, ShpProductMedia[]>())
      : Promise.resolve(new Map<string, ShpProductMedia[]>()),
    productIds.length > 0
      ? getProductSlugsByIds(productIds).catch(() => new Map<string, string>())
      : Promise.resolve(new Map<string, string>()),
  ])

  return {
    imageFor: (orderItemId) => {
      const productId = productByOrderItemId.get(orderItemId) ?? null
      const media = productId ? mediaByProduct.get(productId) ?? [] : []
      const image = media.find((m) => m.type === 'IMAGE' && m.isPrimary) ?? media.find((m) => m.type === 'IMAGE')
      return absoluteImageUrl(image?.url, siteUrl)
    },
    linkFor: (orderItemId) => {
      const productId = productByOrderItemId.get(orderItemId) ?? null
      return productEmailUrl(productId ? slugByProduct.get(productId) : null, siteUrl, config.productUrlStyle)
    },
  }
}
