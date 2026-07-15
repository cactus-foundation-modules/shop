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
  // 'manual' providers (bank transfer, cash) have no automated confirmation -
  // the confirm route parks the order at AWAITING_CONFIRMATION for an admin to
  // clear, rather than calling confirmPayment. Defaults to 'auto' when unset.
  confirmMode?: 'auto' | 'manual'
  // Module-contributed providers self-gate on their own env/settings so a method
  // can never reach checkout without being configured. Built-in providers are
  // gated by lib/env.ts instead; when unset the method is treated as available.
  isAvailable?(): boolean | Promise<boolean>
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
  // Confirmation is genuine but not yet final (e.g. an open-banking payment that
  // is authorised and awaiting settlement). The confirm route parks the order at
  // AWAITING_CONFIRMATION and lets the provider's webhook flip it to PAID.
  pending?: boolean
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
