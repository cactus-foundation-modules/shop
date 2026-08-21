import { getShopConfigCached } from '@/modules/shop/lib/config'
import type { ShpOrderDraft, ShpPaymentIntent, ShpPaymentProvider, ShpPaymentResult, ShpRefundRequest, ShpRefundResult } from '@/modules/shop/lib/payments/provider'

async function createIntent(_order: ShpOrderDraft): Promise<ShpPaymentIntent> {
  const config = await getShopConfigCached()
  // Same reasoning as bank transfer: kept off the wire, not merely off screen.
  if (!config.cashInstructionsOnCheckout) return {}
  return { instructions: config.cashInstructions }
}

async function confirmPayment(_order: ShpOrderDraft, _payload: unknown): Promise<ShpPaymentResult> {
  return { success: false, error: 'Cash payments are confirmed manually by an admin.' }
}

// Records the refund; it does not move the money, because nothing here can.
// Whoever pressed the button still has to send it. Returning a refusal instead
// - which is what this did until a shop taking mostly cash tried to refund
// somebody - left the shop unable to record a refund at all: the quantities
// stayed put, the order kept its old status, the books kept the whole sale and
// no credit note was raised, while the modal cheerfully said it had been
// recorded. See `refundMode` on ShpPaymentProvider.
async function refundOrder(_refund: ShpRefundRequest): Promise<ShpRefundResult> {
  return { success: true }
}

export const cashProvider: ShpPaymentProvider = {
  id: 'CASH',
  label: 'Cash',
  confirmMode: 'manual',
  refundMode: 'manual',
  createIntent,
  confirmPayment,
  refundOrder,
}
