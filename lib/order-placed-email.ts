import { escapeHtml } from '@/lib/email/blocks'
import { getSiteUrl } from '@/lib/config/env'
import { getOrderItems } from '@/modules/shop/lib/db/orders'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import { notifyOrderCustomer } from '@/modules/shop/lib/order-notify'
import { customerReferenceVars, sendShopEmail } from '@/modules/shop/lib/email'
import { getPaymentProvider, resolveProviderLabel } from '@/modules/shop/lib/payments/registry'
import { manualPaymentInstructions } from '@/modules/shop/lib/payment-instructions'
import { proformaAvailable } from '@/modules/shop/lib/proforma'
import { invoicePdfFilename } from '@/modules/shop/lib/invoice-pdf'
import type { EmailAttachment } from '@/lib/email/index'
import { formatMoney } from '@/modules/shop/lib/money'
import type { ShpOrder } from '@/modules/shop/lib/types'
import type { ShpConfig } from '@/modules/shop/lib/config'

// The email a shopper gets when they finish checking out on a method nobody has
// been paid on yet - bank transfer, cash, or any other method a module
// contributes with confirmMode 'manual'.
//
// Every other method sends ORDER_CONFIRMED the moment the money lands, seconds
// later, so it doubles as the "we have your order" note. On a manual method the
// money might land next week, which used to leave the shopper with nothing in
// their inbox at all: the bank details were on the thank-you page and nowhere
// else, and the one thing they needed a week later was the one thing they could
// not find. See lib/order-fulfillment.ts for the other half of the pair.

/**
 * The proforma as a file to travel with the email, or null where there is not
 * one to send.
 *
 * This email is the whole reason the attachment exists. A business ordering on
 * bank transfer forwards it to whoever actually presses the button at their
 * bank, and that person very often will not release the money without a document
 * to file against it - so a link they have to click, on a page they have to be
 * shown, is a step too many. The file is the thing.
 *
 * Never throws, and a failure is only logged. Printing a PDF runs a headless
 * browser, which is easily the most likely thing in this email to fall over, and
 * a customer who ordered something must be told their order was placed whether
 * or not the paperwork printed. The link on their own order page is still there.
 */
async function proformaAttachment(order: ShpOrder, config: ShpConfig): Promise<EmailAttachment | null> {
  if (!config.proformaAttachToEmail || !config.invoicePdfEnabled) return null
  if (!proformaAvailable(config, order)) return null
  try {
    const { renderProformaPdf } = await import('@/modules/shop/lib/proforma-pdf')
    const bytes = await renderProformaPdf(order.orderNumber)
    return {
      filename: invoicePdfFilename(config.proformaPdfFilenamePrefix, order.orderNumber),
      content: Buffer.from(bytes),
      contentType: 'application/pdf',
    }
  } catch (error) {
    console.error('[shop] could not print the proforma for order', order.orderNumber, error)
    return null
  }
}

function formatAddress(address: { line1: string; line2?: string; city: string; postcode: string; country: string }): string {
  return [address.line1, address.line2, address.city, address.postcode, address.country].filter(Boolean).join(', ')
}

/**
 * Tells the customer their order is placed and how to pay for it, and tells the
 * owner an order has arrived that nobody has been paid for.
 *
 * Nothing here throws: an order that is genuinely placed must not be undone by
 * an email that would not send, and the thank-you page still carries the same
 * instructions either way.
 */
export async function announceOrderAwaitingPayment(order: ShpOrder): Promise<void> {
  try {
    const config = await getShopConfigCached()
    const items = await getOrderItems(order.id)
    const siteUrl = getSiteUrl()

    const itemsList = items.map((i) => {
      const base = `${i.productName} x${i.quantity} - ${formatMoney(i.total, config.currencySymbol)}`
      const extras = i.lineMeta?.fields?.length
        ? '\n' + i.lineMeta.fields.map((f) => `    ${f.label}: ${f.value}`).join('\n')
        : ''
      return base + extras
    }).join('\n')

    // Owner-typed, and bank details are the one merge value in the shop that is
    // useless as a single run-on line. Escaped here and turned into real breaks,
    // which is why `paymentInstructions` is a rawTag on the template - the
    // interpolator must not escape our own <br> back into view.
    const rawInstructions = manualPaymentInstructions(order.paymentMethod, config)
    const paymentInstructions = rawInstructions
      ? escapeHtml(rawInstructions).replace(/\r?\n/g, '<br />')
      : ''

    const provider = getPaymentProvider(order.paymentMethod)
    const paymentMethod = provider ? await resolveProviderLabel(provider) : order.paymentMethod
    const preOrderItem = items.find((i) => i.isPreOrder)

    const proforma = await proformaAttachment(order, config)

    await notifyOrderCustomer('ORDER_PLACED_UNPAID', order, {
      orderNumber: order.orderNumber,
      customerName: order.customerName,
      customerEmail: order.customerEmail,
      orderTotal: formatMoney(order.total, config.currencySymbol),
      orderItems: itemsList,
      shippingAddress: formatAddress(order.shippingAddress),
      paymentMethod,
      paymentInstructions,
      hasPaymentInstructions: paymentInstructions ? 'true' : 'false',
      hasPreOrderItems: preOrderItem ? 'true' : 'false',
      preOrderItemName: preOrderItem?.productName ?? '',
      preOrderDispatchDate: preOrderItem?.preOrderDispatchDate?.toLocaleDateString('en-GB') ?? '',
      ...customerReferenceVars(order, config),
      shopName: config.shopTitle || 'Shop',
      shopUrl: `${siteUrl}/shop`,
    }, proforma ? { attachments: [proforma] } : undefined)

    // And the owner's own copy. On every other method this alert goes out of
    // fulfillPaidOrder when the money lands, seconds after the order; on a
    // manual one that could be next week, which left a real order sitting in
    // the list with nothing to say it had arrived. Its opposite number in
    // fulfilment stands down for manual methods so this is not sent twice -
    // and the second one would land while the owner was looking at the order,
    // having just pressed the button that sent it.
    const adminAlertEmail = config.adminOrderAlertEmail || config.storeEmail
    if (adminAlertEmail) {
      await sendShopEmail('ADMIN_NEW_ORDER_UNPAID', adminAlertEmail, {
        orderNumber: order.orderNumber,
        customerName: order.customerName,
        customerEmail: order.customerEmail,
        orderTotal: formatMoney(order.total, config.currencySymbol),
        orderItems: itemsList,
        paymentMethod,
        ...customerReferenceVars(order, config),
        shopName: config.shopTitle || 'Shop',
        shopUrl: `${siteUrl}/shop`,
      })
    }
  } catch (error) {
    console.error('[shop] could not send the order-placed email for order', order.id, error)
  }
}
