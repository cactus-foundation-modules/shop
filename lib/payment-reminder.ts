import { escapeHtml } from '@/lib/email/blocks'
import { getSiteUrl } from '@/lib/config/env'
import { addOrderNote, getOrderById } from '@/modules/shop/lib/db/orders'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import { customerReferenceVars, orderTrackingVars, renderShopEmail, sendShopEmail } from '@/modules/shop/lib/email'
import { formatMoney } from '@/modules/shop/lib/money'
import { manualPaymentInstructions, paymentOutstanding } from '@/modules/shop/lib/payment-instructions'
import { getPaymentProvider, resolveProviderLabel } from '@/modules/shop/lib/payments/registry'

// The nudge for a bank transfer or cash order that is still unpaid, sent by a
// person pressing a button on the order screen. Never automatic: whether it is
// time to chase is the owner's call, made after looking at the bank account.
//
// Two things end up on the order's timeline: the email itself (the order email
// log, which every customer email goes through) and a note saying who sent it,
// because the log records that it went but not who asked.

export type SendPaymentReminderResult =
  | { ok: true }
  | { ok: false; status: number; error: string }

export async function sendPaymentReminder(orderId: string, userId: string | null): Promise<SendPaymentReminderResult> {
  const order = await getOrderById(orderId)
  if (!order) return { ok: false, status: 404, error: 'Order not found' }
  if (!paymentOutstanding(order)) {
    return { ok: false, status: 409, error: 'This order is not waiting on a payment, so there is nothing to remind the customer about.' }
  }

  const config = await getShopConfigCached()
  // As the "how to pay" email does: the method the order was placed with, since
  // a customer may have started a card payment and abandoned it for a transfer.
  const method = order.originalPaymentMethod ?? order.paymentMethod
  if (method !== 'BANK_TRANSFER' && method !== 'CASH') {
    return { ok: false, status: 400, error: 'Payment reminders are for bank transfer and cash orders.' }
  }

  const rawInstructions = manualPaymentInstructions(method, config)
  const paymentInstructions = rawInstructions ? escapeHtml(rawInstructions).replace(/\r?\n/g, '<br />') : ''
  const provider = getPaymentProvider(method)
  const paymentMethod = provider ? await resolveProviderLabel(provider) : method

  const vars: Record<string, string> = {
    ...orderTrackingVars(order, config),
    orderNumber: order.orderNumber,
    customerName: order.customerName,
    orderDate: order.createdAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
    orderTotal: formatMoney(order.total, config.currencySymbol),
    paymentMethod,
    paymentInstructions,
    hasPaymentInstructions: paymentInstructions ? 'true' : 'false',
    ...customerReferenceVars(order, config),
    shopName: config.shopTitle || 'Shop',
    shopUrl: `${getSiteUrl()}/shop`,
  }

  // sendShopEmail quietly sends nothing for an email the owner has switched off,
  // which is right for an automatic message and wrong for a button somebody just
  // pressed: they would be told it went.
  if (!(await renderShopEmail('PAYMENT_REMINDER', vars))) {
    return { ok: false, status: 409, error: 'The Payment reminder email is switched off in Settings > Emails, so nothing was sent.' }
  }

  try {
    await sendShopEmail('PAYMENT_REMINDER', order.customerEmail, vars, { orderId: order.id })
  } catch (err) {
    // sendShopEmail has already put the failure on the order's timeline.
    console.error('[shop] could not send the payment reminder for order', order.id, err)
    return { ok: false, status: 502, error: 'The email service would not send that reminder. The order’s activity has the details.' }
  }

  await addOrderNote(order.id, `Payment reminder emailed to ${order.customerEmail}.`, true, userId).catch((err) => {
    console.error('[shop] could not note the payment reminder on order', order.id, err)
  })
  return { ok: true }
}
