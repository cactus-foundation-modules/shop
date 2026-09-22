import { getOrderById, getOrderItems, addOrderNote, listOrderNotes } from '@/modules/shop/lib/db/orders'
import { listRefundsForOrder, processRefund } from '@/modules/shop/lib/db/refunds'
import { creditNoteForSettledRefund } from '@/modules/shop/lib/credit-notes'
import { requestRefundLines, withinRemaining } from '@/modules/shop/lib/request-refund-lines'
import { refundableDelivery } from '@/modules/shop/lib/refund-delivery'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import { formatMoney } from '@/modules/shop/lib/money'

// A refund somebody made in the payment provider's own dashboard, arriving here
// by webhook.
//
// The provider reports the money - how much it has refunded on the payment in
// total - and nothing about which items it was for. Before this the shop only
// moved the order's status, so a refund made in Stripe put nothing back in
// stock, raised no credit note and left the books holding the whole sale.
//
// What the shop has already recorded is taken off first: its own refunds (and
// the ones still in flight) come back through the same webhook, and must not be
// recorded twice. Whatever is left is money that went back outside the shop.
//
//  - All of the payment refunded: there is no question which items it was for.
//    It is recorded as a refund of everything still unrefunded, delivery
//    included, without asking the provider for anything - so stock, the credit
//    note and the books follow exactly as they would for the Refund button.
//  - Some of it: the shop cannot know which items, and guessing is how stock
//    and VAT go wrong. The owner is told, on the order, how to record it -
//    Refund, with "Already refunded" ticked.

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

/** Who the refund row names as having made it, where no person did. */
const PROVIDER_CREATED_BY = 'provider-dashboard'

export type ProviderRefundOutcome = 'recorded' | 'noted' | 'nothing' | 'busy'

export async function recordRefundMadeAtProvider(
  orderId: string,
  report: { refundedTotal: number; full: boolean; providerLabel: string },
): Promise<ProviderRefundOutcome> {
  const order = await getOrderById(orderId)
  if (!order || !(report.refundedTotal > 0)) return 'nothing'

  const [items, refunds] = await Promise.all([getOrderItems(orderId), listRefundsForOrder(orderId)])
  const recorded = refunds
    .filter((refund) => refund.status === 'COMPLETED' || refund.status === 'PENDING')
    .reduce((sum, refund) => sum + Number(refund.amount), 0)
  const outside = round2(report.refundedTotal - recorded)
  // The shop's own refund coming back to it, or pennies of rounding.
  if (outside <= 0.01) return 'nothing'

  if (report.full) {
    const delivery = Math.min(refundableDelivery(order, items, refunds), outside)
    const lines = withinRemaining(requestRefundLines({ items: [] }, items, order), round2(outside - delivery))
    if (lines.length > 0 || delivery > 0) {
      const outcome = await processRefund({
        orderId,
        reason: `Refunded in ${report.providerLabel}'s own dashboard`,
        createdBy: PROVIDER_CREATED_BY,
        items: lines,
        shippingAmount: delivery,
        // Nothing to send: the provider has already sent it.
        performRefund: async () => ({ success: true, providerRefundId: null }),
      })
      if (!outcome.ok) {
        // Another refund on this order is being recorded right now; the
        // provider will send this again, and it will be recorded then.
        if (outcome.status === 409) return 'busy'
        console.error('[shop] could not record a refund made at the provider', orderId, outcome.error)
      } else if (outcome.success) {
        await creditNoteForSettledRefund(outcome.refundId)
        return 'recorded'
      }
    }
  }

  const config = await getShopConfigCached()
  const note =
    `${formatMoney(outside, config.currencySymbol)} was refunded in ${report.providerLabel}'s own dashboard. ` +
    `${report.providerLabel} does not say which items it was for, so the items, the stock and the paperwork on this order have not changed. ` +
    'Use Refund on this order and tick "Already refunded" to record which items it covered.'
  // The provider sends this more than once; one note per refund is plenty.
  const notes = await listOrderNotes(orderId)
  if (!notes.some((existing) => existing.content === note)) await addOrderNote(orderId, note, true, null)
  return 'noted'
}
