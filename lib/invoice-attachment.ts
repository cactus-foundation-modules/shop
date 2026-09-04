import { getInvoiceForOrder } from '@/modules/shop/lib/db/invoices'
import { invoicePdfFilename, printPath } from '@/modules/shop/lib/invoice-pdf'
import { signInvoiceToken } from '@/modules/shop/lib/invoice-token'
import type { EmailAttachment } from '@/lib/email/index'
import type { ShpConfig } from '@/modules/shop/lib/config'

// The VAT invoice as a file travelling with an order email.
//
// Its own module rather than a helper inside order-status.ts, for the same
// reason renderProformaPdf has one: a route may only export HTTP methods, the
// status change is not the only thing that will ever want to post an invoice
// out, and the proforma's opposite number (order-placed-email.ts) proved the
// shape works. Everything the printer needs - the token, the page settings, the
// filename prefix - is settled here so a caller only has to know the order.

/**
 * The live invoice for an order as an email attachment, or null where there is
 * not one to send.
 *
 * Null covers every ordinary reason a shop has no file to post: the setting is
 * off, PDF printing is off, invoicing never raised one (a shop on MANUAL that
 * has not pressed the button), or the only invoice there was has been voided.
 * None of those is an error and none of them may stop the email.
 *
 * Never throws, exactly as the proforma's does not. Printing a PDF runs a
 * headless browser, which is comfortably the most likely thing in this email to
 * fall over, and a customer whose order is complete must be told so whether or
 * not the paperwork printed. The link on their own order page is still there.
 */
export async function invoiceEmailAttachment(orderId: string, config: ShpConfig): Promise<EmailAttachment | null> {
  if (!config.invoiceAttachToEmail || !config.invoicePdfEnabled) return null
  try {
    // ISSUED only, by definition of getInvoiceForOrder - a voided invoice is
    // the one document a customer must not be sent a fresh copy of.
    const invoice = await getInvoiceForOrder(orderId)
    if (!invoice) return null

    // The invoice's own page with `print=1`, printed by the same headless
    // browser the download button uses and on the same sheet, so the file in
    // the inbox and the file from the site are the same document rather than
    // two renderings that agree with each other for now. The token is minted
    // here because the browser doing the printing carries no session.
    // Both imported here rather than at the top: the document module drags in
    // Puck's RSC renderer and every block the invoice layout can hold, and a
    // status change that is not a completion has no business loading any of it.
    const [{ renderInvoicePdf }, { documentPageSetup }] = await Promise.all([
      import('@/modules/shop/lib/invoice-pdf'),
      import('@/modules/shop/lib/invoice-document'),
    ])
    const path = printPath(`/shop/invoice/${encodeURIComponent(invoice.invoiceNumber)}`, signInvoiceToken(invoice.invoiceNumber))
    // The same sheet the download button prints on - its own layout type, so a
    // shop that wants its invoices on A5 gets them on A5 in the inbox too.
    const bytes = await renderInvoicePdf(path, await documentPageSetup('shopInvoice'))
    return {
      filename: invoicePdfFilename(config.invoicePdfFilenamePrefix, invoice.invoiceNumber),
      content: Buffer.from(bytes),
      contentType: 'application/pdf',
    }
  } catch (error) {
    console.error('[shop] could not print the invoice for order', orderId, error)
    return null
  }
}
