import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getSessionFromCookie } from '@/lib/auth/session'
import { getMemberFromCookie } from '@/lib/members/session'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import { getInvoiceByNumber } from '@/modules/shop/lib/db/invoices'
import { getOrderById } from '@/modules/shop/lib/db/orders'
import { verifyInvoiceToken, invoicePdfPath } from '@/modules/shop/lib/invoice-token'
import { invoiceDocContext, renderInvoiceDocument } from '@/modules/shop/lib/invoice-document'
import PrintButton from '@/modules/shop/components/public/PrintButton'

export const dynamic = 'force-dynamic'

// The invoice document on its own: no site header, no footer, nothing but the
// designed document and a bar of things to do with it. Three readers - the
// customer following a link, the owner opening it from the order screen, and
// the headless browser that prints the PDF.
//
// Deliberately NOT behind the shop gate. A shop that has closed for good still
// has to be able to hand somebody their invoice, and the paperwork for a sale
// that already happened is not a shopfront.
//
// The chrome is removed by CSS rather than by opting out of a layout, because a
// module's public pages are always wrapped by core's public layout and cannot
// opt out. That layout's shape is the contract being relied on: it renders the
// page inside `<main>`, with the theme header and footer as siblings. So every
// sibling of `<main>` is hidden and `<main>` is stripped of its own spacing.
// Keyed on core's structure, never on a theme's markup, so no theme can break it.

const BARE_CSS = `
  body > *:not(main) { display: none !important; }
  body > main { display: block !important; margin: 0 !important; padding: 0 !important; }
  body { margin: 0; background: var(--color-bg, #fff); }
  .shp-inv-view { max-width: 820px; margin: 0 auto; padding: 1.5rem 1.25rem 2.5rem; }
  .shp-inv-bar { display: flex; justify-content: space-between; align-items: center; gap: 1rem; flex-wrap: wrap; margin-bottom: 1.25rem; }
  .shp-inv-bar a { color: var(--color-text-muted); text-decoration: none; font-size: 0.9375rem; }
  .shp-inv-bar a:hover { color: var(--color-text); }
  .shp-inv-actions { display: flex; gap: 0.5rem; align-items: center; }
  /* On paper the browser supplies the margins (see renderInvoicePdf), so the
     page wrapper stops adding its own on top of them. */
  @media print {
    body { background: #fff; }
    .shp-inv-view { max-width: none; padding: 0; }
    .no-print { display: none !important; }
  }
`

export async function generateMetadata({ params }: { params: Promise<{ number: string }> }): Promise<Metadata> {
  const { number } = await params
  return {
    title: `Invoice ${decodeURIComponent(number)}`,
    // Somebody's name, address and what they bought. Never in a search index.
    robots: { index: false, follow: false },
  }
}

export default async function ShopInvoicePage({
  params,
  searchParams,
}: {
  params: Promise<{ number: string }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const { number: raw } = await params
  const invoiceNumber = decodeURIComponent(raw)
  const invoice = await getInvoiceByNumber(invoiceNumber)
  if (!invoice) notFound()

  const query = (await searchParams) ?? {}
  const token = typeof query.t === 'string' ? query.t : null
  const print = query.print === '1'

  // Three ways in, in the order they cost anything to check: the signed link
  // (no session, no query), the member whose order it is, and a staff session.
  // Anything else is a 404 rather than a 403 - an invoice number is sequential,
  // so "wrong token" and "not yours" must look identical from outside.
  let allowed = verifyInvoiceToken(invoice.invoiceNumber, token)
  if (!allowed) {
    const [member, user] = await Promise.all([getMemberFromCookie(), getSessionFromCookie()])
    if (member) {
      const order = await getOrderById(invoice.orderId)
      allowed = Boolean(order?.memberId && order.memberId === member.id)
    }
    if (!allowed && user) allowed = true
  }
  if (!allowed) notFound()

  const config = await getShopConfigCached()
  const document = await renderInvoiceDocument(invoiceDocContext(invoice, { print }))

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: BARE_CSS }} />
      <div className="shp-inv-view">
        {!print && (
          <div className="shp-inv-bar no-print">
            <span />
            <div className="shp-inv-actions">
              <PrintButton label="Print" />
              {config.invoicePdfEnabled && (
                <a
                  className="btn btn-secondary"
                  href={invoicePdfPath(invoice.invoiceNumber)}
                >
                  Download PDF
                </a>
              )}
            </div>
          </div>
        )}
        {document}
      </div>
    </>
  )
}
