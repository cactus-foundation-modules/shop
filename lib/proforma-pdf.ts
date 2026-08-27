import { signProformaToken } from '@/modules/shop/lib/invoice-token'
import { printPath, renderInvoicePdf } from '@/modules/shop/lib/invoice-pdf'

/**
 * One proforma printed to PDF bytes.
 *
 * The proforma's own page with `print=1`, printed by the same headless browser
 * the invoice uses - so the file and the page are the same document rather than
 * two renderings that agree with each other for now. The token is minted here
 * rather than passed in: the browser doing the printing carries no session.
 *
 * Its own file rather than an export from the PDF route, because a route module
 * may only export HTTP methods, and both the route and the "how to pay" email
 * need these bytes.
 */
export async function renderProformaPdf(orderNumber: string): Promise<Uint8Array> {
  const path = printPath(`/shop/proforma/${encodeURIComponent(orderNumber)}`, signProformaToken(orderNumber))
  return renderInvoicePdf(path)
}
