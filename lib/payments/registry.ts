import { stripeProvider } from '@/modules/shop/lib/payments/stripe'
import { paypalProvider } from '@/modules/shop/lib/payments/paypal'
import { bankTransferProvider } from '@/modules/shop/lib/payments/bank-transfer'
import { cashProvider } from '@/modules/shop/lib/payments/cash'
import type { ShpPaymentMethod } from '@/modules/shop/lib/types'
import type { ShpPaymentProvider } from '@/modules/shop/lib/payments/provider'

export const paymentProviders: Record<ShpPaymentMethod, ShpPaymentProvider> = {
  STRIPE: stripeProvider,
  PAYPAL: paypalProvider,
  BANK_TRANSFER: bankTransferProvider,
  CASH: cashProvider,
}
