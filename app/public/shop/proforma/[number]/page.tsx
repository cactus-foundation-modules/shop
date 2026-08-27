import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getSessionFromCookie } from '@/lib/auth/session'
import { getMemberFromCookie } from '@/lib/members/session'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import { verifyProformaToken, proformaPdfPath } from '@/modules/shop/lib/invoice-token'
import { loadProforma, proformaDocContext } from '@/modules/shop/lib/proforma'
import { renderProformaDocument } from '@/modules/shop/lib/proforma-document'
import { renderDocumentRunningFooter } from '@/modules/shop/lib/invoice-document'
import { PdfFooterRegion } from '@/modules/shop/lib/doc-page-settings'
import PrintButton from '@/modules/shop/components/public/PrintButton'

export const dynamic = 'force-dynamic'

// The proforma on its own page: no site header, no footer, nothing but the
// document and a bar of things to do with it. Same three readers as the invoice
// - the customer following a link, the owner opening it from the order screen,
// and the headless browser that prints the PDF - and the same reasoning for
// every decision here, so see app/public/shop/invoice/[number]/page.tsx for the
// long version of why the chrome is stripped with CSS.
//
// One difference worth naming: this is keyed on the ORDER number, not on a
// document number of its own. An order number appears in every email the shop
// sends, so it is no lock at all and the signed token is doing the whole job.

const BARE_CSS = `
  body > *:not(main) { display: none !important; }
  body > main { display: block !important; margin: 0 !important; padding: 0 !important; }
  body { margin: 0; background: var(--color-bg, #fff); }
  .shp-inv-view { max-width: 820px; margin: 0 auto; padding: 1.5rem 1.25rem 2.5rem; }
  .shp-inv-bar { display: flex; justify-content: space-between; align-items: center; gap: 1rem; flex-wrap: wrap; margin-bottom: 1.25rem; }
  .shp-inv-bar a { color: var(--color-text-muted); text-decoration: none; font-size: 0.9375rem; }
  .shp-inv-bar a:hover { color: var(--color-text); }
  .shp-inv-actions { display: flex; gap: 0.5rem; align-items: center; }
  @media print {
    body { background: #fff; }
    .shp-inv-view { max-width: none; padding: 0; }
    .no-print { display: none !important; }
  }
`

export async function generateMetadata({ params }: { params: Promise<{ number: string }> }): Promise<Metadata> {
  const { number } = await params
  return {
    title: `Proforma ${decodeURIComponent(number)}`,
    // Somebody's name, address and what they have ordered. Never in a search index.
    robots: { index: false, follow: false },
  }
}

export default async function ShopProformaPage({
  params,
  searchParams,
}: {
  params: Promise<{ number: string }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const { number: raw } = await params
  const orderNumber = decodeURIComponent(raw)
  const loaded = await loadProforma(orderNumber)
  if (!loaded) notFound()
  const { order, items } = loaded

  const query = (await searchParams) ?? {}
  const token = typeof query.t === 'string' ? query.t : null
  const print = query.print === '1'

  // Three ways in, in the order they cost anything to check: the signed link
  // (no session, no query), the member whose order it is, and a staff session.
  // Anything else is a 404 rather than a 403 - order numbers run in sequence, so
  // "wrong token" and "not yours" must look identical from outside.
  let allowed = verifyProformaToken(order.orderNumber, token)
  if (!allowed) {
    const [member, user] = await Promise.all([getMemberFromCookie(), getSessionFromCookie()])
    if (member) allowed = Boolean(order.memberId && order.memberId === member.id)
    if (!allowed && user) allowed = true
  }
  if (!allowed) notFound()

  const config = await getShopConfigCached()
  const ctx = await proformaDocContext(order, items, { print })
  const document = await renderProformaDocument(ctx)
  // Only when printing - see the invoice page for why. The one shared PDF
  // footer, same layout as the invoice.
  const runningFooter = print ? await renderDocumentRunningFooter(ctx) : null

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
                <a className="btn btn-secondary" href={proformaPdfPath(order.orderNumber)}>
                  Download PDF
                </a>
              )}
            </div>
          </div>
        )}
        {document}
      </div>
      <PdfFooterRegion>{runningFooter}</PdfFooterRegion>
    </>
  )
}
