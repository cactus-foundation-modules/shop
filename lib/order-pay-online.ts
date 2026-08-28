// Settling an order that has already been placed.
//
// A shop that takes bank transfer hands the customer an order, a set of bank
// details and a wait. That is fine as far as it goes, and plenty of business
// buyers want exactly it - but a good number of the people who choose it are
// choosing it at the checkout, on a phone, without their banking app to hand,
// and then never get round to the transfer at all. The shop chases, the order
// sits, and both sides lose a fortnight over a payment neither of them objects
// to making.
//
// So the customer's own order page offers the automated methods this shop
// already takes: pay it now by card, or by instant bank payment, from the page
// they are already looking at. Nothing is taken away - the bank details stay put
// for as long as the money is owed, because the whole point of the method is
// that some people genuinely want it.
//
// What this file decides is only WHETHER and WHICH. The routes under
// app/api/public/orders/[id]/pay do the taking.
import { getShopConfigCached, getAvailablePaymentMethods, type ShpConfig } from '@/modules/shop/lib/config'
import {
  getPaymentProvider, getAllPaymentProviders, resolveProviderLabel, resolvePaymentMethodDescriptions,
} from '@/modules/shop/lib/payments/registry'
import { paymentOutstanding } from '@/modules/shop/lib/payment-instructions'
import type { ShpPaymentLogo } from '@/modules/shop/lib/payments/provider'
import type { ShpOrder } from '@/modules/shop/lib/types'

/** Enough of an order to decide any of this. Kept narrow so the checks can be
 *  reasoned about (and tested) without a whole order row. */
export type PayableOrder = Pick<
  ShpOrder, 'status' | 'paymentStatus' | 'paymentMethod' | 'originalPaymentMethod'
>

/** One method on offer, in the shape the order page draws it. */
export type PayOnlineMethod = {
  id: string
  label: string
  description: string | null
  logo: ShpPaymentLogo | null
}

/**
 * The method this order should be DESCRIBED by, as against the one that will
 * settle it.
 *
 * While the money is still owed, that is the method the customer chose at
 * checkout: their bank details belong on the page for as long as a transfer is
 * one of the things they might do, even after they have started - and abandoned
 * - a card payment which moved `paymentMethod` on. Once it is paid, the honest
 * answer is whichever method actually paid it, because that is what happened.
 */
export function settlementMethod(order: PayableOrder): string {
  if (order.paymentStatus === 'PAID') return order.paymentMethod
  return order.originalPaymentMethod ?? order.paymentMethod
}

/** Whether this order is one the offer could apply to at all: money still owed,
 *  on a method that was never going to collect it by itself. Says nothing about
 *  whether any method is actually available to settle it with - see
 *  payOnlineMethodsForOrder for that. */
export async function orderAcceptsOnlinePayment(order: PayableOrder, config: ShpConfig): Promise<boolean> {
  if (!config.payOnlineOnOrderPage) return false
  if (!paymentOutstanding(order)) return false
  // Only a method somebody has to go and act on. An order on an automated method
  // that is merely sitting at AWAITING_CONFIRMATION has a payment in flight, and
  // inviting a second one would be inviting a double charge.
  const placed = getPaymentProvider(settlementMethod(order))
  return placed?.confirmMode === 'manual'
}

/**
 * The methods this order can be settled with right now, in the order the owner
 * arranged them on the Payments tab.
 *
 * A method has to be three things: switched on and configured for this shop
 * (exactly as at checkout), automated - there is no sense in offering to settle
 * a bank transfer with a different bank transfer - and willing to take payment
 * for an order that already exists, which is a promise the provider makes for
 * itself (see `settlesExistingOrder`). Empty is a perfectly ordinary answer, and
 * means the page shows what it always showed.
 */
export async function payOnlineMethodsForOrder(
  order: PayableOrder,
  config: ShpConfig,
): Promise<PayOnlineMethod[]> {
  if (!(await orderAcceptsOnlinePayment(order, config))) return []

  const available = await getAvailablePaymentMethods()
  const placed = settlementMethod(order)
  const descriptions = resolvePaymentMethodDescriptions(config.paymentMethodDescriptions)
  const hidden = config.hiddenPaymentMethodLogos

  const offered = getAllPaymentProviders().filter((provider) =>
    provider.settlesExistingOrder === true &&
    provider.confirmMode !== 'manual' &&
    provider.id !== placed &&
    available.includes(provider.id)
  )

  const labels = await Promise.all(offered.map((provider) => resolveProviderLabel(provider)))

  // getAvailablePaymentMethods already sorts by the owner's arrangement, so the
  // offer reads the same way round as the checkout does.
  return available
    .map((id) => {
      const at = offered.findIndex((provider) => provider.id === id)
      if (at < 0) return null
      const provider = offered[at]!
      return {
        id: provider.id,
        label: labels[at] ?? provider.label,
        description: descriptions[provider.id] ?? null,
        logo: provider.logo && !hidden.includes(provider.id) ? provider.logo : null,
      }
    })
    .filter((method): method is PayOnlineMethod => method !== null)
}

/** The one-call form the pay routes use: is this order still payable, and is
 *  this the method to pay it with? Re-asked on every request rather than trusted
 *  from the page that drew the button, because the page may have been sitting
 *  open since before the owner switched the method off. */
export async function assertPayableOnline(
  order: PayableOrder,
  method: string,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const config = await getShopConfigCached()
  if (!config.payOnlineOnOrderPage) {
    return { ok: false, status: 403, error: 'This shop does not take payment for an order after it has been placed.' }
  }
  if (!paymentOutstanding(order)) {
    return { ok: false, status: 409, error: 'There is nothing left to pay on this order.' }
  }
  if (!(await orderAcceptsOnlinePayment(order, config))) {
    return { ok: false, status: 409, error: 'This order cannot be paid for online.' }
  }
  const methods = await payOnlineMethodsForOrder(order, config)
  if (!methods.some((candidate) => candidate.id === method)) {
    return { ok: false, status: 400, error: 'That way of paying is not available for this order.' }
  }
  return { ok: true }
}
