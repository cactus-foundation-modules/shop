import { flagOrderForAttention, getOrderById } from '@/modules/shop/lib/db/orders'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import { paidAmountMismatchNote, type PaidAmount } from '@/modules/shop/lib/payments/webhook-amount'

/**
 * Hold an order a payment webhook has just marked paid, if the money the
 * provider reports is not the order's total in the order's currency - and say
 * why, on the order. See lib/payments/webhook-amount.ts for why the payment is
 * recorded all the same rather than refused.
 *
 * Called only on the webhook that actually moved the order to paid, so a
 * replayed event cannot write the note twice. Never throws: the payment is
 * recorded by the time this runs, and a check that could fail the webhook would
 * only have the provider retry an event that no longer changes anything.
 */
export async function holdIfPaidAmountDisagrees(orderId: string, paid: PaidAmount | undefined): Promise<void> {
  if (!paid) return
  try {
    const order = await getOrderById(orderId)
    if (!order) return
    const config = await getShopConfigCached()
    const note = paidAmountMismatchNote(order, paid, config.currencySymbol)
    if (note) await flagOrderForAttention(orderId, note, { hold: true })
  } catch (err) {
    console.error('[shop] could not check a webhook payment against its order', orderId, err)
  }
}
