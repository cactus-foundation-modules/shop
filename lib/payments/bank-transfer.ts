import { getShopConfigCached } from '@/modules/shop/lib/config'
import type { ShpOrderDraft, ShpPaymentIntent, ShpPaymentProvider, ShpPaymentResult, ShpRefundRequest, ShpRefundResult } from '@/modules/shop/lib/payments/provider'

async function createIntent(_order: ShpOrderDraft): Promise<ShpPaymentIntent> {
  const config = await getShopConfigCached()
  return { instructions: config.bankTransferInstructions }
}

// No-op - admin manually confirms via the order detail page once the
// transfer clears (POST /admin/orders/[id]/confirm-payment).
async function confirmPayment(_order: ShpOrderDraft, _payload: unknown): Promise<ShpPaymentResult> {
  return { success: false, error: 'Bank transfer payments are confirmed manually by an admin.' }
}

async function refundOrder(_refund: ShpRefundRequest): Promise<ShpRefundResult> {
  return { success: false, error: 'Bank transfer refunds must be processed manually outside Cactus.' }
}

export const bankTransferProvider: ShpPaymentProvider = {
  id: 'BANK_TRANSFER',
  label: 'Bank transfer',
  confirmMode: 'manual',
  createIntent,
  confirmPayment,
  refundOrder,
}
