// PROTECTED - inline in the product PUT route (addendum A.3).
import { getUnnotifiedSubscribers, markSubscribersNotified } from '@/modules/shop/lib/db/back-in-stock'
import { getProductMedia } from '@/modules/shop/lib/db/products'
import { sendShopEmail } from '@/modules/shop/lib/email'
import { signUnsubscribeToken } from '@/modules/shop/lib/unsubscribe-token'
import { getSiteUrl } from '@/lib/config/env'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import type { ShpProduct } from '@/modules/shop/lib/types'

const INLINE_DISPATCH_THRESHOLD = 50

async function dispatchNotifications(product: ShpProduct): Promise<void> {
  const subscribers = await getUnnotifiedSubscribers(product.id)
  if (subscribers.length === 0) return

  const siteUrl = getSiteUrl()
  const config = await getShopConfigCached()
  const media = await getProductMedia(product.id)
  const primary = media.find((m) => m.isPrimary) ?? media[0]
  const productUrl = `${siteUrl}/shop/products/${product.slug}`

  for (const sub of subscribers) {
    const unsubscribeUrl = `${siteUrl}/api/m/shop/public/back-in-stock?token=${signUnsubscribeToken(product.id, sub.email)}`
    await sendShopEmail('BACK_IN_STOCK', sub.email, {
      productName: product.name,
      productUrl,
      productImage: primary?.url ?? '',
      shopName: config.shopTitle || 'Shop',
      unsubscribeUrl,
    })
  }
  await markSubscribersNotified(subscribers.map((s) => s.id))
}

// Triggered when stock goes from zero/null to positive, or out-of-stock
// behaviour flips from BLOCK to BACKORDER (addendum A.3). Dispatches inline
// for small lists; queues via Next's after() when large so the admin save
// action isn't blocked (Q7).
export async function maybeTriggerBackInStock(
  product: ShpProduct,
  previous: { stockCount: number | null; outOfStockBehaviour: ShpProduct['outOfStockBehaviour'] }
): Promise<void> {
  const stockRestored = (previous.stockCount ?? 0) <= 0 && (product.stockCount ?? 0) > 0
  const behaviourRelaxed = previous.outOfStockBehaviour === 'BLOCK' && product.outOfStockBehaviour === 'BACKORDER'
  if (!stockRestored && !behaviourRelaxed) return

  const subscribers = await getUnnotifiedSubscribers(product.id)
  if (subscribers.length === 0) return

  if (subscribers.length > INLINE_DISPATCH_THRESHOLD) {
    const { after } = await import('next/server')
    after(() => dispatchNotifications(product))
  } else {
    await dispatchNotifications(product)
  }
}
