import { getShopConfigCached } from '@/modules/shop/lib/config'
import { bankTransferLogo } from '@/modules/shop/lib/payments/logos'
import type { ShpOrderDraft, ShpPaymentIntent, ShpPaymentProvider, ShpPaymentResult, ShpRefundRequest, ShpRefundResult } from '@/modules/shop/lib/payments/provider'

async function createIntent(_order: ShpOrderDraft): Promise<ShpPaymentIntent> {
  const config = await getShopConfigCached()
  // Withheld here rather than hidden in the browser: an owner who does not want
  // their bank details on the checkout page would not want them sitting in that
  // page's network response either. The thank-you page and the shopper's own
  // order page read the same setting's words straight from shop settings, so
  // switching this off costs the shopper nothing for as long as there is still a
  // transfer to make - which is the whole window either of those pages prints
  // them in, since both drop the details once the payment is marked as arrived.
  if (!config.bankTransferInstructionsOnCheckout) return {}
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
  description: 'Pay straight from your bank account. We send the account details with your order.',
  logo: bankTransferLogo,
  confirmMode: 'manual',
  createIntent,
  confirmPayment,
  refundOrder,
}
