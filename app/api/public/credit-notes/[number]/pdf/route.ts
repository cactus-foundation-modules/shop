import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromCookie } from '@/lib/auth/session'
import { getMemberFromCookie } from '@/lib/members/session'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import { getCreditNoteByNumber } from '@/modules/shop/lib/db/credit-notes'
import { getOrderById } from '@/modules/shop/lib/db/orders'
import { checkInMemoryRateLimit, getClientIpFromRequest } from '@/modules/shop/lib/rate-limit'
import { signCreditNoteToken, verifyCreditNoteToken } from '@/modules/shop/lib/invoice-token'
import { InvoicePdfUnavailableError, invoicePdfFilename, printPath, renderInvoicePdf } from '@/modules/shop/lib/invoice-pdf'

// GET - the credit note as a PDF. The invoice's PDF route with a different
// lookup: same headless browser, same throttle, same three ways in.

export async function GET(request: NextRequest, context: { params: Promise<{ number: string }> }) {
  const ip = getClientIpFromRequest(request)
  if (!checkInMemoryRateLimit(`shp-credit-note-pdf:${ip}`, 5, 60_000)) {
    return NextResponse.json({ error: 'Too many downloads at once, please try again in a minute.' }, { status: 429 })
  }

  const { number: raw } = await context.params
  const creditNoteNumber = decodeURIComponent(raw)
  const note = await getCreditNoteByNumber(creditNoteNumber)
  if (!note) return NextResponse.json({ error: 'We could not find that credit note.' }, { status: 404 })

  let allowed = verifyCreditNoteToken(note.creditNoteNumber, request.nextUrl.searchParams.get('t'))
  if (!allowed) {
    const [member, user] = await Promise.all([getMemberFromCookie(), getSessionFromCookie()])
    if (member) {
      const order = await getOrderById(note.orderId)
      allowed = Boolean(order?.memberId && order.memberId === member.id)
    }
    if (!allowed && user) allowed = true
  }
  if (!allowed) return NextResponse.json({ error: 'We could not find that credit note.' }, { status: 404 })

  const config = await getShopConfigCached()
  if (!config.invoicePdfEnabled) {
    return NextResponse.json({ error: 'PDF downloads are switched off on this shop.' }, { status: 403 })
  }

  try {
    const path = printPath(`/shop/credit-note/${encodeURIComponent(note.creditNoteNumber)}`, signCreditNoteToken(note.creditNoteNumber))
    const pdf = await renderInvoicePdf(path)
    return new NextResponse(pdf as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${invoicePdfFilename(config.creditNotePdfFilenamePrefix, note.creditNoteNumber)}"`,
        // Nothing about this is worth serving from a shared cache with
        // somebody's address in it.
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    if (error instanceof InvoicePdfUnavailableError) {
      console.error('[shop] credit note PDF unavailable:', error.message)
      return NextResponse.json(
        { error: 'This credit note could not be turned into a PDF. The on-screen copy is still available.' },
        { status: 503 },
      )
    }
    console.error('[shop] credit note PDF failed', error)
    return NextResponse.json({ error: 'Something went wrong making that PDF.' }, { status: 500 })
  }
}
