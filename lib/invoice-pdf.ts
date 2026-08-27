import { renderDocumentPdf, documentPdfFilename } from '@/lib/documents/pdf'
import type { DocPageSetup } from '@/modules/shop/lib/doc-page-settings'

// Turning the invoice document into a PDF.
//
// The machinery is core's (lib/documents/pdf.ts): the headless browser, the
// serverless-versus-local chromium split, the cache-busting nonce on the print
// URL, the running-footer capture and the empty header template Chrome insists
// on. It was written here first and then copied, line for line, into Quote for
// Shop - which is precisely why it is not here any more.
//
// What is left is the shop's own share of it: which document is being printed,
// and the one rule the footer template needs about this module's own class
// names, which core has never heard of and should not.

export { printPath } from '@/lib/documents/pdf'

/** Kept under its old name because the PDF routes catch it by name and this
 *  module is pinned separately from core. It IS core's class, not a subclass, so
 *  `instanceof` still answers for anything core throws. */
export { DocumentPdfUnavailableError as InvoicePdfUnavailableError } from '@/lib/documents/pdf'

/**
 * The footer template is a document of its own, and these blocks sit directly
 * under its body rather than inside an invoice. Their top margin is spacing
 * between sections of a document; in the template there is no document above
 * them to be spaced from, so it comes off.
 *
 * Here rather than in core's reset because `.shp-inv-*` is this module's
 * business. Injected between core's reset and the footer region's own
 * stylesheets, exactly where it used to sit.
 */
const FOOTER_CSS = `
.cactus-pdf-footer .shp-inv-footer, .cactus-pdf-footer .shp-inv-notice { margin-top: 0; }
`

/**
 * Prints one invoice to PDF bytes.
 *
 * `path` is a site-relative URL (the invoice's own page, token and all). It is
 * fetched over HTTP from the site's own address rather than rendered in-process,
 * because that is the only way to be certain the PDF and the page agree - and
 * because a Puck layout of async server components cannot be rendered to a
 * string by hand.
 */
export async function renderInvoicePdf(path: string, setup?: DocPageSetup): Promise<Uint8Array> {
  return renderDocumentPdf({ path, pageSetup: setup, footerCss: FOOTER_CSS, label: 'invoice' })
}

/** The filename a browser saves it as. */
export function invoicePdfFilename(prefix: string, invoiceNumber: string): string {
  return documentPdfFilename(prefix, invoiceNumber, 'invoice')
}
