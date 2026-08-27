import { signProformaToken } from '@/modules/shop/lib/invoice-token'
import { printPath, renderInvoicePdf } from '@/modules/shop/lib/invoice-pdf'
import { documentPageSetup } from '@/modules/shop/lib/invoice-document'

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
  // The paper and margins the proforma layout's page settings ask for. Its own
  // layout type, so its own sheet: a proforma an owner wants on A5 has nothing
  // to do with the invoice that follows it.
  return renderInvoicePdf(path, await documentPageSetup('shopProforma'))
}
