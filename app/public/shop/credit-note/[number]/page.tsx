import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getSessionFromCookie } from '@/lib/auth/session'
import { getMemberFromCookie } from '@/lib/members/session'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import { getCreditNoteByNumber } from '@/modules/shop/lib/db/credit-notes'
import { getOrderById } from '@/modules/shop/lib/db/orders'
import { verifyCreditNoteToken, creditNotePdfPath } from '@/modules/shop/lib/invoice-token'
import { creditNoteDocContext } from '@/modules/shop/lib/invoice-doc-context'
import { renderInvoiceDocument, renderDocumentRunningFooter } from '@/modules/shop/lib/invoice-document'
import { PdfFooterRegion } from '@/modules/shop/lib/doc-page-settings'
import PrintButton from '@/modules/shop/components/public/PrintButton'

export const dynamic = 'force-dynamic'

// The credit note document on its own. Deliberately the invoice page with a
// different lookup: same three readers, same three ways in, same bare chrome,
// and the same `shopInvoice` layout doing the drawing - so an owner who has
// designed their invoice has designed this too, and the two documents cannot
// drift apart.
//
// Not behind the shop gate, for the same reason the invoice is not: a shop that
// has closed for good still has to be able to hand somebody the paperwork for
// money it sent back.

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
    title: `Credit note ${decodeURIComponent(number)}`,
    // Somebody's name, address and what they sent back. Never in a search index.
    robots: { index: false, follow: false },
  }
}

export default async function ShopCreditNotePage({
  params,
  searchParams,
}: {
  params: Promise<{ number: string }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const { number: raw } = await params
  const creditNoteNumber = decodeURIComponent(raw)
  const note = await getCreditNoteByNumber(creditNoteNumber)
  if (!note) notFound()

  const query = (await searchParams) ?? {}
  const token = typeof query.t === 'string' ? query.t : null
  const print = query.print === '1'

  // The signed link, the member whose order it is, or a staff session. Anything
  // else is a 404 rather than a 403 - the numbers run in sequence, so "wrong
  // token" and "not yours" must look identical from outside.
  //
  // The order is loaded either way, and once, exactly as the invoice page does
  // it. It is what says whether the customer has since given a reference for the
  // order - a credit note raised before their finance team produced a purchase
  // order number is one their finance team cannot match to anything.
  const order = await getOrderById(note.orderId)
  let allowed = verifyCreditNoteToken(note.creditNoteNumber, token)
  if (!allowed) {
    const [member, user] = await Promise.all([getMemberFromCookie(), getSessionFromCookie()])
    if (member) allowed = Boolean(order?.memberId && order.memberId === member.id)
    if (!allowed && user) allowed = true
  }
  if (!allowed) notFound()

  const config = await getShopConfigCached()
  // Only ever fills a blank - see withOrderCustomerReference.
  const ctx = creditNoteDocContext(note, { print, orderCustomerReference: order?.customerReference ?? null })
  const document = await renderInvoiceDocument(ctx)
  // The one shared PDF footer, same layout every document uses.
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
                <a
                  className="btn btn-secondary"
                  href={creditNotePdfPath(note.creditNoteNumber)}
                >
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
