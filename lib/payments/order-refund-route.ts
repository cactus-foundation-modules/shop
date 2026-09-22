import { getPaymentProvider } from '@/modules/shop/lib/payments/registry'
import type { ShpPaymentProvider } from '@/modules/shop/lib/payments/provider'
import type { ShpOrderKind } from '@/modules/shop/lib/types'

// Where the refund on an order goes: the part of a payment provider that the
// refund button, the refund modal's wording and the stale-refund reconciler
// each need, and nothing else.
export type OrderRefundRoute = Pick<ShpPaymentProvider, 'label' | 'refundMode' | 'refundOrder' | 'getRefundStatus'>

// A replacement part is born settled (lib/replacements.ts): a charged one is
// billed between the shop and the customer, off the order, and only carries its
// parent's payment method as a label. No provider ever took money for it, so
// there is no payment reference and nothing at Stripe or PayPal to refund.
// Sending its refund to the parent's provider was refused outright ("no payment
// reference to refund against"), which left the shop no way to record giving
// the money back - no credit note, no quantities off, the books still holding
// the charge. So it is recorded the way bank transfer and cash are: the refund
// is written down and the money is the shop's to send.
const BILLED_OFF_ORDER: OrderRefundRoute = {
  label: 'This replacement part',
  refundMode: 'manual',
  refundOrder: async () => ({ success: true }),
}

export function refundRouteForOrder(order: { kind: ShpOrderKind; paymentMethod: string }): OrderRefundRoute | undefined {
  if (order.kind === 'REPLACEMENT') return BILLED_OFF_ORDER
  return getPaymentProvider(order.paymentMethod)
}
