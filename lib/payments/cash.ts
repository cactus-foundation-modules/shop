import { getShopConfigCached } from '@/modules/shop/lib/config'
import type { ShpOrderDraft, ShpPaymentIntent, ShpPaymentProvider, ShpPaymentResult, ShpRefundRequest, ShpRefundResult } from '@/modules/shop/lib/payments/provider'

async function createIntent(_order: ShpOrderDraft): Promise<ShpPaymentIntent> {
  const config = await getShopConfigCached()
  return { instructions: config.cashInstructions }
}

async function confirmPayment(): Promise<ShpPaymentResult> {
  return { success: false, error: 'Cash payments are confirmed manually by an admin.' }
}

async function refundOrder(_refund: ShpRefundRequest): Promise<ShpRefundResult> {
  return { success: false, error: 'Cash refunds must be processed manually outside Cactus.' }
}

export const cashProvider: ShpPaymentProvider = {
  id: 'CASH',
  label: 'Cash',
  createIntent,
  confirmPayment,
  refundOrder,
}
