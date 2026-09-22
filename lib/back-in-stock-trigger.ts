// PROTECTED - inline in the product PUT route (addendum A.3).
import { getUnnotifiedSubscribers, claimSubscriberForNotification, releaseSubscriberNotification } from '@/modules/shop/lib/db/back-in-stock'
import { getProductMedia } from '@/modules/shop/lib/db/products'
import { sendShopEmail } from '@/modules/shop/lib/email'
import { signUnsubscribeToken } from '@/modules/shop/lib/unsubscribe-token'
import { getSiteUrl } from '@/lib/config/env'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import { productUrl as productUrlFor } from '@/modules/shop/lib/product-url'
import type { ShpProduct } from '@/modules/shop/lib/types'

const INLINE_DISPATCH_THRESHOLD = 50

// Failures in a row before the run gives up. One address the email service
// refuses is that address's problem and the rest still go; several on the trot
// means the service itself is down, and waiting on it for every remaining
// subscriber would only hold up the owner's save. Whoever is left stays
// unnotified, so they are simply sent to next time.
const MAX_FAILURES_IN_A_ROW = 3

async function dispatchNotifications(product: ShpProduct): Promise<void> {
  const subscribers = await getUnnotifiedSubscribers(product.id)
  if (subscribers.length === 0) return

  const siteUrl = getSiteUrl()
  const config = await getShopConfigCached()
  const media = await getProductMedia(product.id)
  const primary = media.find((m) => m.isPrimary) ?? media[0]
  const productUrl = productUrlFor(siteUrl, product.slug, config.productUrlStyle)

  // One subscriber at a time: claimed, sent, and released again only if the
  // send fails. The whole list used to be marked notified in one go after the
  // loop, so a failure half-way left everybody unmarked - and the next stock
  // edit emailed the first half a second time.
  let failuresInARow = 0
  for (const sub of subscribers) {
    // Already taken by a run that started alongside this one.
    if (!(await claimSubscriberForNotification(sub.id))) continue
    const unsubscribeUrl = `${siteUrl}/api/m/shop/public/back-in-stock?token=${signUnsubscribeToken(product.id, sub.email)}`
    try {
      await sendShopEmail('BACK_IN_STOCK', sub.email, {
        productName: product.name,
        productUrl,
        productImage: primary?.url ?? '',
        shopName: config.shopTitle || 'Shop',
        unsubscribeUrl,
      })
      failuresInARow = 0
    } catch (err) {
      console.error(`[shop] back-in-stock email for product ${product.id} did not send`, err)
      // Back in the queue for the next time this product comes back.
      await releaseSubscriberNotification(sub.id).catch(() => {})
      failuresInARow++
      if (failuresInARow >= MAX_FAILURES_IN_A_ROW) return
    }
  }
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
