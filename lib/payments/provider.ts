// PROTECTED - payment provider integration (spec section 7).
import type { ShpPaymentMethod, ShpPaymentStatus } from '@/modules/shop/lib/types'

export type ShpOrderDraft = {
  orderId: string
  orderNumber: string
  amount: number // major currency units, e.g. 19.99
  currency: string
  customerEmail: string
  customerName: string
}

export interface ShpPaymentProvider {
  id: ShpPaymentMethod
  label: string
  createIntent(order: ShpOrderDraft): Promise<ShpPaymentIntent>
  // order carries amount/currency so providers can re-validate what was actually
  // charged against what the order costs - never trust payload alone (spec 7).
  confirmPayment(order: ShpOrderDraft, payload: unknown): Promise<ShpPaymentResult>
  refundOrder(refund: ShpRefundRequest): Promise<ShpRefundResult>
  handleWebhook?(req: Request): Promise<ShpWebhookResult>
}

export type ShpPaymentIntent = {
  clientSecret?: string // Stripe
  approvalUrl?: string // PayPal
  instructions?: string // Bank transfer / cash
  providerOrderId?: string
}

export type ShpPaymentResult = {
  success: boolean
  providerReference?: string
  error?: string
}

export type ShpRefundRequest = {
  providerReference: string
  amount: number
  currency: string
  items: Array<{ name: string; quantity: number; amount: number }>
}

export type ShpRefundResult = {
  success: boolean
  providerRefundId?: string
  error?: string
}

export type ShpWebhookResult = {
  orderId?: string
  status?: ShpPaymentStatus
  providerReference?: string
  error?: string
}
