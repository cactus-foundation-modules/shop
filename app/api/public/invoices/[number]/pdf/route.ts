import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromCookie } from '@/lib/auth/session'
import { getMemberFromCookie } from '@/lib/members/session'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import { getInvoiceByNumber } from '@/modules/shop/lib/db/invoices'
import { getOrderById } from '@/modules/shop/lib/db/orders'
import { checkInMemoryRateLimit, getClientIpFromRequest } from '@/modules/shop/lib/rate-limit'
import { signInvoiceToken, verifyInvoiceToken } from '@/modules/shop/lib/invoice-token'
import { InvoicePdfUnavailableError, invoicePdfFilename, renderInvoicePdf } from '@/modules/shop/lib/invoice-pdf'

// GET - the invoice as a PDF. What the button under the document points at.
//
// Printing runs a headless browser, which is heavy enough to be worth throttling
// harder than the read routes: five a minute per address is plenty for somebody
// saving their own invoice and useless to anybody trying to make the box sweat.
//
// Access is the same three ways the invoice page itself allows: the signed link,
// the member whose order it is, or a staff session. Deliberately not behind the
// shop gate - a closed shop still owes people their paperwork.

export async function GET(request: NextRequest, context: { params: Promise<{ number: string }> }) {
  const ip = getClientIpFromRequest(request)
  if (!checkInMemoryRateLimit(`shp-invoice-pdf:${ip}`, 5, 60_000)) {
    return NextResponse.json({ error: 'Too many downloads at once, please try again in a minute.' }, { status: 429 })
  }

  const { number: raw } = await context.params
  const invoiceNumber = decodeURIComponent(raw)
  const invoice = await getInvoiceByNumber(invoiceNumber)
  if (!invoice) return NextResponse.json({ error: 'We could not find that invoice.' }, { status: 404 })

  let allowed = verifyInvoiceToken(invoice.invoiceNumber, request.nextUrl.searchParams.get('t'))
  if (!allowed) {
    const [member, user] = await Promise.all([getMemberFromCookie(), getSessionFromCookie()])
    if (member) {
      const order = await getOrderById(invoice.orderId)
      allowed = Boolean(order?.memberId && order.memberId === member.id)
    }
    if (!allowed && user) allowed = true
  }
  // Same 404 as the page: an invoice number is sequential, so "wrong token" and
  // "not yours" must look identical from outside.
  if (!allowed) return NextResponse.json({ error: 'We could not find that invoice.' }, { status: 404 })

  const config = await getShopConfigCached()
  if (!config.invoicePdfEnabled) {
    return NextResponse.json({ error: 'PDF downloads are switched off on this shop.' }, { status: 403 })
  }

  try {
    // The invoice's own page with `print=1`, so the bar of buttons is left off
    // and a block can drop anything that only makes sense on screen. The token
    // is minted here rather than passed through: the browser doing the printing
    // has no session of its own.
    const path = `/shop/invoice/${encodeURIComponent(invoice.invoiceNumber)}?t=${signInvoiceToken(invoice.invoiceNumber)}&print=1`
    const pdf = await renderInvoicePdf(path)
    return new NextResponse(pdf as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/pdf',
        // `attachment`, so the button saves a file rather than opening a viewer
        // the reader then has to save from.
        'Content-Disposition': `attachment; filename="${invoicePdfFilename(config.invoicePdfFilenamePrefix, invoice.invoiceNumber)}"`,
        // An invoice never changes, but a voided one does, and nothing about
        // this is worth serving from a shared cache with somebody's address in it.
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    if (error instanceof InvoicePdfUnavailableError) {
      // The message says which of the three it was (packs missing, browser will
      // not start, page would not load), and it goes to the deployment log where
      // an owner or a developer can actually read it. The reader gets the plain
      // version, since none of it is their problem to fix.
      console.error('[shop] invoice PDF unavailable:', error.message)
      return NextResponse.json(
        { error: 'This invoice could not be turned into a PDF. The on-screen copy is still available.' },
        { status: 503 },
      )
    }
    console.error('[shop] invoice PDF failed', error)
    return NextResponse.json({ error: 'Something went wrong making that PDF.' }, { status: 500 })
  }
}
